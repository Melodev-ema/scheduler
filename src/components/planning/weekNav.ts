import {nextWeekStart, weekKeyOf} from '@/server/domain/planning/week';

/** Une semaine vue de l'accueil : déjà finie, en cours, ou préparée à l'avance. */
export type WeekKind = 'past' | 'current' | 'prepared';

/** Les clés `YYYY-MM-DD` se comparent comme des chaînes : l'ordre est celui des dates. */
export function weekKindOf(key: string, now: Date): WeekKind {
    const current = weekKeyOf(now);
    if (key === current) return 'current';
    return key < current ? 'past' : 'prepared';
}

/**
 * Les semaines où mènent ‹ et › : la plus proche qui a un planning de chaque
 * côté, la semaine en cours comptant toujours, même sans planning. › ne va
 * jamais au-delà de la semaine suivante.
 */
export function preparableWeek(key: string, weeks: readonly string[], now: Date): string | null {
    const next = weekKeyOf(nextWeekStart(now));
    return key === weekKeyOf(now) && !weeks.includes(next) ? next : null;
}

export function neighbours(key: string, weeks: readonly string[], now: Date): { previous: string | null, next: string | null } {
    const limit = weekKeyOf(nextWeekStart(now));
    const reachable = [...new Set([...weeks, weekKeyOf(now)])].filter((week) => week <= limit).sort();
    return {
        previous: reachable.filter((week) => week < key).at(-1) ?? null,
        next: reachable.find((week) => week > key) ?? null,
    };
}
