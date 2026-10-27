import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {NextRequest} from 'next/server';
import {weekStartOf} from '@/server/domain/planning/partial';

const writes: string[] = [];

const Planning = {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
};
const Task = {findByIdAndUpdate: vi.fn()};
const latestPlanningOf = vi.fn();

vi.mock('@/server/infrastructure/db/connection', () => ({default: vi.fn().mockResolvedValue(undefined)}));
vi.mock('@/models/Planning', () => ({default: Planning}));
vi.mock('@/models/Task', () => ({default: Task}));
vi.mock('@/server/infrastructure/db/plannings', () => ({latestPlanningOf}));

const PLANNING_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SLOT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const TASK_ID = 'cccccccccccccccccccccccc';
const PREPARED_ID = 'dddddddddddddddddddddddd';

function chain<T>(value: T) {
    return {select: () => ({lean: async () => value}), lean: async () => value};
}

function slot(overrides: Record<string, unknown> = {}) {
    return {_id: SLOT_ID, day: 'lundi', startTime: '09:00', endTime: '10:00', activity: 'Appeler', status: 'pending', ...overrides};
}

function tick(status: 'done' | 'pending' = 'done') {
    return new Request('http://localhost:3000/api/schedule/status', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({status, id: SLOT_ID, planningId: PLANNING_ID}),
    }) as unknown as NextRequest;
}

async function post(status: 'done' | 'pending' = 'done') {
    const {POST} = await import('./route');
    return POST(tick(status));
}

beforeEach(() => {
    writes.length = 0;
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const current = {_id: PLANNING_ID, weekStart: weekStartOf(new Date()), schedule: [slot({taskId: TASK_ID})]};
    Planning.findOne.mockImplementation(() => chain(current));
    Planning.findOneAndUpdate.mockImplementation(async () => {
        writes.push('créneau');
        return {schedule: {id: () => slot({taskId: TASK_ID, status: 'done'})}};
    });
    Planning.updateOne.mockImplementation(async () => {
        writes.push('semaine préparée');
    });
    Task.findByIdAndUpdate.mockImplementation(async () => {
        writes.push('tâche');
    });
    latestPlanningOf.mockImplementation(() => chain({_id: PREPARED_ID}));
});

describe('POST /api/schedule/status', () => {
    it('coche le créneau en dernier, après la tâche et la semaine préparée', async () => {
        const response = await post('done');

        expect(response.status).toBe(200);
        expect(writes).toEqual(['tâche', 'semaine préparée', 'créneau']);
    });

    it('ne coche pas le créneau quand la tâche n\'a pas pu suivre', async () => {
        Task.findByIdAndUpdate.mockRejectedValue(new Error('connexion perdue'));

        const response = await post('done');

        expect(response.status).toBe(500);
        expect(writes).not.toContain('créneau');
    });

    it('ne coche pas le créneau quand la semaine préparée n\'a pas pu être nettoyée', async () => {
        Planning.updateOne.mockRejectedValue(new Error('connexion perdue'));

        const response = await post('done');

        expect(response.status).toBe(500);
        expect(writes).toEqual(['tâche']);
    });

    it('décoche sans toucher à la semaine préparée', async () => {
        await post('pending');

        expect(writes).toEqual(['tâche', 'créneau']);
    });

    it('refuse un créneau d\'une autre semaine sans rien écrire', async () => {
        const past = {_id: PLANNING_ID, weekStart: new Date(2020, 0, 6), schedule: [slot({taskId: TASK_ID})]};
        Planning.findOne.mockImplementation(() => chain(past));

        const response = await post('done');

        expect(response.status).toBe(409);
        expect(writes).toEqual([]);
    });

    it('répond 404 sans rien écrire quand le créneau n\'existe pas', async () => {
        Planning.findOne.mockImplementation(() => chain(null));

        const response = await post('done');

        expect(response.status).toBe(404);
        expect(writes).toEqual([]);
    });
});
