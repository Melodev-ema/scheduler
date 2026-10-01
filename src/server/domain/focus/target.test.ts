import {describe, expect, it} from 'vitest';
import {canFocus, isFocusOn, relinkTarget, targetOf} from '@/server/domain/focus/target';

// Jeudi 1er octobre 2026, 10h.
const NOW = new Date(2026, 9, 1, 10, 0);
const PLANNING = {
    _id: 'p1',
    timestamp: new Date(2026, 8, 28, 8, 0),
    activities: [{name: 'Portfolio', priority: 1}],
};

function slot(overrides = {}) {
    return {_id: 's1', day: 'jeudi', startTime: '09:30', endTime: '11:30', activity: 'Portfolio', status: 'pending', ...overrides};
}

describe('canFocus', () => {
    it('accepte le créneau à faire d’aujourd’hui', () => {
        expect(canFocus(slot(), PLANNING, NOW)).toBe(true);
    });

    it('accepte un créneau verrouillé ou à venir dans la journée', () => {
        const locked = {...slot({startTime: '18:00', endTime: '18:45'}), locked: true};
        expect(canFocus(locked, PLANNING, NOW)).toBe(true);
    });

    it('refuse un créneau déjà fait', () => {
        expect(canFocus(slot({status: 'done'}), PLANNING, NOW)).toBe(false);
    });

    it('refuse un créneau d’un autre jour', () => {
        expect(canFocus(slot({day: 'vendredi'}), PLANNING, NOW)).toBe(false);
    });

    it('refuse un planning d’une autre semaine', () => {
        expect(canFocus(slot(), {...PLANNING, timestamp: new Date(2026, 8, 21)}, NOW)).toBe(false);
    });

    it('refuse un créneau fini, dès son heure de fin', () => {
        expect(canFocus(slot({endTime: '10:00'}), PLANNING, NOW)).toBe(false);
        expect(canFocus(slot({endTime: '10:01'}), PLANNING, NOW)).toBe(true);
    });

    it('refuse une heure illisible', () => {
        expect(canFocus(slot({endTime: '25:00'}), PLANNING, NOW)).toBe(false);
    });
});

describe('targetOf', () => {
    it('reprend le créneau et la priorité de son activité', () => {
        expect(targetOf(slot(), PLANNING)).toEqual({
            kind: 'slot', planningId: 'p1', slotId: 's1', day: 'jeudi',
            startTime: '09:30', endTime: '11:30', activity: 'Portfolio', priority: 1,
        });
    });

    it('prend la priorité moyenne pour une activité inconnue', () => {
        expect(targetOf(slot({activity: 'Lecture'}), PLANNING).priority).toBe(2);
    });
});

describe('isFocusOn', () => {
    it('reconnaît le créneau visé', () => {
        expect(isFocusOn(targetOf(slot(), PLANNING), slot())).toBe(true);
        expect(isFocusOn(targetOf(slot(), PLANNING), slot({_id: 's2'}))).toBe(false);
        expect(isFocusOn({kind: 'free', subject: ''}, slot())).toBe(false);
        expect(isFocusOn(undefined, slot())).toBe(false);
    });
});

describe('relinkTarget', () => {
    const target = targetOf(slot(), PLANNING);

    it('suit le créneau recopié dans un nouveau planning', () => {
        const next = {...PLANNING, _id: 'p2', schedule: [slot({_id: 's9'})]};
        expect(relinkTarget(target, next)).toEqual({...target, planningId: 'p2', slotId: 's9'});
    });

    it('rend la même cible si rien n’a changé', () => {
        expect(relinkTarget(target, {...PLANNING, schedule: [slot()]})).toBe(target);
    });

    it('passe en focus libre si le créneau a été replanifié', () => {
        const next = {...PLANNING, _id: 'p2', schedule: [slot({_id: 's9', startTime: '14:00', endTime: '16:00'})]};
        expect(relinkTarget(target, next)).toEqual({kind: 'free', subject: 'Portfolio'});
    });

    it('laisse un focus libre tel quel', () => {
        const free = {kind: 'free' as const, subject: 'Mails'};
        expect(relinkTarget(free, {...PLANNING, schedule: []})).toBe(free);
    });
});
