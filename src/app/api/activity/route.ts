import type {NextRequest} from 'next/server';
import Activity, {ActivityInterface} from '@/models/Activity';
import {weekStartOf} from '@/server/domain/planning/partial';
import {latestPlanningOf} from '@/server/infrastructure/db/plannings';
import dbConnect from '@/server/infrastructure/db/connection';
import {minutesDoneByActivity, SlotProgress} from '@/server/domain/planning/timeSpent';
import {activityInputSchema, deleteActivitySchema} from '@/server/http/schemas/activity';
import {fail, invalidInput, readJsonBody, serverError} from '@/server/http/apiResponse';

export async function GET() {
    try {
        await dbConnect();

        const [activities, planning] = await Promise.all([
            Activity.find({}).lean<ActivityInterface[]>(),
            // Le dernier planning est la semaine en cours, celui de l'accueil. Les
            // précédents sont des régénérations ou des semaines passées : les
            // additionner compterait les mêmes créneaux plusieurs fois.
            latestPlanningOf(weekStartOf(new Date())).select('schedule').lean<{schedule: SlotProgress[]}>(),
        ]);

        // Calculé plutôt que stocké : décocher un créneau fait redescendre le
        // cumul, sans compteur à maintenir en phase avec les statuts.
        const done = minutesDoneByActivity(planning?.schedule ?? []);
        const data = activities.map((activity) => ({
            ...activity,
            timeAlreadySpent: done.get(activity.name) ?? 0,
        }));

        return Response.json({data});
    } catch (error) {
        return serverError('GET /api/activity', error);
    }
}

export async function POST(request: NextRequest) {
    try {
        await dbConnect();

        const parsed = activityInputSchema.safeParse(await readJsonBody(request));
        if (!parsed.success) {
            return invalidInput(parsed.error);
        }

        // Zod a retiré les clés non déclarées : `_id` et `__v` d'un corps forgé
        // n'atteignent pas le constructeur. C'est la correction du mass assignment.
        const activity = await new Activity(parsed.data).save();
        return Response.json({data: activity});
    } catch (error) {
        return serverError('POST /api/activity', error);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        await dbConnect();

        const parsed = deleteActivitySchema.safeParse(await readJsonBody(request));
        if (!parsed.success) {
            return invalidInput(parsed.error);
        }

        const activity = await Activity.findByIdAndDelete(parsed.data.index);
        if (!activity) {
            return fail(404, 'Activité introuvable');
        }

        return Response.json({data: activity});
    } catch (error) {
        return serverError('DELETE /api/activity', error);
    }
}
