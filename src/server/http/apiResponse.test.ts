import {describe, expect, it, vi} from 'vitest';
import {z} from 'zod';
import {fail, invalidInput, readJsonBody, serverError} from './apiResponse';

describe('fail', () => {
    it('rend le statut demandé et la forme {error}', async () => {
        const response = fail(404, 'Activité introuvable');

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toEqual({error: 'Activité introuvable'});
    });

    it('accepte des en-têtes supplémentaires', () => {
        const response = fail(429, 'Trop de générations', {'Retry-After': '900'});

        expect(response.headers.get('Retry-After')).toBe('900');
    });

    it('ajoute des champs au corps', async () => {
        const response = fail(409, 'x', undefined, {nextWeek: '2026-10-19'});

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toEqual({error: 'x', nextWeek: '2026-10-19'});
    });

    it('garde toujours son propre message dans error', async () => {
        const body = await fail(409, 'x', undefined, {error: 'y'}).json();

        expect(body.error).toBe('x');
    });
});

describe('invalidInput', () => {
    it('rend 400 et cite le chemin de chaque problème', async () => {
        const schema = z.object({priority: z.number()});
        const parsed = schema.safeParse({priority: 'haute'});

        // Le test n'a de sens que sur un échec de validation.
        expect(parsed.success).toBe(false);
        const response = invalidInput(parsed.error!);

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Requête invalide');
        expect(body.details).toHaveLength(1);
        expect(body.details[0]).toMatch(/^priority : /);
    });

    it('omet le séparateur quand le problème est à la racine', async () => {
        const parsed = z.string().safeParse(42);

        expect(parsed.success).toBe(false);
        const body = await invalidInput(parsed.error!).json();

        expect(body.details[0]).not.toContain(' : ');
    });
});

describe('serverError', () => {
    it('journalise le détail et n\'en renvoie rien', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => {
        });
        const response = serverError('GET /api/activity', new Error('E11000 duplicate key'));

        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({error: 'Erreur interne du serveur'});
        expect(logged).toHaveBeenCalled();
        // Le contexte et l'erreur partent en deux arguments distincts : c'est ce
        // qui fait imprimer la pile par Node, au lieu d'un « Error: … » aplati.
        expect(logged.mock.calls[0][0]).toContain('GET /api/activity');
        expect(logged.mock.calls[0][1]).toBeInstanceOf(Error);
        expect((logged.mock.calls[0][1] as Error).message).toContain('E11000');
        logged.mockRestore();
    });
});

describe('readJsonBody', () => {
    function jsonRequest(body?: BodyInit, contentType = 'application/json') {
        return new Request('http://localhost/api/activity', {
            method: 'POST',
            headers: {'content-type': contentType},
            body,
            ...(body instanceof ReadableStream ? {duplex: 'half'} : {}),
        } as RequestInit);
    }

    it('rend l\'objet quand le corps est du JSON valide', async () => {
        await expect(readJsonBody(jsonRequest(JSON.stringify({name: 'Sport'})))).resolves.toEqual({name: 'Sport'});
    });

    it('accepte un charset dans le Content-Type', async () => {
        const request = jsonRequest('{"name":"Sport"}', 'application/json; charset=utf-8');

        await expect(readJsonBody(request)).resolves.toEqual({name: 'Sport'});
    });

    it('rend undefined sur un corps vide, pour que Zod produise un 400 et non un 500', async () => {
        await expect(readJsonBody(jsonRequest())).resolves.toBeUndefined();
    });

    it('rend undefined sur un corps mal formé', async () => {
        await expect(readJsonBody(jsonRequest('{ceci n\'est pas du json'))).resolves.toBeUndefined();
    });

    it('ignore un corps text/plain, celui qu\'un autre site peut poster sans preflight', async () => {
        const request = new Request('http://localhost/api/activity', {method: 'POST', body: '{"name":"Intrus"}'});

        expect(request.headers.get('content-type')).toMatch(/^text\/plain/);
        await expect(readJsonBody(request)).resolves.toBeUndefined();
    });

    it('rend undefined au-delà de la limite', async () => {
        await expect(readJsonBody(jsonRequest('{"name":"Sport"}'), 10)).resolves.toBeUndefined();
    });

    it('cesse de lire un flux sans longueur annoncée dès la limite franchie', async () => {
        let pulled = 0;
        const stream = new ReadableStream<Uint8Array>({
            pull(controller) {
                pulled++;
                controller.enqueue(new TextEncoder().encode('x'.repeat(64)));
            },
        });

        await expect(readJsonBody(jsonRequest(stream), 100)).resolves.toBeUndefined();
        expect(pulled).toBeLessThan(5);
    });
});
