import {describe, expect, it} from 'vitest';
import {
    advance, DEFAULT_FOCUS_SETTINGS, focusMinutes, MINUTE_MS, pause, remainingMs, resume, startFocus, stop,
} from '@/server/domain/focus/cycle';

const T0 = new Date(2026, 9, 1, 10, 0).getTime();
const FREE = {kind: 'free' as const, subject: 'Trier mes mails'};

describe('startFocus', () => {
    it('lance un premier travail de 25 min', () => {
        const state = startFocus(FREE, T0);
        expect(state.status).toBe('running');
        expect(state.phaseIndex).toBe(0);
        expect(state.phaseEndsAt).toBe(T0 + 25 * MINUTE_MS);
        expect(state.settings).toEqual(DEFAULT_FOCUS_SETTINGS);
    });
});

describe('remainingMs', () => {
    it('décompte depuis l’échéance', () => {
        expect(remainingMs(startFocus(FREE, T0), T0 + 5 * MINUTE_MS)).toBe(20 * MINUTE_MS);
    });

    it('n’est jamais négatif', () => {
        expect(remainingMs(startFocus(FREE, T0), T0 + 90 * MINUTE_MS)).toBe(0);
    });
});

describe('advance', () => {
    it('ne change rien avant l’échéance', () => {
        const state = startFocus(FREE, T0);
        expect(advance(state, T0 + 24 * MINUTE_MS)).toBe(state);
    });

    it('clôt la phase à l’échéance, même avec des heures de retard', () => {
        const state = advance(startFocus(FREE, T0), T0 + 5 * 60 * MINUTE_MS);
        expect(state.status).toBe('finished');
        expect(state.completed).toHaveLength(1);
        expect(state.finishedAt).toBe(T0 + 25 * MINUTE_MS);
    });
});

describe('pause et resume', () => {
    it('décale l’échéance de la durée de la pause, sans toucher au temps restant', () => {
        const paused = pause(startFocus(FREE, T0), T0 + 10 * MINUTE_MS);
        expect(paused.status).toBe('paused');
        expect(remainingMs(paused, T0 + 13 * MINUTE_MS)).toBe(15 * MINUTE_MS);
        const resumed = resume(paused, T0 + 13 * MINUTE_MS);
        expect(resumed.status).toBe('running');
        expect(resumed.phaseEndsAt).toBe(T0 + 28 * MINUTE_MS);
        expect(remainingMs(resumed, T0 + 13 * MINUTE_MS)).toBe(15 * MINUTE_MS);
    });

    it('ignore une pause en pause et une reprise en cours', () => {
        const state = startFocus(FREE, T0);
        expect(resume(state, T0)).toBe(state);
        const paused = pause(state, T0);
        expect(pause(paused, T0 + MINUTE_MS)).toBe(paused);
    });

    it('n’avance pas pendant la pause', () => {
        const paused = pause(startFocus(FREE, T0), T0 + MINUTE_MS);
        expect(advance(paused, T0 + 60 * MINUTE_MS)).toBe(paused);
    });
});

describe('stop et focusMinutes', () => {
    it('compte la part écoulée d’un travail arrêté', () => {
        const state = stop(startFocus(FREE, T0), T0 + 12 * MINUTE_MS + 30_000);
        expect(state.status).toBe('finished');
        expect(focusMinutes(state)).toBe(12);
    });

    it('ne compte pas un travail arrêté avant une minute', () => {
        expect(focusMinutes(stop(startFocus(FREE, T0), T0 + 40_000))).toBe(0);
    });

    it('compte un travail mené à son terme', () => {
        expect(focusMinutes(advance(startFocus(FREE, T0), T0 + 25 * MINUTE_MS))).toBe(25);
    });
});
