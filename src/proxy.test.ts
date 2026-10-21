import {describe, expect, it} from 'vitest';
import {NextRequest} from 'next/server';
import {unstable_doesMiddlewareMatch} from 'next/experimental/testing/server';
import {config, proxy} from './proxy';

describe('config.matcher', () => {
    it.each(['/api/activity', '/api/generate_weekly_planning', '/api/schedule/status', '/', '/activity'])(
        'fait passer %s par le proxy',
        (url) => {
            expect(unstable_doesMiddlewareMatch({config, url})).toBe(true);
        },
    );

    it.each(['/_next/static/chunks/main.js', '/favicon.ico'])('laisse %s de côté', (url) => {
        expect(unstable_doesMiddlewareMatch({config, url})).toBe(false);
    });
});

describe('proxy', () => {
    function request(path: string, headers: Record<string, string> = {}, init: {method?: string; body?: string} = {}) {
        return new NextRequest(`http://localhost:3000${path}`, {...init, headers: {host: 'localhost:3000', ...headers}});
    }

    it('refuse un Host étranger sur l\'API', () => {
        expect(proxy(request('/api/activity', {host: 'rebind.evil.example:3000'})).status).toBe(403);
    });

    it('refuse une écriture d\'un autre site sur l\'API', () => {
        const response = proxy(request(
            '/api/activity',
            {'sec-fetch-site': 'cross-site', origin: 'https://evil.example', 'content-type': 'text/plain'},
            {method: 'POST', body: '{"name":"Intrus"}'},
        ));
        expect(response.status).toBe(403);
    });

    it('laisse passer l\'API sans y poser de CSP', () => {
        const response = proxy(request('/api/activity'));
        expect(response.headers.get('x-middleware-next')).toBe('1');
        expect(response.headers.get('content-security-policy')).toBeNull();
    });

    it('pose la CSP sur une page', () => {
        expect(proxy(request('/')).headers.get('content-security-policy')).toMatch(/nonce-/);
    });
});
