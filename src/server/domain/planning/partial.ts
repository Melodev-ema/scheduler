import {isWeekday, Weekday, WEEKDAYS} from './days';
import {formatMinutesToTime, isValidTime, parseTimeToMinutes} from './time';
import type {DayWindow} from './buildDayWindows';
import type {SessionRequest} from './sessions';
import type {BusySlot} from './checkSchedule';

const DONE = 'done';

/** En dessous, ce qui reste de la journée ne vaut pas d'être planifié. */
const MIN_REMAINING_MINUTES = 15;

/**
 * Ce qu'il faut d'un créneau enregistré pour savoir s'il est figé. `taskId` est
 * un ObjectId côté serveur et une chaîne côté client : on compare leurs `String()`.
 */
export interface PlacedSlot {
    day: string;
    startTime: string;
    endTime: string;
    activity: string;
    status: string;
    locked?: boolean;
    parts?: number;
    taskId?: {toString(): string};
}

/** Le lundi 00:00 (heure locale) de la semaine de `date` ; le dimanche appartient à sa propre semaine. */
export function weekStartOf(date: Date): Date {
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    return monday;
}

export function isCurrentWeek(timestamp: Date | string, now: Date): boolean {
    return weekStartOf(new Date(timestamp)).getTime() === weekStartOf(now).getTime();
}

function isPast(slot: PlacedSlot, today: Weekday, nowMinutes: number): boolean {
    const index = WEEKDAYS.indexOf(slot.day as Weekday);
    const todayIndex = WEEKDAYS.indexOf(today);
    if (index !== todayIndex) {
        return index < todayIndex;
    }
    // Commencé compte comme passé : on ne déplace pas une séance en cours.
    return isValidTime(slot.startTime) && parseTimeToMinutes(slot.startTime) <= nowMinutes;
}

/** Fait, verrouillé ou passé : le créneau est recopié tel quel à la prochaine génération. */
export function isFrozen(slot: PlacedSlot, today: Weekday, nowMinutes: number): boolean {
    return slot.status === DONE || slot.locked === true || isPast(slot, today, nowMinutes);
}

function taskKey(slot: PlacedSlot): string {
    return slot.taskId === undefined ? '' : String(slot.taskId);
}

/** Le créneau et, s'il est la moitié d'une séance coupée par la pause, l'autre moitié. */
export function sessionPartsOf<T extends PlacedSlot>(schedule: readonly T[], slot: T): T[] {
    if ((slot.parts ?? 1) < 2) {
        return [slot];
    }
    return schedule.filter((other) => other === slot || (
        (other.parts ?? 1) > 1
        && other.day === slot.day
        && other.activity === slot.activity
        && taskKey(other) === taskKey(slot)
    ));
}

/**
 * Les créneaux à recopier. Une séance coupée se fige d'un bloc : sinon, une
 * matinée faite laisserait sa seconde partie à replanifier, sur un jour que
 * l'activité a déjà consommé.
 */
export function frozenSlots<T extends PlacedSlot>(schedule: readonly T[], today: Weekday, nowMinutes: number): T[] {
    const known = schedule.filter((slot) => isWeekday(slot.day));
    const frozen = new Set(known.filter((slot) => isFrozen(slot, today, nowMinutes)));
    for (const slot of [...frozen]) {
        for (const part of sessionPartsOf(known, slot)) {
            frozen.add(part);
        }
    }
    return known.filter((slot) => frozen.has(slot));
}

/**
 * Les jours à planifier à partir de maintenant : jamais un jour passé, et
 * aujourd'hui à partir de maintenant, à la minute — un arrondi laisserait hors
 * fenêtre un bloc fixe qui n'a pas encore commencé. Aujourd'hui disparaît
 * quand il en reste moins de `MIN_REMAINING_MINUTES`.
 */
export function remainingWindows(windows: readonly DayWindow[], today: Weekday, nowMinutes: number): DayWindow[] {
    const todayIndex = WEEKDAYS.indexOf(today);

    return windows.flatMap((window) => {
        const index = WEEKDAYS.indexOf(window.jour);
        if (index < todayIndex) {
            return [];
        }
        if (index > todayIndex) {
            return [window];
        }
        const start = Math.max(parseTimeToMinutes(window.heure_debut), nowMinutes);
        return parseTimeToMinutes(window.heure_fin) - start >= MIN_REMAINING_MINUTES
            ? [{...window, heure_debut: formatMinutesToTime(start)}]
            : [];
    });
}

/** Un bloc fixe ne se place un jour que si ses horaires tiennent dans ce qui reste de ce jour. */
function fitsWindow(request: SessionRequest, window: DayWindow | undefined): boolean {
    if (!window) {
        return false;
    }
    if (request.startTime === '') {
        return true;
    }
    return parseTimeToMinutes(request.startTime) >= parseTimeToMinutes(window.heure_debut)
        && parseTimeToMinutes(request.endTime) <= parseTimeToMinutes(window.heure_fin);
}

