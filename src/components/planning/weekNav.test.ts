import {describe, expect, it} from 'vitest';
import {neighbours, weekKindOf} from '@/components/planning/weekNav';

// Dimanche 18 octobre 2026, 15:47 : la semaine en cours commence le lundi 12.
const now = new Date(2026, 9, 18, 15, 47);

describe('weekKindOf', () => {
    it('reconnaît la semaine en cours', () => {
        expect(weekKindOf('2026-10-12', now)).toBe('current');
    });

    it('reconnaît la semaine préparée', () => {
        expect(weekKindOf('2026-10-19', now)).toBe('prepared');
    });

    it('reconnaît une semaine passée', () => {
        expect(weekKindOf('2026-10-05', now)).toBe('past');
    });
});

describe('neighbours', () => {
    const weeks = ['2026-09-21', '2026-10-12', '2026-10-19'];

    it('saute les semaines sans planning', () => {
        expect(neighbours('2026-10-12', weeks, now)).toEqual({previous: '2026-09-21', next: '2026-10-19'});
    });

    it('ne va pas au-delà de la semaine préparée', () => {
        expect(neighbours('2026-10-19', weeks, now).next).toBeNull();
    });

    it('garde la semaine en cours atteignable sans planning', () => {
        expect(neighbours('2026-09-21', ['2026-09-21'], now).next).toBe('2026-10-12');
    });

    it('n’a rien avant le plus ancien planning', () => {
        expect(neighbours('2026-09-21', weeks, now).previous).toBeNull();
    });
});
