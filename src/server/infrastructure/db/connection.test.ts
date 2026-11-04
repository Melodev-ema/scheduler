import {beforeEach, describe, expect, it, vi} from 'vitest';

const connect = vi.fn();

vi.mock('mongoose', () => ({default: {connect}}));
vi.mock('@/server/config/env', () => ({getEnv: () => ({mongodbUri: 'mongodb://localhost:27017/test'})}));
vi.mock('@/server/infrastructure/db/plannings', () => ({backfillWeekStart: vi.fn().mockResolvedValue(0)}));

async function loadDbConnect() {
    vi.resetModules();
    delete (globalThis as {mongoose?: unknown}).mongoose;
    return (await import('./connection')).default;
}

describe('dbConnect', () => {
    beforeEach(() => {
        connect.mockReset();
    });

    it('ne se connecte qu\'une fois pour plusieurs requêtes', async () => {
        const connection = {};
        connect.mockResolvedValue(connection);
        const dbConnect = await loadDbConnect();

        await expect(Promise.all([dbConnect(), dbConnect()])).resolves.toEqual([connection, connection]);
        await dbConnect();

        expect(connect).toHaveBeenCalledTimes(1);
    });

    it('abandonne une tentative au bout de 5 s plutôt que des 30 s du driver', async () => {
        connect.mockResolvedValue({});
        const dbConnect = await loadDbConnect();

        await dbConnect();

        expect(connect).toHaveBeenCalledWith('mongodb://localhost:27017/test', {serverSelectionTimeoutMS: 5_000});
    });

    it('retente la connexion après un échec, au lieu de rejouer la même erreur', async () => {
        const connection = {};
        connect.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:27017')).mockResolvedValue(connection);
        const dbConnect = await loadDbConnect();

        await expect(dbConnect()).rejects.toThrow(/ECONNREFUSED/);
        await expect(dbConnect()).resolves.toBe(connection);

        expect(connect).toHaveBeenCalledTimes(2);
    });

    it('fait échouer ensemble les requêtes qui attendaient la même tentative', async () => {
        connect.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:27017'));
        const dbConnect = await loadDbConnect();

        const results = await Promise.allSettled([dbConnect(), dbConnect()]);

        expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
        expect(connect).toHaveBeenCalledTimes(1);
    });
});
