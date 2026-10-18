import {z} from 'zod';
import {objectId} from '@/server/http/schemas/common';
import {parseWeekKey} from '@/server/domain/planning/week';

/**
 * Les deux seuls statuts que `ScheduleSchema` accepte (voir src/models/Schedule.ts).
 * Un `$set` sur un sous-document ne passe par aucun validateur Mongoose :
 * cette liste est donc la seule chose qui empêche d'y écrire n'importe quoi.
 */
export const scheduleStatusSchema = z.object({
    status: z.enum(['pending', 'done']),
    id: objectId,
    planningId: objectId,
});

export type ScheduleStatusBody = z.infer<typeof scheduleStatusSchema>;

/**
 * Une ou deux parties : les deux moitiés d'une séance coupée par la pause se
 * verrouillent ensemble, en un seul appel.
 */
export const scheduleLockSchema = z.object({
    planningId: objectId,
    ids: z.array(objectId).min(1).max(2),
    locked: z.boolean(),
});

export type ScheduleLockBody = z.infer<typeof scheduleLockSchema>;

/** `?week=YYYY-MM-DD` : le lundi d'une semaine, rendu en `Date` ; absent, l'appelant prend la semaine en cours. */
export const weekQuerySchema = z.object({
    week: z.string().optional().transform((value, ctx) => {
        if (value === undefined) {
            return undefined;
        }
        const monday = parseWeekKey(value);
        if (!monday) {
            ctx.addIssue({code: 'custom', message: 'semaine invalide'});
            return z.NEVER;
        }
        return monday;
    }),
});
