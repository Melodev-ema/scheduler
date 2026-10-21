import {DEFAULT_END_TIME, DEFAULT_START_TIME} from './buildDayWindows';
import {ScheduleSlot} from './parseSchedule';
import {isValidTime, parseTimeToMinutes} from './time';

/**
 * Pause de midi : rien ne s'y place, sauf un bloc fixe que l'utilisateur y a mis
 * lui-même. Une seule pour toute la semaine ; `null` quand elle est désactivée.
 */
export interface LunchBreak {
    start: string;
    end: string;
}

export const DEFAULT_LUNCH_BREAK: LunchBreak = {start: '12:30', end: '14:00'};

/** Durée minimale de chaque partie d'une séance coupée par la pause. */
export const MIN_PART_MINUTES = 30;

/**
 * Une séance coupée encadre la pause : la première partie finit au plus
 * 30 min avant, la seconde reprend au plus 30 min après. Au-delà, ce sont
 * deux séances distinctes, pas une coupure.
 */
export const SPLIT_TOLERANCE_MINUTES = 30;

/** Erreurs d'une pause saisie, en français ; vide si elle est valable. */
export function validateLunchBreak(lunch: LunchBreak): string[] {
    if (!isValidTime(lunch.start) || !isValidTime(lunch.end)) {
        return ['Pause : heure invalide'];
    }
    const start = parseTimeToMinutes(lunch.start);
    const end = parseTimeToMinutes(lunch.end);
    if (end <= start) {
        return ['Pause : la fin doit venir après le début'];
    }
    if (start < parseTimeToMinutes(DEFAULT_START_TIME) || end > parseTimeToMinutes(DEFAULT_END_TIME)) {
        return [`Pause : entre ${DEFAULT_START_TIME} et ${DEFAULT_END_TIME}`];
    }
    return [];
}

/**
 * La pause d'un planning ou du réglage. Champ absent (planning antérieur, aucun
 * réglage) : la pause par défaut. `null` : pas de pause — surtout pas de `??`.
 */
export function lunchBreakOf(source: {lunchBreak?: LunchBreak | null}): LunchBreak | null {
    return source.lunchBreak === undefined ? DEFAULT_LUNCH_BREAK : source.lunchBreak;
}

/** Un créneau qui touche la pause sans y entrer (fin à son début, début à sa fin) ne l'empiète pas. */
export function overlapsLunch(startTime: string, endTime: string, lunch: LunchBreak | null): boolean {
    if (!lunch) {
        return false;
    }
    return parseTimeToMinutes(startTime) < parseTimeToMinutes(lunch.end)
        && parseTimeToMinutes(endTime) > parseTimeToMinutes(lunch.start);
}

/**
 * Deux parties d'une même séance : l'une finit juste avant la pause, l'autre
 * reprend juste après. Sans pause, il n'y a pas de coupure possible.
 */
export function isSplitAroundLunch(first: ScheduleSlot, second: ScheduleSlot, lunch: LunchBreak | null): boolean {
    if (!lunch) {
        return false;
    }
    const [morning, afternoon] = parseTimeToMinutes(first.startTime) <= parseTimeToMinutes(second.startTime)
        ? [first, second]
        : [second, first];
    const morningEnd = parseTimeToMinutes(morning.endTime);
    const afternoonStart = parseTimeToMinutes(afternoon.startTime);
    const lunchStart = parseTimeToMinutes(lunch.start);
    const lunchEnd = parseTimeToMinutes(lunch.end);
    return morningEnd <= lunchStart && morningEnd >= lunchStart - SPLIT_TOLERANCE_MINUTES
        && afternoonStart >= lunchEnd && afternoonStart <= lunchEnd + SPLIT_TOLERANCE_MINUTES;
}

/**
 * Créneaux regroupés par séance. Une activité n'a qu'une séance par jour : deux
 * créneaux de la même activité le même jour sont les deux parties d'une seule.
 */
export function groupSessions<T extends ScheduleSlot>(slots: readonly T[]): T[][] {
    const groups = new Map<string, T[]>();
    for (const slot of slots) {
        const key = slot.ref !== undefined
            ? `ref\u0000${slot.ref}\u0000${slot.day}`
            : `name\u0000${slot.activity}\u0000${slot.day}`;
        groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.values()];
}

/**
 * Numérote chaque créneau dans sa séance (`part` sur `parts`). Seule une paire
 * qui encadre la pause (`isSplitAroundLunch`) est une séance coupée : ses deux
 * moitiés reçoivent 1/2 et 2/2, dans l'ordre des heures, sans rien demander au
 * modèle. Tout autre créneau — seul, en paire qui n'encadre pas la pause, en
 * groupe de trois ou plus, ou sans pause — reçoit 1/1. L'ordre des créneaux est conservé.
 */
export function numberParts<T extends ScheduleSlot>(
    slots: readonly T[],
    lunch: LunchBreak | null,
): Array<T & {part: number; parts: number}> {
    const numbering = new Map<T, {part: number; parts: number}>();
    for (const group of groupSessions(slots)) {
        if (group.length === 2 && isSplitAroundLunch(group[0], group[1], lunch)) {
            const [first, second] = [...group].sort(
                (a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime),
            );
            numbering.set(first, {part: 1, parts: 2});
            numbering.set(second, {part: 2, parts: 2});
        } else {
            group.forEach((slot) => numbering.set(slot, {part: 1, parts: 1}));
        }
    }
    return slots.map((slot) => ({...slot, ...numbering.get(slot)!}));
}
