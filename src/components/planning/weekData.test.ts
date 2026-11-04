import {describe, expect, it} from 'vitest';
import type {PlanningInterface} from '@/models/Planning';
import type {ActivityInterface} from '@/models/Activity';
import {HttpError} from '@/services/ApiService';
import {weekDataOf, WeekResults} from '@/components/planning/weekData';

const PLANNING = {_id: 'p1', schedule: []} as unknown as PlanningInterface;
const ACTIVITY = {_id: 'a1', name: 'Sport'} as unknown as ActivityInterface;

function fulfilled<T>(value: T): PromiseFulfilledResult<T> {
    return {status: 'fulfilled', value};
}

function rejected(reason: unknown): PromiseRejectedResult {
    return {status: 'rejected', reason};
}

function results(overrides: Partial<{planning: WeekResults[0]; activities: WeekResults[1]; weeks: WeekResults[2]}> = {}): WeekResults {
    return [
        overrides.planning ?? fulfilled(PLANNING),
        overrides.activities ?? fulfilled({data: [ACTIVITY]}),
        overrides.weeks ?? fulfilled({weeks: ['2026-10-26']}),
    ];
}

describe('weekDataOf', () => {
    it('rend la semaine, les activités et les semaines planifiées', () => {
        expect(weekDataOf(results(), '2026-10-26')).toEqual({
            planning: PLANNING, activities: [ACTIVITY], weeks: ['2026-10-26'], loaded: true, failed: false, week: '2026-10-26',
        });
    });

    it('lit un 404 du planning comme une semaine vide, pas comme une panne', () => {
        const data = weekDataOf(results({planning: rejected(new HttpError(404, 'HTTP error! status: 404'))}));

        expect(data.planning).toBeNull();
        expect(data.failed).toBe(false);
    });

    it('signale une panne quand le planning ne se lit pas pour une autre raison', () => {
        const data = weekDataOf(results({planning: rejected(new HttpError(500, 'HTTP error! status: 500'))}));

        expect(data.planning).toBeNull();
        expect(data.failed).toBe(true);
    });

    it('signale une panne quand le réseau ne répond pas', () => {
        expect(weekDataOf(results({planning: rejected(new TypeError('Failed to fetch'))})).failed).toBe(true);
    });

    it('signale une panne quand les activités ne se lisent pas, même avec un planning', () => {
        const data = weekDataOf(results({activities: rejected(new HttpError(500, 'HTTP error! status: 500'))}));

        expect(data.planning).toBe(PLANNING);
        expect(data.activities).toEqual([]);
        expect(data.failed).toBe(true);
    });

    it('ne fait pas d\'une navigation indisponible une panne', () => {
        const data = weekDataOf(results({weeks: rejected(new HttpError(500, 'HTTP error! status: 500'))}));

        expect(data.weeks).toEqual([]);
        expect(data.failed).toBe(false);
    });
});
