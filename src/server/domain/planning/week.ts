import {weekStartOf} from './partial';

const WEEK_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

/** Le lundi de la semaine de `date`, en `YYYY-MM-DD` (heure locale). */
export function weekKeyOf(date: Date): string {
    const monday = weekStartOf(date);
    return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

/** Le lundi 00:00 (heure locale) d'une clé de semaine ; `null` si elle est mal formée, inexistante ou n'est pas un lundi. */
export function parseWeekKey(key: string): Date | null {
    const match = WEEK_KEY.exec(key);
    if (!match) {
        return null;
    }
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(year, month - 1, day);
    // Un jour hors du mois (30 février) déborde sur le mois suivant : la date ne se relit plus pareil.
    const exists = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
    return exists && date.getDay() === 1 ? date : null;
}

/** Le lundi 00:00 qui suit la semaine de `now`. */
export function nextWeekStart(now: Date): Date {
    const monday = weekStartOf(now);
    monday.setDate(monday.getDate() + 7);
    return monday;
}

/** La semaine d'un planning : son `weekStart`, ou à défaut celle de sa date de génération (plannings plus anciens). */
export function planningWeekOf(planning: {weekStart?: Date | string; timestamp: Date | string}): Date {
    return planning.weekStart !== undefined
        ? new Date(planning.weekStart)
        : weekStartOf(new Date(planning.timestamp));
}