/**
 * Ce qu'il reste à placer pour chaque activité, dans les fenêtres restantes.
 * Un jour où elle a un créneau figé est consommé, même manqué : une
 * regénération ne rattrape pas le retard. Un bloc fixe dont l'heure est déjà
 * passée aujourd'hui n'y est plus demandé. Une tâche n'est jamais réduite par
 * ses créneaux ici — `excludePlacedTasks` la retire si elle est placée.
 */
export function remainingRequests(
    requests: readonly SessionRequest[],
    frozen: readonly PlacedSlot[],
    windows: readonly DayWindow[],
): SessionRequest[] {
    const windowByDay = new Map(windows.map((window) => [window.jour, window]));
    return requests.flatMap((request) => {
        const consumed = new Set(request.ref !== undefined ? [] : frozen
            .filter((slot) => slot.taskId === undefined && slot.activity === request.name)
            .map((slot) => slot.day));
        const days = request.days.filter((day) => !consumed.has(day) && fitsWindow(request, windowByDay.get(day)));
        const sessions = Math.max(0, Math.min(request.sessions - consumed.size, days.length));
        return sessions > 0 ? [{...request, days, sessions}] : [];
    });
}

/** Terminé avant maintenant : un jour passé, ou aujourd'hui avec une fin déjà atteinte. */
function isOver(slot: PlacedSlot, today: Weekday, nowMinutes: number): boolean {
    const index = WEEKDAYS.indexOf(slot.day as Weekday);
    const todayIndex = WEEKDAYS.indexOf(today);
    if (index !== todayIndex) {
        return index < todayIndex;
    }
    return isValidTime(slot.endTime) && parseTimeToMinutes(slot.endTime) <= nowMinutes;
}

/**
 * Une tâche dont un créneau figé est fait, verrouillé, en cours ou encore à
 * venir (l'autre moitié d'une séance coupée) est déjà placée : on ne la renvoie
 * pas au modèle. Seule une tâche dont tous les créneaux figés sont terminés sans
 * être faits — manquée — revient.
 */
export function excludePlacedTasks<T extends {_id: {toString(): string}}>(
    tasks: readonly T[],
    frozen: readonly PlacedSlot[],
    today: Weekday,
    nowMinutes: number,
): T[] {
    const placed = new Set(frozen
        .filter((slot) => slot.taskId !== undefined
            && (slot.status === DONE || slot.locked === true || !isOver(slot, today, nowMinutes)))
        .map(taskKey));
    return tasks.filter((task) => !placed.has(String(task._id)));
}

/**
 * Pour préparer une semaine à venir : une tâche qui a encore un créneau non fait
 * et pas fini (à venir ou en cours) est déjà placée. Un créneau verrouillé fini
 * sans être fait ne la retient pas — elle est manquée et revient.
 */
export function excludeUpcomingTasks<T extends {_id: {toString(): string}}>(
    tasks: readonly T[],
    schedule: readonly PlacedSlot[],
    today: Weekday,
    nowMinutes: number,
): T[] {
    const upcoming = new Set(schedule
        .filter((slot) => slot.taskId !== undefined && slot.status !== DONE && !isOver(slot, today, nowMinutes))
        .map(taskKey));
    return tasks.filter((task) => !upcoming.has(String(task._id)));
}

/**
 * Une tâche qui a un créneau non fait dans cette semaine (déjà préparée, donc
 * toute à venir) y est placée : elle ne doit pas l'être aussi dans une autre.
 */
export function excludeTasksIn<T extends {_id: {toString(): string}}>(
    tasks: readonly T[],
    schedule: readonly PlacedSlot[],
): T[] {
    const held = new Set(schedule
        .filter((slot) => slot.taskId !== undefined && slot.status !== DONE)
        .map(taskKey));
    return tasks.filter((task) => !held.has(String(task._id)));
}

/**
 * Les créneaux figés à recopier, moins ceux des tâches renvoyées au modèle :
 * une tâche manquée est replanifiée, et son ancien créneau disparaît — sinon
 * elle apparaîtrait deux fois dans la semaine.
 */
export function withoutResentTasks<T extends PlacedSlot>(
    frozen: readonly T[],
    resent: readonly {_id: {toString(): string}}[],
): T[] {
    const ids = new Set(resent.map((task) => String(task._id)));
    return frozen.filter((slot) => slot.taskId === undefined || !ids.has(taskKey(slot)));
}

/** Les créneaux figés que le modèle doit contourner : ceux des jours qu'il planifie encore. */
export function busySlotsOf(frozen: readonly PlacedSlot[], remainingDays: readonly Weekday[]): BusySlot[] {
    return frozen
        .filter((slot) => remainingDays.includes(slot.day as Weekday)
            && isValidTime(slot.startTime) && isValidTime(slot.endTime))
        .map(({day, startTime, endTime, activity}) => ({day, startTime, endTime, activity}));
}

/** Par jour de la semaine, puis par heure de début. */
export function compareSlots(a: {day: string; startTime: string}, b: {day: string; startTime: string}): number {
    const byDay = WEEKDAYS.indexOf(a.day as Weekday) - WEEKDAYS.indexOf(b.day as Weekday);
    return byDay !== 0 ? byDay : a.startTime.localeCompare(b.startTime);
}
