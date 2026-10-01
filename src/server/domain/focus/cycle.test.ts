import {describe, expect, it} from 'vitest';
import {
    acknowledgeSlotEnd, advance, asksSlotEnd, cycleSteps, isSlotOver, settleSlotEnd, slotEndMs, DEFAULT_FOCUS_SETTINGS, extendBreak, FocusState, focusMinutes, MINUTE_MS, pause, phasesOf,
    pomodoroNumber, pomodorosDone, remainingMs, resume, skipBreak, skipPhase, startFocus, startNextPhase, stop,
} from '@/server/domain/focus/cycle';

const T0 = new Date(2026, 9, 1, 10, 0).getTime();
const FREE = {kind: 'free' as const, subject: 'Trier mes mails'};
const min = (n: number) => T0 + n * MINUTE_MS;

/** Mène le focus jusqu'au début du pomodoro `n` (1 à 4), pauses comprises. */
function atPomodoro(n: number): FocusState {
    let state = startFocus(FREE, T0);
    for (let i = 1; i < n; i++) {
        state = advance(state, state.phaseEndsAt);
        state = startNextPhase(state, state.phaseEndsAt);
        state = advance(state, state.phaseEndsAt);
        state = startNextPhase(state, state.phaseEndsAt);
    }
    return state;
}

describe('phasesOf', () => {
    it('alterne travail et pause, la dernière pause est longue', () => {
        expect(phasesOf(DEFAULT_FOCUS_SETTINGS)).toEqual([
            'work', 'shortBreak', 'work', 'shortBreak', 'work', 'shortBreak', 'work', 'longBreak',
        ]);
    });

    it('un seul pomodoro : travail puis pause longue', () => {
        expect(phasesOf({...DEFAULT_FOCUS_SETTINGS, pomodoros: 1})).toEqual(['work', 'longBreak']);
    });
});

describe('startFocus', () => {
    it('lance un premier travail de 25 min', () => {
        const state = startFocus(FREE, T0);
        expect(state.status).toBe('running');
        expect(state.phaseIndex).toBe(0);
        expect(state.phaseEndsAt).toBe(min(25));
        expect(state.settings).toEqual(DEFAULT_FOCUS_SETTINGS);
    });
});

describe('remainingMs', () => {
    it('décompte depuis l’échéance', () => {
        expect(remainingMs(startFocus(FREE, T0), min(5))).toBe(20 * MINUTE_MS);
    });

    it('n’est jamais négatif', () => {
        expect(remainingMs(startFocus(FREE, T0), min(90))).toBe(0);
    });
});

describe('advance', () => {
    it('ne change rien avant l’échéance', () => {
        const state = startFocus(FREE, T0);
        expect(advance(state, min(24))).toBe(state);
    });

    it('clôt une seule phase et attend, même avec des heures de retard', () => {
        const state = advance(startFocus(FREE, T0), min(5 * 60));
        expect(state.status).toBe('awaiting');
        expect(state.phaseIndex).toBe(0);
        expect(state.completed).toEqual([{index: 0, kind: 'work', minutes: 25}]);
    });

    it('finit le focus à la fin de la pause longue', () => {
        let state = atPomodoro(4);
        state = startNextPhase(advance(state, state.phaseEndsAt), state.phaseEndsAt);
        expect(state.phaseIndex).toBe(7);
        const end = state.phaseEndsAt;
        state = advance(state, end + MINUTE_MS);
        expect(state.status).toBe('finished');
        expect(state.finishedAt).toBe(end);
    });
});

describe('pause et resume', () => {
    it('décale l’échéance de la durée de la pause, sans toucher au temps restant', () => {
        const paused = pause(startFocus(FREE, T0), min(10));
        expect(paused.status).toBe('paused');
        expect(remainingMs(paused, min(13))).toBe(15 * MINUTE_MS);
        const resumed = resume(paused, min(13));
        expect(resumed.status).toBe('running');
        expect(resumed.phaseEndsAt).toBe(min(28));
        expect(remainingMs(resumed, min(13))).toBe(15 * MINUTE_MS);
    });

    it('ignore une pause en pause et une reprise en cours', () => {
        const state = startFocus(FREE, T0);
        expect(resume(state, T0)).toBe(state);
        const paused = pause(state, T0);
        expect(pause(paused, min(1))).toBe(paused);
    });

    it('n’avance pas pendant la pause', () => {
        const paused = pause(startFocus(FREE, T0), min(1));
        expect(advance(paused, min(60))).toBe(paused);
    });
});

describe('startNextPhase', () => {
    it('lance la pause courte après un travail', () => {
        const state = startNextPhase(advance(startFocus(FREE, T0), min(25)), min(26));
        expect(state.status).toBe('running');
        expect(state.phaseIndex).toBe(1);
        expect(state.phaseEndsAt).toBe(min(31));
    });

    it('ne fait rien hors attente', () => {
        const state = startFocus(FREE, T0);
        expect(startNextPhase(state, min(1))).toBe(state);
    });
});

describe('skipPhase', () => {
    it('passe un travail sans le compter et lance la pause', () => {
        const state = skipPhase(startFocus(FREE, T0), min(10));
        expect(state.phaseIndex).toBe(1);
        expect(state.status).toBe('running');
        expect(state.completed).toEqual([]);
        expect(state.phaseEndsAt).toBe(min(15));
    });

    it('passe aussi une phase en pause', () => {
        expect(skipPhase(pause(startFocus(FREE, T0), min(3)), min(4)).phaseIndex).toBe(1);
    });
});

