import {WEEKDAYS} from "@/server/domain/planning/days";
import {weekStartOf} from "@/server/domain/planning/partial";

/** Initiales et abréviations, dans l'ordre de `WEEKDAYS`. */
export const DAY_INITIALS = ["L", "M", "M", "J", "V", "S", "D"] as const;
export const DAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

/** 420 → « 7h », 450 → « 7h30 ». */
export function formatClock(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h${m ? String(m).padStart(2, "0") : ""}`;
}

/** 30 → « 30 min », 90 → « 1 h 30 ». */
export function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!h) return `${m} min`;
    return `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
}

export function formatTimes(n: number): string {
    return `${n} fois`;
}

/** « Tous les jours », « Lun – Ven » pour une plage, sinon « Lun, Mer, Ven ». */
export function formatDays(days: readonly string[]): string {
    const indexes = WEEKDAYS
        .map((day, index) => (days.includes(day) ? index : -1))
        .filter((index) => index >= 0);
    if (indexes.length === 0) return "N’importe quel jour";
    if (indexes.length === 7) return "Tous les jours";
    const contiguous = indexes.every((d, i) => i === 0 || d === indexes[i - 1] + 1);
    if (contiguous && indexes.length > 2) {
        return `${DAY_SHORT[indexes[0]]} – ${DAY_SHORT[indexes[indexes.length - 1]]}`;
    }
    return indexes.map((d) => DAY_SHORT[d]).join(", ");
}

/** Lundi (00:00, heure locale) de la semaine qui contient `date`. */
/** Le lundi de la semaine de `date` : le même découpage que la génération, dimanche compris. */
export function mondayOf(date: Date): Date {
    return weekStartOf(date);
}

export function addDays(date: Date, days: number): Date {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

export function isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** « 28 sept. » */
export function formatShortDate(date: Date): string {
    return date.toLocaleDateString("fr-FR", {day: "numeric", month: "short"});
}

/** « 4 octobre » */
export function formatLongDate(date: Date): string {
    return date.toLocaleDateString("fr-FR", {day: "numeric", month: "long"});
}

/** « lundi 19 au dimanche 25 octobre » ; sur deux mois : « lundi 26 octobre au dimanche 1 novembre ». */
export function formatWeekRange(monday: Date): string {
    const sunday = addDays(monday, 6);
    const dayOf = (date: Date) => date.toLocaleDateString("fr-FR", {weekday: "long", day: "numeric"});
    const monthOf = (date: Date) => date.toLocaleDateString("fr-FR", {month: "long"});
    if (monday.getMonth() === sunday.getMonth()) {
        return `${dayOf(monday)} au ${dayOf(sunday)} ${monthOf(sunday)}`;
    }
    return `${dayOf(monday)} ${monthOf(monday)} au ${dayOf(sunday)} ${monthOf(sunday)}`;
}

export function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
