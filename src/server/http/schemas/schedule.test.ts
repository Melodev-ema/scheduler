import {describe, expect, it} from 'vitest';
import {generateBodySchema, weekQuerySchema} from './schedule';

describe('weekQuerySchema', () => {
    it('transforme une semaine valide en Date', () => {
        const parsed = weekQuerySchema.safeParse({week: '2026-10-19'});
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.week).toEqual(new Date(2026, 9, 19));
        }
    });

    it('accepte l\'absence de semaine', () => {
        const parsed = weekQuerySchema.safeParse({});
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.week).toBeUndefined();
        }
    });

    it.each(['2026-10-21', '2026-13-01', 'x'])('refuse %s', (week) => {
        const parsed = weekQuerySchema.safeParse({week});
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.issues.map(issue => issue.message).join()).toMatch(/semaine invalide/);
        }
    });
});

describe('generateBodySchema', () => {
    it('refuse un corps absent (la route passe {} à sa place)', () => {
        expect(generateBodySchema.safeParse(undefined).success).toBe(false);
    });

    it('prend la semaine en cours par défaut', () => {
        const parsed = generateBodySchema.safeParse({});
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.week).toBe('current');
        }
    });

    it('accepte la semaine suivante', () => {
        const parsed = generateBodySchema.safeParse({week: 'next'});
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.week).toBe('next');
        }
    });

    it('refuse une autre semaine', () => {
        expect(generateBodySchema.safeParse({week: 'later'}).success).toBe(false);
    });
});
