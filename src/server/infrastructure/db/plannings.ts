import Planning from '@/models/Planning';
import {weekStartOf} from '@/server/domain/planning/partial';

/**
 * Donne un `weekStart` aux plannings qui n'en ont pas encore, calculé avec
 * `weekStartOf` pour couper la semaine exactement comme le domaine. Idempotent.
 * Rend le nombre de plannings modifiés.
 */
export async function backfillWeekStart(): Promise<number> {
    const missing = await Planning.find({weekStart: {$exists: false}})
        .select('timestamp')
        .lean<{ _id: unknown; timestamp: Date }[]>();
    if (missing.length === 0) {
        return 0;
    }
    const result = await Planning.bulkWrite(missing.map(planning => ({
        updateOne: {
            filter: {_id: planning._id},
            update: {$set: {weekStart: weekStartOf(new Date(planning.timestamp))}},
        },
    })));
    return result.modifiedCount;
}

/** Le planning le plus récent d'une semaine ; l'appelant enchaîne `.lean()` ou `.select()`. */
export function latestPlanningOf(weekStart: Date) {
    return Planning.findOne({weekStart}).sort({timestamp: -1});
}

/** Les lundis des semaines qui ont un planning, du plus ancien au plus récent. */
export async function plannedWeeks(): Promise<Date[]> {
    const weeks: Date[] = await Planning.distinct('weekStart');
    return weeks.filter(Boolean).sort((a, b) => a.getTime() - b.getTime());
}
