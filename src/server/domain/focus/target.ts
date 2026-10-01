import {isCurrentWeek} from '@/server/domain/planning/partial';
import {weekdayFromDate} from '@/server/domain/planning/days';
import {isValidTime, parseTimeToMinutes} from '@/server/domain/planning/time';
import type {FocusTarget, SlotTarget} from '@/server/domain/focus/cycle';

/** Ce qu'il faut d'un créneau, sans dépendre du modèle Mongoose. */
export interface FocusableSlot {
    _id: string;
    day: string;
    startTime: string;
    endTime: string;
    activity: string;
    status: string;
}

export interface FocusablePlanning {
    _id: string;
    timestamp: Date | string;
    activities?: {name: string; priority: number}[];
}

/**
 * Un créneau se prête au focus s'il est de la semaine en cours, d'aujourd'hui,
 * pas encore fait et pas encore fini. Verrouillé ou non, peu importe.
 */
export function canFocus(slot: FocusableSlot, planning: FocusablePlanning, now: Date): boolean {
    if (slot.status === 'done') return false;
    if (!isCurrentWeek(planning.timestamp, now) || slot.day !== weekdayFromDate(now)) return false;
    if (!isValidTime(slot.startTime) || !isValidTime(slot.endTime)) return false;
    return now.getHours() * 60 + now.getMinutes() < parseTimeToMinutes(slot.endTime);
}

export function targetOf(slot: FocusableSlot, planning: FocusablePlanning): SlotTarget {
    const priority = planning.activities?.find((activity) => activity.name === slot.activity)?.priority ?? 2;
    return {
        kind: 'slot',
        planningId: String(planning._id),
        slotId: String(slot._id),
        day: slot.day,
        startTime: slot.startTime,
        endTime: slot.endTime,
        activity: slot.activity,
        priority,
    };
}

/** Le créneau visé par ce focus, s'il en vise un. */
export function isFocusOn(target: FocusTarget | undefined, slot: FocusableSlot): boolean {
    return target?.kind === 'slot' && target.slotId === String(slot._id);
}

/**
 * Après une regénération, un créneau gardé est recopié avec un nouvel `_id`.
 * On le retrouve par son jour, son heure et son activité. Disparu (il a été
 * replanifié), le focus continue en focus libre sur le même nom.
 */
export function relinkTarget(target: FocusTarget, planning: FocusablePlanning & {schedule: FocusableSlot[]}): FocusTarget {
    if (target.kind !== 'slot') return target;
    const same = planning.schedule.find((slot) =>
        slot.day === target.day && slot.startTime === target.startTime && slot.activity === target.activity);
    if (!same) return {kind: 'free', subject: target.activity};
    const planningId = String(planning._id);
    const slotId = String(same._id);
    if (planningId === target.planningId && slotId === target.slotId && same.endTime === target.endTime) return target;
    return {...target, planningId, slotId, endTime: same.endTime};
}
