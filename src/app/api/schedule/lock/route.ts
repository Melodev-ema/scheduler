import type {NextRequest} from 'next/server';
import {Types} from 'mongoose';
import dbConnect from '@/server/infrastructure/db/connection';
import Planning from '@/models/Planning';
import {scheduleLockSchema} from '@/server/http/schemas/schedule';
import {planningWeekOf} from '@/server/domain/planning/week';
import {weekStartOf} from '@/server/domain/planning/partial';
import {fail, invalidInput, readJsonBody, serverError} from '@/server/http/apiResponse';

export async function POST(request: NextRequest) {
    try {
        await dbConnect();

        const parsed = scheduleLockSchema.safeParse(await readJsonBody(request));
        if (!parsed.success) {
            return invalidInput(parsed.error);
        }

        const {planningId, ids, locked} = parsed.data;
        // Une semaine passée ne se verrouille plus ; la courante et la préparée, si.
        const target = await Planning.findById(planningId).select('weekStart timestamp').lean();
        if (!target) {
            return fail(404, 'Créneau introuvable');
        }
        if (planningWeekOf(target).getTime() < weekStartOf(new Date()).getTime()) {
            return fail(409, 'Une semaine passée ne se verrouille plus');
        }

        // Les arrayFilters ne sont pas toujours convertis par Mongoose : on passe des ObjectId.
        const objectIds = ids.map((id) => new Types.ObjectId(id));

        // `$all` : si une seule des parties manque, rien n'est écrit et on répond 404.
        const result = await Planning.updateOne(
            {_id: planningId, 'schedule._id': {$all: objectIds}},
            {$set: {'schedule.$[slot].locked': locked}},
            {arrayFilters: [{'slot._id': {$in: objectIds}}]},
        );

        if (result.matchedCount === 0) {
            return fail(404, 'Créneau introuvable');
        }

        return Response.json({locked, ids});
    } catch (error) {
        return serverError('POST /api/schedule/lock', error);
    }
}
