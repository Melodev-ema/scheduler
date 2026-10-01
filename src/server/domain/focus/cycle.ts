/**
 * Le minuteur du mode focus, en transitions pures. Tout raisonne sur des
 * horodatages (ms) passés en paramètre, jamais sur un compteur qu'on
 * décrémente : un onglet endormi ou un rechargement ne décalent rien.
 * Aucune fonction ici n'appelle `Date.now()`.
 */

import {isValidTime, parseTimeToMinutes} from '@/server/domain/planning/time';

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

/**
 * Un focus sur un créneau du jour : de quoi l'afficher sans recharger le
 * planning, et de quoi le cocher à la fin (`planningId`, `slotId`).
 */
export interface SlotTarget {
    kind: 'slot';
    planningId: string;
    slotId: string;
    day: string;
    startTime: string;
    endTime: string;
    activity: string;
    priority: number;
}

export type FocusTarget = FreeTarget | SlotTarget;

export type PhaseKind = 'work' | 'shortBreak' | 'longBreak';

/**
 * `awaiting` : la phase est écoulée, la suite n'est pas encore choisie — on
 * n'enchaîne jamais en silence. `finished` : arrêté, ou cycle terminé.
 */
export type FocusStatus = 'running' | 'paused' | 'awaiting' | 'finished';

export interface CompletedPhase {
    index: number;
    kind: PhaseKind;
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
    /** Durée effective de la phase en cours (une pause prolongée compte). */
    phaseDurationMs: number;
    phaseEndsAt: number;
    /** En pause : le temps qu'il restait au moment de la pause. */
    pausedRemainingMs?: number;
    completed: CompletedPhase[];
    finishedAt?: number;
    /** Focus sur un créneau, fini : la question « marquer comme fait ? » a eu sa réponse. */
    resolved?: boolean;
    /** L'heure de fin du créneau est passée et l'on a choisi de finir le pomodoro en cours. */
    slotEndAcknowledged?: boolean;
}

/** Travail, pause, travail… la dernière pause est longue. */
export function phasesOf(settings: FocusSettings): PhaseKind[] {
    const phases: PhaseKind[] = [];
    for (let i = 0; i < settings.pomodoros; i++) {
        phases.push('work', i === settings.pomodoros - 1 ? 'longBreak' : 'shortBreak');
    }
    return phases;
}

export function phaseMinutes(settings: FocusSettings, kind: PhaseKind): number {
    if (kind === 'work') return settings.workMinutes;
    return kind === 'shortBreak' ? settings.shortBreakMinutes : settings.longBreakMinutes;
}

export function currentPhase(state: FocusState): PhaseKind {
    return phasesOf(state.settings)[state.phaseIndex];
}

/** La phase qui suit la phase courante, ou `null` en fin de cycle. */
export function nextPhaseKind(state: FocusState): PhaseKind | null {
    return phasesOf(state.settings)[state.phaseIndex + 1] ?? null;
}

function enterPhase(state: FocusState, index: number, now: number): FocusState {
    const kind = phasesOf(state.settings)[index];
    if (!kind) return finish(state, now, state.completed);
    const duration = phaseMinutes(state.settings, kind) * MINUTE_MS;
    return {
        ...state,
        phaseIndex: index,
        status: 'running',
        phaseStartedAt: now,
        phaseDurationMs: duration,
        phaseEndsAt: now + duration,
        pausedRemainingMs: undefined,
    };
}

