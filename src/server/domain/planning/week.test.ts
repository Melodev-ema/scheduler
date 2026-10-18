import {describe, expect, it} from 'vitest';
import {nextWeekStart, parseWeekKey, planningWeekOf, weekKeyOf} from '@/server/domain/planning/week';

describe('weekKeyOf', () => {
    it('donne le lundi de la semaine, le dimanche comptant dans la sienne', () => {
        expect(weekKeyOf(new Date(2026, 9, 18, 15, 47))).toBe('2026-10-12');
    });

    it('garde un lundi tel quel', () => {
        expect(weekKeyOf(new Date(2026, 9, 19))).toBe('2026-10-19');
    });
});

describe('parseWeekKey', () => {
    it('lit un lundi en heure locale, à minuit', () => {
        expect(parseWeekKey('2026-10-19')).toEqual(new Date(2026, 9, 19));
    });

    it('refuse ce qui n’est pas un lundi', () => {
        expect(parseWeekKey('2026-10-21')).toBeNull();
    });

    it('refuse une date inexistante ou mal formée', () => {
        for (const key of ['2026-13-01', '2026-02-30', 'abc', '']) {
            expect(parseWeekKey(key)).toBeNull();
        }
    });
});

describe('nextWeekStart', () => {
    it('donne le lundi suivant, depuis un dimanche', () => {
        expect(nextWeekStart(new Date(2026, 9, 18, 15, 47))).toEqual(new Date(2026, 9, 19));
    });

    it('saute une semaine entière depuis un lundi', () => {
        expect(nextWeekStart(new Date(2026, 9, 19, 0, 0))).toEqual(new Date(2026, 9, 26));
    });
});

describe('planningWeekOf', () => {
    it('préfère le weekStart enregistré', () => {
        const planning = {weekStart: new Date(2026, 9, 19), timestamp: new Date(2026, 9, 18, 16)};
        expect(planningWeekOf(planning)).toEqual(new Date(2026, 9, 19));
    });

    it('retombe sur la semaine du timestamp', () => {
        expect(planningWeekOf({timestamp: new Date(2026, 9, 18, 16)})).toEqual(new Date(2026, 9, 12));
    });

    it('accepte un weekStart en chaîne ISO', () => {
        const weekStart = new Date(2026, 9, 19).toISOString();
        expect(planningWeekOf({weekStart, timestamp: new Date(2026, 9, 18)})).toEqual(new Date(2026, 9, 19));
    });
});