describe('skipBreak', () => {
    it('enchaîne le pomodoro suivant sans compter la pause', () => {
        const state = skipBreak(advance(startFocus(FREE, T0), min(25)), min(25));
        expect(state.phaseIndex).toBe(2);
        expect(state.status).toBe('running');
        expect(state.completed.map((phase) => phase.kind)).toEqual(['work']);
    });

    it('après le dernier pomodoro, finit le focus', () => {
        const state = atPomodoro(4);
        expect(skipBreak(advance(state, state.phaseEndsAt), state.phaseEndsAt).status).toBe('finished');
    });
});

describe('extendBreak', () => {
    it('relance la pause qui vient de finir pour 5 min', () => {
        let state = startNextPhase(advance(startFocus(FREE, T0), min(25)), min(25));
        state = advance(state, min(30));
        const extended = extendBreak(state, min(31));
        expect(extended.status).toBe('running');
        expect(extended.phaseIndex).toBe(1);
        expect(extended.phaseEndsAt).toBe(min(36));
    });

    it('ne prolonge pas un travail', () => {
        const state = advance(startFocus(FREE, T0), min(25));
        expect(extendBreak(state, min(25))).toBe(state);
    });
});

describe('stop et focusMinutes', () => {
    it('compte la part écoulée d’un travail arrêté', () => {
        const state = stop(startFocus(FREE, T0), min(12) + 30_000);
        expect(state.status).toBe('finished');
        expect(focusMinutes(state)).toBe(12);
    });

    it('ne compte pas un travail arrêté avant une minute', () => {
        expect(focusMinutes(stop(startFocus(FREE, T0), T0 + 40_000))).toBe(0);
    });

    it('additionne les travaux faits et la part du travail arrêté', () => {
        const state = atPomodoro(3);
        const stopped = stop(state, state.phaseStartedAt + 10 * MINUTE_MS);
        expect(focusMinutes(stopped)).toBe(60);
        expect(pomodorosDone(stopped)).toBe(2);
    });

    it('ne compte rien pour une pause arrêtée', () => {
        const state = startNextPhase(advance(startFocus(FREE, T0), min(25)), min(25));
        expect(focusMinutes(stop(state, min(28)))).toBe(25);
    });
});

describe('pomodoroNumber', () => {
    it('suit le travail en cours et la pause qui le suit', () => {
        const state = atPomodoro(2);
        expect(pomodoroNumber(state)).toBe(2);
        expect(pomodoroNumber(startNextPhase(advance(state, state.phaseEndsAt), state.phaseEndsAt))).toBe(2);
    });
});

describe('cycleSteps', () => {
    it('au pomodoro 2 : deux phases faites, une en cours, cinq à venir', () => {
        const steps = cycleSteps(atPomodoro(2));
        expect(steps.map((step) => step.status)).toEqual([
            'done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming',
        ]);
        expect(steps[7]).toMatchObject({kind: 'longBreak', minutes: 15});
    });

    it('marque sautée une pause enchaînée', () => {
        const state = skipBreak(advance(startFocus(FREE, T0), min(25)), min(25));
        expect(cycleSteps(state).slice(0, 3).map((step) => step.status)).toEqual(['done', 'skipped', 'current']);
    });
});

describe('fin du créneau', () => {
    // Créneau 9h30 – 10h30, focus lancé à 10h (T0).
    const SLOT = {
        kind: 'slot' as const, planningId: 'p1', slotId: 's1', day: 'jeudi',
        startTime: '09:30', endTime: '10:30', activity: 'Portfolio', priority: 1,
    };

    it('situe la fin du créneau le jour du focus', () => {
        expect(slotEndMs(startFocus(SLOT, T0))).toBe(min(30));
        expect(slotEndMs(startFocus(FREE, T0))).toBeNull();
    });

    it('voit le créneau fini à son heure de fin pile', () => {
        const state = startFocus(SLOT, T0);
        expect(isSlotOver(state, min(29))).toBe(false);
        expect(isSlotOver(state, min(30))).toBe(true);
        expect(isSlotOver(startFocus(FREE, T0), min(600))).toBe(false);
    });

    it('demande quoi faire d’un travail en cours, une seule fois', () => {
        let state = advance(startFocus(SLOT, T0), min(25));
        state = startNextPhase(state, min(25));
        state = skipPhase(state, min(26));
        expect(asksSlotEnd(state, min(29))).toBe(false);
        expect(asksSlotEnd(state, min(31))).toBe(true);
        expect(asksSlotEnd(acknowledgeSlotEnd(state), min(31))).toBe(false);
    });

    it('arrête de lui-même un focus en pause courte', () => {
        const onBreak = startNextPhase(advance(startFocus(SLOT, T0), min(25)), min(25));
        const settled = settleSlotEnd(onBreak, min(30));
        expect(settled.status).toBe('finished');
        expect(focusMinutes(settled)).toBe(25);
    });

    it('arrête de lui-même un focus en attente', () => {
        expect(settleSlotEnd(advance(startFocus(SLOT, T0), min(25)), min(31)).status).toBe('finished');
    });

    it('laisse filer un travail en cours, et ne touche à rien avant l’heure', () => {
        const working = skipPhase(startNextPhase(advance(startFocus(SLOT, T0), min(25)), min(25)), min(26));
        expect(settleSlotEnd(working, min(35))).toBe(working);
        const early = startFocus(SLOT, T0);
        expect(settleSlotEnd(early, min(10))).toBe(early);
    });
});
