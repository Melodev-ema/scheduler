/**
 * Ce qu'on annonce quand une phase finit toute seule : le texte d'une
 * notification, déduit de l'état avant et après le tic. Pur, comme le reste
 * du domaine : l'envoi (permission, onglet au premier plan) est l'affaire du client.
 */

import {currentPhase, FocusState, nextPhaseKind, phaseMinutes, phasesOf, pomodoroNumber, pomodorosDone} from '@/server/domain/focus/cycle';

export interface FocusNotice {
    title: string;
    body: string;
}

function nameOf(state: FocusState): string {
    return state.target.kind === 'slot' ? state.target.activity : state.target.subject.trim();
}

/** « Portfolio · suite » quand le focus a un nom, « Suite » sinon. */
function withName(state: FocusState, rest: string): string {
    const name = nameOf(state);
    return name ? `${name} · ${rest}` : rest.charAt(0).toUpperCase() + rest.slice(1);
}

/**
 * `before` tournait, `after` est ce que le tic en a fait. `null` quand il n'y
 * a rien à annoncer (aucun changement, ou un changement que l'on a fait soi-même).
 */
export function phaseEndNotice(before: FocusState, after: FocusState): FocusNotice | null {
    if (before.status === 'finished' || before.status === after.status) return null;
    const total = after.settings.pomodoros;

    if (after.status === 'awaiting') {
        if (currentPhase(after) === 'work') {
            const next = nextPhaseKind(after);
            const pause = next === 'longBreak' ? 'pause longue' : 'pause';
            const minutes = next ? phaseMinutes(after.settings, next) : 0;
            return {
                title: `Pomodoro ${pomodoroNumber(after)} sur ${total} terminé`,
                body: withName(after, `place à la ${pause}, ${minutes} min.`),
            };
        }
        return {
            title: 'La pause est finie',
            body: withName(after, `prochain : pomodoro ${pomodoroNumber(after) + 1} sur ${total}.`),
        };
    }

    if (after.status !== 'finished') return null;
    const done = pomodorosDone(after);
    const count = `${done} pomodoro${done > 1 ? 's' : ''} sur ${total}`;
    const last = phasesOf(after.settings).length - 1;
    if (after.completed.some((phase) => phase.index === last && !phase.partial)) {
        return {title: 'Cycle terminé', body: withName(after, `${count}.`)};
    }
    // Arrêté sans qu'on y touche : l'heure de fin du créneau est passée.
    if (after.target.kind === 'slot') {
        return {
            title: 'Créneau terminé',
            body: `${after.target.activity} s’est terminé à ${after.target.endTime.replace(':', 'h')} · ${count}.`,
        };
    }
    return null;
}
