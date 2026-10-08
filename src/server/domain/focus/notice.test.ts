import {describe, expect, it} from 'vitest';
import {advance, FocusState, MINUTE_MS, pause, settleSlotEnd, SlotTarget, startFocus, startNextPhase} from '@/server/domain/focus/cycle';
import {phaseEndNotice} from '@/server/domain/focus/notice';

const T0 = new Date(2026, 9, 1, 10, 0).getTime();
const FREE = {kind: 'free' as const, subject: 'Trier mes mails'};
const SLOT: SlotTarget = {
    kind: 'slot', planningId: 'p1', slotId: 's1', day: 'jeudi',
    startTime: '09:30', endTime: '11:30', activity: 'Portfolio', priority: 1,
};

/** Fait tourner le focus jusqu'à la fin de sa phase en cours. */
function endPhase(state: FocusState): [FocusState, FocusState] {
    return [state, advance(state, state.phaseEndsAt)];
}

/** Mène le focus jusqu'à la phase `index`, en cours. */
function atPhase(index: number, target: FocusState['target'] = FREE): FocusState {
    let state = startFocus(target, T0);
    for (let i = 0; i < index; i++) {
        state = startNextPhase(advance(state, state.phaseEndsAt), state.phaseEndsAt);
    }
    return state;
}

describe('phaseEndNotice', () => {
    it('fin d’un travail : annonce la pause', () => {
        expect(phaseEndNotice(...endPhase(atPhase(2)))).toEqual({
            title: 'Pomodoro 2 sur 4 terminé',
            body: 'Trier mes mails · place à la pause, 5 min.',
        });
    });

    it('fin du dernier travail : annonce la pause longue', () => {
        expect(phaseEndNotice(...endPhase(atPhase(6)))?.body).toBe('Trier mes mails · place à la pause longue, 15 min.');
    });

    it('fin d’une pause : annonce le pomodoro suivant', () => {
        expect(phaseEndNotice(...endPhase(atPhase(1)))).toEqual({
            title: 'La pause est finie',
            body: 'Trier mes mails · prochain : pomodoro 2 sur 4.',
        });
    });

    it('sans sujet : la phrase commence par une majuscule', () => {
        const state = startFocus({kind: 'free', subject: '  '}, T0);
        expect(phaseEndNotice(...endPhase(state))?.body).toBe('Place à la pause, 5 min.');
    });

    it('fin de la pause longue : le cycle est terminé', () => {
        expect(phaseEndNotice(...endPhase(atPhase(7)))).toEqual({
            title: 'Cycle terminé',
            body: 'Trier mes mails · 4 pomodoros sur 4.',
        });
    });

    it('créneau fini pendant une pause : le focus s’arrête et on le dit', () => {
        const before = atPhase(1, SLOT);
        const end = new Date(2026, 9, 1, 11, 30).getTime();
        const after = settleSlotEnd(before, end);
        expect(after.status).toBe('finished');
        expect(phaseEndNotice(before, after)).toEqual({
            title: 'Créneau terminé',
            body: 'Portfolio s’est terminé à 11h30 · 1 pomodoro sur 4.',
        });
    });

    it('rien à annoncer sans changement de statut', () => {
        const state = startFocus(FREE, T0);
        expect(phaseEndNotice(state, advance(state, T0 + MINUTE_MS))).toBeNull();
    });

    it('rien à annoncer pour une mise en pause', () => {
        const state = startFocus(FREE, T0);
        expect(phaseEndNotice(state, pause(state, T0 + MINUTE_MS))).toBeNull();
    });
});
