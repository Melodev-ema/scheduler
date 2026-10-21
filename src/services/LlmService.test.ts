import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {generateWeeklyPlanning, LlmTruncatedError} from './LlmService';

vi.mock('@/server/config/env', () => ({
    getEnv: () => ({llmApiKey: 'clé-de-test', llmBaseUrl: 'https://llm.test/v1', llmModel: 'modele-de-test'}),
}));

function completion(content: string, finishReason = 'stop', usage: object = {prompt_tokens: 1200, completion_tokens: 900}) {
    return new Response(JSON.stringify({choices: [{message: {content}, finish_reason: finishReason}], usage}), {status: 200});
}

const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function sentBody() {
    const [url, init] = fetchMock.mock.calls[0];
    return {url, init, body: JSON.parse(init.body)};
}

describe('generateWeeklyPlanning', () => {
    it('appelle chat/completions du fournisseur configuré, avec la clé', async () => {
        fetchMock.mockResolvedValue(completion('{"schedule":[]}'));

        await generateWeeklyPlanning('{"jours":[]}');

        const {url, init} = sentBody();
        expect(url).toBe('https://llm.test/v1/chat/completions');
        expect(init.headers.Authorization).toBe('Bearer clé-de-test');
    });

    it('envoie des contenus en chaîne et max_tokens, que les couches compatibles exigent', async () => {
        fetchMock.mockResolvedValue(completion('{"schedule":[]}'));

        await generateWeeklyPlanning('{"jours":[]}');

        const {body} = sentBody();
        expect(body.model).toBe('modele-de-test');
        expect(body.messages.map((message: {role: string}) => message.role)).toEqual(['system', 'user']);
        expect(body.messages.every((message: {content: unknown}) => typeof message.content === 'string')).toBe(true);
        expect(body.messages[1].content).toBe('{"jours":[]}');
        expect(body).toHaveProperty('max_tokens');
        expect(body).not.toHaveProperty('max_completion_tokens');
    });

    it('ajoute la réponse précédente et la demande de correction', async () => {
        fetchMock.mockResolvedValue(completion('{"schedule":[]}'));

        await generateWeeklyPlanning('{"jours":[]}', {correction: {previous: '{"schedule":[1]}', request: 'Corrige'}});

        const {body} = sentBody();
        expect(body.messages.slice(2)).toEqual([
            {role: 'assistant', content: '{"schedule":[1]}'},
            {role: 'user', content: 'Corrige'},
        ]);
    });

    it('rend le contenu de la réponse', async () => {
        fetchMock.mockResolvedValue(completion('{"schedule":[]}'));

        await expect(generateWeeklyPlanning('{}')).resolves.toBe('{"schedule":[]}');
    });

    it('journalise la fin de la réponse et les tokens consommés', async () => {
        fetchMock.mockResolvedValue(completion('{}', 'stop', {
            prompt_tokens: 1200, completion_tokens: 900, completion_tokens_details: {reasoning_tokens: 400},
        }));

        await generateWeeklyPlanning('{}');

        expect(console.info).toHaveBeenCalledWith(expect.stringMatching(/fin stop, entrée 1200, sortie 900, raisonnement 400/));
    });

    it('signale une réponse tronquée au lieu de la rendre, sans la redemander', async () => {
        fetchMock.mockResolvedValue(completion('{"schedule":[{"day":', 'length'));

        await expect(generateWeeklyPlanning('{}')).rejects.toBeInstanceOf(LlmTruncatedError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
