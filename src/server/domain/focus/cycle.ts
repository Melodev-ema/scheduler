/**
 * Le minuteur du mode focus, en transitions pures. Tout raisonne sur des
 * horodatages (ms) passés en paramètre, jamais sur un compteur qu'on
 * décrémente : un onglet endormi ou un rechargement ne décalent rien.
 * Aucune fonction ici n'appelle `Date.now()`.
 */

export const MINUTE_MS = 60_000;

export interface FocusSettings {
    workMinutes: number;
    shortBreakMinutes: number;
    longBreakMinutes: number;
    pomodoros: number;
}

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    pomodoros: 4,
};

/** Un focus libre : un sujet facultatif, rattaché à aucun créneau. */
export interface FreeTarget {
    kind: 'free';
    subject: string;
}

export type FocusTarget = FreeTarget;

/** `finished` : arrêté, ou cycle terminé. */
export type FocusStatus = 'running' | 'paused' | 'finished';

export interface CompletedPhase {
    index: number;
    kind: 'work';
    minutes: number;
    /** Phase arrêtée avant son terme : comptée au prorata. */
    partial?: boolean;
}

export interface FocusState {
    target: FocusTarget;
    settings: FocusSettings;
    phaseIndex: number;
    status: FocusStatus;
    startedAt: number;
    phaseStartedAt: number;
    /** Durée effective de la phase en cours. */
    phaseDurationMs: number;
    phaseEndsAt: number;
    /** En pause : le temps qu'il restait au moment de la pause. */
    pausedRemainingMs?: number;
    completed: CompletedPhase[];
    finishedAt?: number;
}

export function startFocus(target: FocusTarget, now: number, settings: FocusSettings = DEFAULT_FOCUS_SETTINGS): FocusState {
    const duration = settings.workMinutes * MINUTE_MS;
    return {
        target,
        settings,
        phaseIndex: 0,
        status: 'running',
        startedAt: now,
        phaseStartedAt: now,
        phaseDurationMs: duration,
        phaseEndsAt: now + duration,
        completed: [],
    };
}

/** Temps restant dans la phase, jamais négatif ; en pause, la valeur gelée. */
export function remainingMs(state: FocusState, now: number): number {
    if (state.status === 'paused') return state.pausedRemainingMs ?? 0;
    if (state.status !== 'running') return 0;
    return Math.max(0, state.phaseEndsAt - now);
}

function finish(state: FocusState, now: number, completed: CompletedPhase[]): FocusState {
    return {...state, status: 'finished', pausedRemainingMs: undefined, completed, finishedAt: now};
}

/** Clôt la phase si son échéance est passée. Sans effet sinon : même référence. */
export function advance(state: FocusState, now: number): FocusState {
    if (state.status !== 'running' || now < state.phaseEndsAt) return state;
    const done: CompletedPhase = {index: state.phaseIndex, kind: 'work', minutes: state.phaseDurationMs / MINUTE_MS};
    return finish(state, state.phaseEndsAt, [...state.completed, done]);
}

export function pause(state: FocusState, now: number): FocusState {
    if (state.status !== 'running') return state;
    return {...state, status: 'paused', pausedRemainingMs: remainingMs(state, now)};
}

export function resume(state: FocusState, now: number): FocusState {
    if (state.status !== 'paused') return state;
    const left = state.pausedRemainingMs ?? 0;
    return {...state, status: 'running', phaseEndsAt: now + left, pausedRemainingMs: undefined};
}

/** Arrête le focus. Un travail entamé compte pour la part écoulée, s'il dépasse une minute. */
export function stop(state: FocusState, now: number): FocusState {
    if (state.status === 'finished') return state;
    const elapsed = state.phaseDurationMs - remainingMs(state, now);
    const minutes = Math.floor(elapsed / MINUTE_MS);
    const completed = minutes >= 1
        ? [...state.completed, {index: state.phaseIndex, kind: 'work' as const, minutes, partial: true}]
        : state.completed;
    return finish(state, now, completed);
}

/** Minutes de travail faites, phase arrêtée comprise. */
export function focusMinutes(state: FocusState): number {
    return state.completed.filter((phase) => phase.kind === 'work').reduce((sum, phase) => sum + phase.minutes, 0);
}
