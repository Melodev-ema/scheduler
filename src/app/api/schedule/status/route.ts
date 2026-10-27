import type {NextRequest} from 'next/server';
import {Types} from 'mongoose';
import dbConnect from '@/server/infrastructure/db/connection';
import Planning from '@/models/Planning';
import Task from '@/models/Task';
import {scheduleStatusSchema} from '@/server/http/schemas/schedule';
import {nextWeekStart, planningWeekOf} from '@/server/domain/planning/week';
import {weekStartOf} from '@/server/domain/planning/partial';
import {latestPlanningOf} from '@/server/infrastructure/db/plannings';
import {fail, invalidInput, readJsonBody, serverError} from '@/server/http/apiResponse';

export async function POST(request: NextRequest) {
    try {
        await dbConnect();

        const parsed = scheduleStatusSchema.safeParse(await readJsonBody(request));
        if (!parsed.success) {
            return invalidInput(parsed.error);
        }

        const {status, id, planningId} = parsed.data;

        // Seule la semaine en cours se coche : les autres sont passées ou pas commencées.
        const target = await Planning.findOne({_id: planningId, 'schedule._id': id})
            .select({weekStart: 1, timestamp: 1, 'schedule.$': 1})
            .lean<{weekStart?: Date; timestamp: Date; schedule: Array<{taskId?: unknown}>}>();
        if (!target) {
            return fail(404, 'Créneau introuvable');
        }
        const now = new Date();
        if (planningWeekOf(target).getTime() !== weekStartOf(now).getTime()) {
            return fail(409, 'Seule la semaine en cours se coche');
        }

        // Une tâche ponctuelle suit son créneau : cochée, elle ne revient plus à
        // la génération suivante ; décochée, elle y revient.
        const taskId = target.schedule[0]?.taskId;
        if (taskId) {
            await Task.findByIdAndUpdate(taskId, {done: status === 'done'});

            // Cochée, la tâche quitte aussi la semaine préparée (ses deux moitiés) ;
            // décochée, la semaine préparée n'est pas touchée.
            if (status === 'done') {
                const prepared = await latestPlanningOf(nextWeekStart(now)).select('_id').lean();
                if (prepared) {
                    await Planning.updateOne(
                        {_id: prepared._id},
                        {$pull: {schedule: {taskId: new Types.ObjectId(String(taskId))}}},
                    );
                }
            }
        }

        const planning = await Planning.findOneAndUpdate(
            {_id: planningId, 'schedule._id': id},
            {$set: {'schedule.$.status': status}},
            {returnDocument: 'after'},
        );

        if (!planning) {
            return fail(404, 'Créneau introuvable');
        }

        // `.id()` est l'accesseur de sous-document des DocumentArray Mongoose.
        const schedule = planning.schedule.id(id);

        return Response.json({status, schedule});
    } catch (error) {
        return serverError('POST /api/schedule/status', error);
    }
}
