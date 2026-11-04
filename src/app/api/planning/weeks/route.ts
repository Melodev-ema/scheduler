import dbConnect from '@/server/infrastructure/db/connection';
import {plannedWeeks} from '@/server/infrastructure/db/plannings';
import {weekKeyOf} from '@/server/domain/planning/week';
import {serverError} from '@/server/http/apiResponse';

export async function GET() {
    try {
        await dbConnect();

        const weeks = await plannedWeeks();
        return Response.json({weeks: weeks.map(weekKeyOf)});
    } catch (error) {
        return serverError('GET /api/planning/weeks', error);
    }
}
