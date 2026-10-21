import {describe, expect, it} from 'vitest';
import {MAX_BODY_BYTES} from './apiResponse';
import {guardRequest, hostnameOf, isAllowedHost, isBodyTooLarge, isForeignWrite} from './requestGuard';

const HOST = 'localhost:3000';

describe('hostnameOf', () => {
    it.each([
        ['localhost:3000', 'localhost'],
        ['127.0.0.1', '127.0.0.1'],
        ['[::1]:3000', '[::1]'],
        ['LocalHost:3000', 'localhost'],
    ])('lit %s comme %s', (host, expected) => {
        expect(hostnameOf(host)).toBe(expected);
    });
});

describe('isAllowedHost', () => {
    it.each(['localhost:3000', '127.0.0.1:3000', '[::1]:3000', 'localhost'])('accepte %s', (host) => {
        expect(isAllowedHost(host)).toBe(true);
    });

    it.each(['rebind.evil.example:3000', 'localhost.evil.example', '127.0.0.1.nip.io:3000', ''])('refuse %s', (host) => {
        expect(isAllowedHost(host)).toBe(false);
    });
});

describe('isForeignWrite', () => {
    it.each(['GET', 'HEAD', 'OPTIONS', 'get'])('laisse passer un %s, même venu d\'ailleurs', (method) => {
        expect(isForeignWrite({method, secFetchSite: 'cross-site', origin: 'https://evil.example', host: HOST})).toBe(false);
    });

    it('laisse passer une écriture de l\'app elle-même', () => {
        expect(isForeignWrite({method: 'POST', secFetchSite: 'same-origin', origin: 'http://localhost:3000', host: HOST}))
            .toBe(false);
    });

    it('refuse une écriture postée depuis un autre site', () => {
        expect(isForeignWrite({method: 'POST', secFetchSite: 'cross-site', origin: 'https://evil.example', host: HOST}))
            .toBe(true);
    });

    it('refuse une écriture d\'une autre app de localhost (même site, autre port)', () => {
        expect(isForeignWrite({method: 'POST', secFetchSite: 'same-site', origin: 'http://localhost:5173', host: HOST}))
            .toBe(true);
    });

    it('laisse passer un client hors navigateur, sans Sec-Fetch-Site ni Origin (curl)', () => {
        expect(isForeignWrite({method: 'POST', secFetchSite: null, origin: null, host: HOST})).toBe(false);
    });

    it('refuse une écriture d\'une origine opaque (iframe sandboxée, fichier local)', () => {
        expect(isForeignWrite({method: 'POST', secFetchSite: null, origin: 'null', host: HOST})).toBe(true);
    });

    it('sans Sec-Fetch-Site, juge sur l\'Origin : la même que l\'app passe', () => {
        expect(isForeignWrite({method: 'DELETE', secFetchSite: null, origin: 'http://localhost:3000', host: HOST}))
            .toBe(false);
    });

    it('sans Sec-Fetch-Site, juge sur l\'Origin : une autre est refusée', () => {
        expect(isForeignWrite({method: 'POST', secFetchSite: null, origin: 'https://evil.example', host: HOST}))
            .toBe(true);
    });
});

describe('isBodyTooLarge', () => {
    it('accepte un corps à la limite', () => {
        expect(isBodyTooLarge(String(MAX_BODY_BYTES))).toBe(false);
    });

    it('refuse un corps au-delà de la limite', () => {
        expect(isBodyTooLarge(String(MAX_BODY_BYTES + 1))).toBe(true);
    });

    it('laisse à readJsonBody un corps sans longueur annoncée ou illisible', () => {
        expect(isBodyTooLarge(null)).toBe(false);
        expect(isBodyTooLarge('beaucoup')).toBe(false);
    });
});

describe('guardRequest', () => {
    function request(path: string, init: RequestInit & {headers?: Record<string, string>} = {}) {
        return new Request(`http://localhost:3000${path}`, {
            ...init,
            headers: {host: HOST, ...init.headers},
        });
    }

    it('laisse passer une lecture ordinaire', () => {
        expect(guardRequest(request('/api/activity'))).toBeNull();
    });

    it('refuse un Host étranger en 403, pages comprises', async () => {
        const response = guardRequest(request('/', {headers: {host: 'rebind.evil.example:3000'}}));

        expect(response?.status).toBe(403);
        await expect(response?.json()).resolves.toEqual({error: 'Hôte non autorisé'});
    });

    it('refuse une écriture venue d\'un autre site en 403', async () => {
        const response = guardRequest(request('/api/generate_weekly_planning', {
            method: 'POST',
            headers: {'sec-fetch-site': 'cross-site', origin: 'https://evil.example', 'content-type': 'text/plain'},
            body: '{"week":"current"}',
        }));

        expect(response?.status).toBe(403);
        await expect(response?.json()).resolves.toEqual({error: 'Origine non autorisée'});
    });

    it('refuse un corps annoncé trop gros en 413', () => {
        const response = guardRequest(request('/api/activity', {
            method: 'POST',
            headers: {'sec-fetch-site': 'same-origin', 'content-length': String(MAX_BODY_BYTES + 1)},
        }));

        expect(response?.status).toBe(413);
    });
});
