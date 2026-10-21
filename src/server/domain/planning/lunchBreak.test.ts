import {describe, expect, it} from 'vitest';
import {
    DEFAULT_LUNCH_BREAK, groupSessions, isSplitAroundLunch, lunchBreakOf, numberParts, overlapsLunch, validateLunchBreak,
} from '@/server/domain/planning/lunchBreak';
import {ScheduleSlot} from '@/server/domain/planning/parseSchedule';

function slot(overrides: Partial<ScheduleSlot> = {}): ScheduleSlot {
    return {day: 'lundi', startTime: '09:00', endTime: '10:00', activity: 'Sport', description: '', ...overrides};
}

const LATE = {start: '13:00', end: '14:00'};

describe('overlapsLunch', () => {
    it('détecte un créneau qui empiète sur la pause, même d\'une minute', () => {
        expect(overlapsLunch('12:00', '12:31', DEFAULT_LUNCH_BREAK)).toBe(true);
        expect(overlapsLunch('13:59', '15:00', DEFAULT_LUNCH_BREAK)).toBe(true);
        expect(overlapsLunch('12:45', '13:15', DEFAULT_LUNCH_BREAK)).toBe(true);
    });

    it('laisse passer un créneau qui touche la pause sans y entrer', () => {
        expect(overlapsLunch('11:30', '12:30', DEFAULT_LUNCH_BREAK)).toBe(false);
        expect(overlapsLunch('14:00', '15:00', DEFAULT_LUNCH_BREAK)).toBe(false);
    });

    it('suit la pause réglée, pas celle par défaut', () => {
        expect(overlapsLunch('12:30', '13:00', LATE)).toBe(false);
        expect(overlapsLunch('12:30', '13:30', LATE)).toBe(true);
    });

    it('ne voit aucun chevauchement sans pause', () => {
        expect(overlapsLunch('12:00', '14:00', null)).toBe(false);
    });
});

describe('isSplitAroundLunch', () => {
    it('accepte une partie avant la pause et une après', () => {
        expect(isSplitAroundLunch(slot({startTime: '11:00', endTime: '12:30'}), slot({startTime: '14:00', endTime: '15:30'}), DEFAULT_LUNCH_BREAK))
            .toBe(true);
    });

    it('tolère une courte marge de part et d\'autre de la pause', () => {
        expect(isSplitAroundLunch(slot({startTime: '10:30', endTime: '12:00'}), slot({startTime: '14:30', endTime: '16:00'}), DEFAULT_LUNCH_BREAK))
            .toBe(true);
    });

    it('refuse deux parties trop éloignées de la pause', () => {
        expect(isSplitAroundLunch(slot({startTime: '09:00', endTime: '10:30'}), slot({startTime: '15:00', endTime: '16:30'}), DEFAULT_LUNCH_BREAK))
            .toBe(false);
    });

    it('refuse deux parties du même côté de la pause', () => {
        expect(isSplitAroundLunch(slot(), slot({startTime: '11:00', endTime: '12:00'}), DEFAULT_LUNCH_BREAK)).toBe(false);
    });

    it('encadre la pause réglée', () => {
        expect(isSplitAroundLunch(slot({startTime: '11:30', endTime: '13:00'}), slot({startTime: '14:00', endTime: '15:00'}), LATE))
            .toBe(true);
    });

    it('ne reconnaît aucune coupure sans pause', () => {
        expect(isSplitAroundLunch(slot({startTime: '11:00', endTime: '12:30'}), slot({startTime: '14:00', endTime: '15:30'}), null))
            .toBe(false);
    });
});

describe('validateLunchBreak', () => {
    it('accepte la pause par défaut', () => {
        expect(validateLunchBreak(DEFAULT_LUNCH_BREAK)).toEqual([]);
    });

    it('refuse une heure mal formée', () => {
        expect(validateLunchBreak({start: '9:30', end: '14:00'})).toEqual([expect.stringMatching(/heure invalide/i)]);
    });

    it('refuse une fin qui ne suit pas le début', () => {
        expect(validateLunchBreak({start: '14:00', end: '14:00'})).toEqual([expect.stringMatching(/après le début/i)]);
    });

    it('refuse une pause hors de 09:00–18:00', () => {
        expect(validateLunchBreak({start: '08:30', end: '09:30'})).toEqual([expect.stringMatching(/entre 09:00 et 18:00/)]);
        expect(validateLunchBreak({start: '17:30', end: '18:30'})).toEqual([expect.stringMatching(/entre 09:00 et 18:00/)]);
    });
});