export function startFocus(target: FocusTarget, now: number, settings: FocusSettings = DEFAULT_FOCUS_SETTINGS): FocusState {
    return enterPhase({
        target,
        settings,
        phaseIndex: 0,
        status: 'running',
        startedAt: now,
        phaseStartedAt: now,
        phaseDurationMs: 0,
        phaseEndsAt: now,
        completed: [],
    }, 0, now);
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

/**
 * Clôt la phase si son échéance est passée : une seule, même avec des heures
 * de retard. La dernière phase finit le focus ; les autres attendent un choix.
 * Sans effet sinon : même référence.
 */
export function advance(state: FocusState, now: number): FocusState {
    if (state.status !== 'running' || now < state.phaseEndsAt) return state;
    const done: CompletedPhase = {
        index: state.phaseIndex,
        kind: currentPhase(state),
        minutes: state.phaseDurationMs / MINUTE_MS,
    };
    const completed = [...state.completed, done];
    if (nextPhaseKind(state) === null) return finish(state, state.phaseEndsAt, completed);
    return {...state, status: 'awaiting', completed, phaseEndsAt: state.phaseEndsAt};
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

/** « Lancer la pause », « Reprendre » : la phase suivante, après une attente. */
export function startNextPhase(state: FocusState, now: number): FocusState {
    if (state.status !== 'awaiting') return state;
    return enterPhase(state, state.phaseIndex + 1, now);
}

/** « Enchaîner sans pause » : après un travail, saute la pause et lance le travail suivant. */
export function skipBreak(state: FocusState, now: number): FocusState {
    if (state.status !== 'awaiting' || currentPhase(state) !== 'work') return state;
    return enterPhase(state, state.phaseIndex + 2, now);
}

/** « Passer » : clôt la phase en cours sans la compter et lance la suivante. */
export function skipPhase(state: FocusState, now: number): FocusState {
    if (state.status !== 'running' && state.status !== 'paused') return state;
    return enterPhase(state, state.phaseIndex + 1, now);
}

/** « Encore 5 minutes » : la pause qui vient de finir reprend pour un moment. */
export function extendBreak(state: FocusState, now: number, minutes = 5): FocusState {
    if (state.status !== 'awaiting' || currentPhase(state) === 'work') return state;
    const duration = minutes * MINUTE_MS;
    return {...state, status: 'running', phaseStartedAt: now, phaseDurationMs: duration, phaseEndsAt: now + duration};
}

/** Arrête le focus. Un travail entamé compte pour la part écoulée, s'il dépasse une minute. */
export function stop(state: FocusState, now: number): FocusState {
    if (state.status === 'finished') return state;
    const working = (state.status === 'running' || state.status === 'paused') && currentPhase(state) === 'work';
    const minutes = working ? Math.floor((state.phaseDurationMs - remainingMs(state, now)) / MINUTE_MS) : 0;
    const completed = minutes >= 1
        ? [...state.completed, {index: state.phaseIndex, kind: 'work' as const, minutes, partial: true}]
        : state.completed;
    return finish(state, now, completed);
}

/** Le numéro du pomodoro en cours, ou de celui qui précède la pause en cours (1 à N). */
export function pomodoroNumber(state: FocusState): number {
    return Math.floor(state.phaseIndex / 2) + 1;
}

/** Pomodoros menés à leur terme. */
export function pomodorosDone(state: FocusState): number {
    return state.completed.filter((phase) => phase.kind === 'work' && !phase.partial).length;
}

/** Minutes de travail faites, phase arrêtée comprise. */
export function focusMinutes(state: FocusState): number {
    return state.completed.filter((phase) => phase.kind === 'work').reduce((sum, phase) => sum + phase.minutes, 0);
}

export type StepStatus = 'done' | 'skipped' | 'current' | 'upcoming';

export interface CycleStep {
    index: number;
    kind: PhaseKind;
    minutes: number;
    status: StepStatus;
}

/** Le cycle entier, phase par phase : ce qui est fait, sauté, en cours, à venir. */
export function cycleSteps(state: FocusState): CycleStep[] {
    const done = new Set(state.completed.filter((phase) => !phase.partial).map((phase) => phase.index));
    return phasesOf(state.settings).map((kind, index) => {
        let status: StepStatus;
        if (done.has(index)) status = 'done';
        else if (index < state.phaseIndex) status = 'skipped';
        else if (index === state.phaseIndex && state.status !== 'finished') status = 'current';
        else if (index === state.phaseIndex) status = 'skipped';
        else status = 'upcoming';
        return {index, kind, minutes: phaseMinutes(state.settings, kind), status};
    });
}

/** L'heure de fin du créneau, le jour où le focus a commencé ; `null` pour un focus libre. */
export function slotEndMs(state: FocusState): number | null {
    const {target} = state;
    if (target.kind !== 'slot' || !isValidTime(target.endTime)) return null;
    const day = new Date(state.startedAt);
    day.setHours(0, 0, 0, 0);
    return day.getTime() + parseTimeToMinutes(target.endTime) * MINUTE_MS;
}

export function isSlotOver(state: FocusState, now: number): boolean {
    const end = slotEndMs(state);
    return end !== null && now >= end;
}

/**
 * Le créneau est fini et le travail en cours attend une décision : c'est le
 * moment de demander « finir ce pomodoro ou terminer maintenant ? ».
 */
export function asksSlotEnd(state: FocusState, now: number): boolean {
    return isSlotOver(state, now) && !state.slotEndAcknowledged
        && (state.status === 'running' || state.status === 'paused') && currentPhase(state) === 'work';
}

/** « Finir ce pomodoro » : on ne repose plus la question. */
export function acknowledgeSlotEnd(state: FocusState): FocusState {
    return {...state, slotEndAcknowledged: true};
}

/**
 * Le créneau est fini : hors d'un travail en cours, le focus s'arrête de
 * lui-même (pause, ou attente entre deux phases). Un travail en cours
 * continue jusqu'à la décision, ou jusqu'à sa fin s'il a été gardé.
 */
export function settleSlotEnd(state: FocusState, now: number): FocusState {
    if (state.status === 'finished' || !isSlotOver(state, now)) return state;
    const working = (state.status === 'running' || state.status === 'paused') && currentPhase(state) === 'work';
    return working ? state : stop(state, now);
}
