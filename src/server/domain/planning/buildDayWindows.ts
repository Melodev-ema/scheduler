import {sortWeekdays, Weekday, WEEKDAYS} from './days';
import {PlannableActivity} from './mergeTasks';
import {formatMinutesToTime, isValidTime, parseTimeToMinutes} from './time';

export const DEFAULT_START_TIME = '09:00';
export const DEFAULT_END_TIME = '18:00';

/**
 * Clés en français : cet objet est sérialisé tel quel dans le prompt,
 * dont le contrat attend `jour`, `heure_debut` et `heure_fin`.
 */
export interface DayWindow {
    jour: Weekday;
    heure_debut: string;
    heure_fin: string;
}

function minutesOf(times: readonly string[]): number[] {
    return times.filter(isValidTime).map(parseTimeToMinutes);
}

export function buildDayWindows(
    activities: readonly PlannableActivity[],
): DayWindow[] {
    const days = activities.some((activity) => activity.days.length === 0)
        ? [...WEEKDAYS]
        : sortWeekdays([...new Set(activities.flatMap((activity) => activity.days))]);

    return days.map((day) => {
        const forDay = activities.filter(
            (activity) => activity.days.length === 0 || activity.days.includes(day),
        );

        const starts = minutesOf(forDay.map((activity) => activity.startTime));
        const ends = minutesOf(forDay.map((activity) => activity.endTime));

        // Les horaires par défaut sont un plancher que les blocs fixes élargissent,
        // jamais une valeur qu'ils remplacent : une activité 07:00-09:00 ne doit pas
        // réduire la journée à deux heures.
        const startMinutes = Math.min(parseTimeToMinutes(DEFAULT_START_TIME), ...starts);
        const endMinutes = Math.max(parseTimeToMinutes(DEFAULT_END_TIME), ...ends);

        return {
            jour: day,
            heure_debut: formatMinutesToTime(startMinutes),
            heure_fin: formatMinutesToTime(endMinutes),
        };
    });
}