describe('lunchBreakOf', () => {
    it('donne la pause par défaut quand le champ est absent', () => {
        expect(lunchBreakOf({})).toEqual(DEFAULT_LUNCH_BREAK);
    });

    it('garde une pause désactivée', () => {
        expect(lunchBreakOf({lunchBreak: null})).toBeNull();
    });

    it('rend la pause enregistrée', () => {
        expect(lunchBreakOf({lunchBreak: LATE})).toEqual(LATE);
    });
});

describe('numberParts', () => {
    it('numérote 1/1 une séance d\'un seul tenant', () => {
        expect(numberParts([slot()], DEFAULT_LUNCH_BREAK)).toEqual([{...slot(), part: 1, parts: 1}]);
    });

    it('numérote dans l\'ordre des heures les deux parties d\'une séance coupée', () => {
        const afternoon = slot({startTime: '14:00', endTime: '15:00'});
        const morning = slot({startTime: '11:30', endTime: '12:30'});
        expect(numberParts([afternoon, morning], DEFAULT_LUNCH_BREAK)).toEqual([
            {...afternoon, part: 2, parts: 2},
            {...morning, part: 1, parts: 2},
        ]);
    });

    it('ne rapproche ni deux jours, ni deux activités', () => {
        const parts = numberParts([slot(), slot({day: 'mardi'}), slot({activity: 'Piano', startTime: '14:00', endTime: '15:00'})], DEFAULT_LUNCH_BREAK);
        expect(parts.map((p) => p.parts)).toEqual([1, 1, 1]);
    });

    it('sans pause, deux créneaux du même jour restent chacun 1/1', () => {
        const a = slot({startTime: '11:30', endTime: '12:30'});
        const b = slot({startTime: '14:00', endTime: '15:00'});
        expect(numberParts([a, b], null).map((p) => [p.part, p.parts])).toEqual([[1, 1], [1, 1]]);
    });

    it('deux créneaux qui n\'encadrent pas la pause restent chacun 1/1', () => {
        const a = slot({startTime: '09:00', endTime: '10:00'});
        const b = slot({startTime: '16:00', endTime: '17:00'});
        expect(numberParts([a, b], DEFAULT_LUNCH_BREAK).map((p) => [p.part, p.parts])).toEqual([[1, 1], [1, 1]]);
    });

    it('trois créneaux d\'une même activité le même jour restent chacun 1/1', () => {
        const slots = [slot(), slot({startTime: '11:30', endTime: '12:30'}), slot({startTime: '14:00', endTime: '15:00'})];
        expect(numberParts(slots, DEFAULT_LUNCH_BREAK).map((p) => p.parts)).toEqual([1, 1, 1]);
    });

    it('ne prend pas deux tâches de même titre autour de la pause pour une séance coupée', () => {
        const slots = [
            slot({activity: 'Appeler', startTime: '11:30', endTime: '12:30', ref: 't1'}),
            slot({activity: 'Appeler', startTime: '14:00', endTime: '15:00', ref: 't2'}),
        ];
        expect(numberParts(slots, DEFAULT_LUNCH_BREAK).map((p) => [p.part, p.parts])).toEqual([[1, 1], [1, 1]]);
    });

    it('numérote 1/2 et 2/2 les deux moitiés d\'une même tâche', () => {
        const slots = [
            slot({activity: 'Appeler', startTime: '11:30', endTime: '12:30', ref: 't1'}),
            slot({activity: 'Appeler', startTime: '14:00', endTime: '15:00', ref: 't1'}),
        ];
        expect(numberParts(slots, DEFAULT_LUNCH_BREAK).map((p) => [p.part, p.parts])).toEqual([[1, 2], [2, 2]]);
    });
});

describe('groupSessions', () => {
    it('groupe les créneaux d\'une activité par jour', () => {
        const groups = groupSessions([slot(), slot({startTime: '14:00'}), slot({day: 'mardi'})]);
        expect(groups.map((group) => group.length)).toEqual([2, 1]);
    });

    it('sépare deux tâches de même titre', () => {
        const groups = groupSessions([slot({activity: 'Appeler', ref: 't1'}), slot({activity: 'Appeler', ref: 't2'})]);
        expect(groups.map((group) => group.length)).toEqual([1, 1]);
    });

    it('sépare une activité et une tâche de même nom', () => {
        const groups = groupSessions([slot({activity: 'Sport'}), slot({activity: 'Sport', ref: 't1'})]);
        expect(groups.map((group) => group.length)).toEqual([1, 1]);
    });

    it('groupe les moitiés d\'une tâche par sa ref, même si le modèle a varié son titre', () => {
        const groups = groupSessions([slot({activity: 'Appeler', ref: 't1'}), slot({activity: 'Appeler Paul', ref: 't1'})]);
        expect(groups.map((group) => group.length)).toEqual([2]);
    });
});
