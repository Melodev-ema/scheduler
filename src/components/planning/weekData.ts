import type {PlanningInterface} from "@/models/Planning";
import type {ActivityInterface} from "@/models/Activity";
import {HttpError} from "@/services/ApiService";

export interface WeekData {
    planning: PlanningInterface | null;
    activities: ActivityInterface[];
    weeks: string[];
    loaded: boolean;
    failed: boolean;
    week?: string;
}

export type WeekResults = [
    PromiseSettledResult<PlanningInterface>,
    PromiseSettledResult<{ data: ActivityInterface[] }>,
    PromiseSettledResult<{ weeks: string[] }>,
];

function isNotFound(result: PromiseSettledResult<unknown>): boolean {
    return result.status === "rejected" && result.reason instanceof HttpError && result.reason.status === 404;
}

export function weekDataOf([planning, activities, weeks]: WeekResults, week?: string): WeekData {
    return {
        planning: planning.status === "fulfilled" ? planning.value : null,
        activities: activities.status === "fulfilled" ? activities.value.data : [],
        weeks: weeks.status === "fulfilled" ? weeks.value.weeks : [],
        loaded: true,
        failed: (planning.status === "rejected" && !isNotFound(planning)) || activities.status === "rejected",
        week,
    };
}
