import {describe, expect, it, vi} from 'vitest';
import type {PlanningInterface} from '@/models/Planning';
import type {WeekData} from '@/components/planning/weekData';
import {createWeekStore} from '@/components/planning/weekStore';

function data(overrides: Partial<WeekData> = {}): WeekData {
    return {
        planning: {_id: 'p1', schedule: []} as unknown as PlanningInterface,
        activities: [],
        weeks: ['2026-10-26'],
        loaded: true,
        failed: false,
        ...overrides,
    };
}

function deferred() {
    let resolve!: (value: WeekData) => void;
    const promise = new Promise<WeekData>((done) => {
        resolve = done;
    });
    return {promise, resolve};
}

describe('createWeekStore', () => {
    it('relit une semaine déjà en mémoire quand on la recharge, sans attendre d\'abonné', async () => {
        const fetchWeek = vi.fn().mockResolvedValueOnce(data()).mockResolvedValueOnce(data({failed: true}));
        const store = createWeekStore(fetchWeek);

        await store.load();
        await store.load();

        expect(fetchWeek).toHaveBeenCalledTimes(2);
        expect(store.snapshot()?.failed).toBe(true);
    });

    it('ne lance qu\'une requête pour plusieurs lecteurs de la même semaine', async () => {
        const fetchWeek = vi.fn().mockResolvedValue(data());
        const store = createWeekStore(fetchWeek);

        await Promise.all([store.load(), store.load()]);

        expect(fetchWeek).toHaveBeenCalledTimes(1);
        expect(store.snapshot()).toEqual(data());
    });

    it('garde chaque semaine sous sa propre clé', async () => {
        const fetchWeek = vi.fn((week?: string) => Promise.resolve(data({week})));
        const store = createWeekStore(fetchWeek);

        await Promise.all([store.load(), store.load('2026-10-19')]);

        expect(store.snapshot()?.week).toBeUndefined();
        expect(store.snapshot('2026-10-19')?.week).toBe('2026-10-19');
    });

    it('relit une fois de plus quand on redemande pendant une lecture, pour ne pas garder un état dépassé', async () => {
        const first = deferred();
        const fetchWeek = vi.fn()
            .mockReturnValueOnce(first.promise)
            .mockResolvedValueOnce(data({failed: true}));
        const store = createWeekStore(fetchWeek);

        const loading = store.load();
        void store.refresh();
        void store.refresh();
        first.resolve(data());
        await loading;
        await vi.waitFor(() => expect(store.snapshot()?.failed).toBe(true));

        expect(fetchWeek).toHaveBeenCalledTimes(2);
    });

    it('prévient les abonnés de la semaine chargée, et seulement eux', async () => {
        const store = createWeekStore(vi.fn().mockResolvedValue(data()));
        const current = vi.fn();
        const other = vi.fn();
        store.subscribe(undefined, current);
        store.subscribe('2026-10-19', other);

        await store.load();

        expect(current).toHaveBeenCalledTimes(1);
        expect(other).not.toHaveBeenCalled();
    });

    it('partage une modification optimiste avec tous les abonnés de la semaine', async () => {
        const store = createWeekStore(vi.fn().mockResolvedValue(data()));
        await store.load();
        const header = vi.fn();
        const page = vi.fn();
        store.subscribe(undefined, header);
        store.subscribe(undefined, page);

        store.update(undefined, (planning) => ({...planning, note: 'cochée'}));

        expect(store.snapshot()?.planning?.note).toBe('cochée');
        expect(header).toHaveBeenCalledTimes(1);
        expect(page).toHaveBeenCalledTimes(1);
    });

    it('ne recharge que les semaines encore regardées', async () => {
        const fetchWeek = vi.fn((week?: string) => Promise.resolve(data({week})));
        const store = createWeekStore(fetchWeek);
        store.subscribe(undefined, () => {});
        const unsubscribe = store.subscribe('2026-10-19', () => {});
        unsubscribe();

        store.reloadWatched();
        await vi.waitFor(() => expect(store.snapshot()).toBeDefined());

        expect(fetchWeek.mock.calls).toEqual([[undefined]]);
    });

    it('garde les dernières semaines connues pendant le chargement d\'une autre', async () => {
        const store = createWeekStore(vi.fn().mockResolvedValue(data({weeks: ['2026-10-19', '2026-10-26']})));

        await store.load();

        expect(store.snapshot('2026-10-12')).toBeUndefined();
        expect(store.lastWeeks()).toEqual(['2026-10-19', '2026-10-26']);
    });
});
