import {Weekday, weekdayFromDate} from './days';
import {ActivityInput, activityToPlannable, PlannableActivity} from './mergeTasks';
import {TaskInput, taskToPlannable} from './tasks';
import {buildDayWindows, DayWindow} from './buildDayWindows';
import {SessionRequest, toSessionRequests} from './sessions';
import {BusySlot} from './checkSchedule';
import {LunchBreak, numberParts} from './lunchBreak';
import {Sacrifice, SacrificeType, ScheduleSlot} from './parseSchedule';
import {parseTimeToMinutes} from './time';
import {
    busySlotsOf, compareSlots, excludePlacedTasks, excludeTasksIn, excludeUpcomingTasks, frozenSlots, PlacedSlot,
    remainingRequests, remainingWindows, weekStartOf, withoutResentTasks,
} from './partial';
import {nextWeekStart} from './week';

export type TargetWeek = 'current' | 'next';

type Id = {toString(): string};

export interface StoredSlot extends PlacedSlot {
    _id?: Id;
    description: string;
    priority?: number;
    part?: number;
}

export function planTarget(week: TargetWeek, now: Date): {planNow: Date; weekStart: Date} {
    if (week === 'next') {
        const weekStart = nextWeekStart(now);
        return {planNow: weekStart, weekStart};
    }
    return {planNow: now, weekStart: weekStartOf(now)};
}

export function minutesOf(date: Date): number {
    return date.getHours() * 60 + date.getMinutes();
}

export interface GenerationInput<T extends TaskInput & {_id: Id}, S extends StoredSlot> {
    week: TargetWeek;
    now: Date;
    activities: readonly ActivityInput[];
    tasks: readonly T[];
    previous: readonly S[];
    currentWeek: readonly PlacedSlot[] | null;
    preparedWeek: readonly PlacedSlot[] | null;
    lunch: LunchBreak | null;
}

export interface ReadyGeneration<T extends {_id: Id}, S extends StoredSlot> {
    kind: 'ready';
    weekStart: Date;
    weekWindows: DayWindow[];
    weekRequests: SessionRequest[];
    dayWindows: DayWindow[];
    requests: SessionRequest[];
    busy: BusySlot[];
    frozen: S[];
    partial: boolean;
    taskIdByRef: Map<string, T['_id']>;
    payload: string;
    dropped: Sacrifice[];
}

const DROPPED: SacrificeType = 'écartée';

function plural(count: number, word: string): string {
    return `${count} ${word}${count > 1 ? 's' : ''}`;
}

function cappedSessions(plannable: readonly PlannableActivity[], weekRequests: readonly SessionRequest[]): Sacrifice[] {
    return plannable.flatMap((activity, index) => {
        const possible = weekRequests[index].sessions;
        return activity.timesPerWeek !== null && activity.timesPerWeek > possible
            ? [{
                activity: activity.name,
                day: '',
                type: DROPPED,
                detail: `${plural(activity.timesPerWeek, 'séance')} demandées, ${plural(possible, 'jour')} ${possible > 1 ? 'possibles' : 'possible'}`,
            }]
            : [];
    });
}

function passedFixedBlocks(
    weekRequests: readonly SessionRequest[],
    frozen: readonly PlacedSlot[],
    dayWindows: readonly DayWindow[],
    today: Weekday,
): Sacrifice[] {
    const window = dayWindows.find((candidate) => candidate.jour === today);
    return weekRequests.flatMap((request) => {
        if (request.startTime === '' || !request.days.includes(today)) {
            return [];
        }
        const placed = request.ref === undefined && frozen.some((slot) =>
            slot.day === today && slot.taskId === undefined && slot.activity === request.name);
        const passed = !window || parseTimeToMinutes(request.startTime) < parseTimeToMinutes(window.heure_debut);
        return !placed && passed
            ? [{activity: request.name, day: today, type: DROPPED, detail: `bloc de ${request.startTime} déjà passé`}]
            : [];
    });
}

export function withDropped(sacrifices: readonly Sacrifice[], dropped: readonly Sacrifice[]): Sacrifice[] {
    return [...sacrifices.filter((sacrifice) => sacrifice.type !== DROPPED), ...dropped];
}

export type Generation<T extends {_id: Id}, S extends StoredSlot> =
    | {kind: 'nothing-to-plan'}
    | {kind: 'week-over'; nextWeek: Date}
    | ReadyGeneration<T, S>;

export function prepareGeneration<T extends TaskInput & {_id: Id}, S extends StoredSlot>(
    input: GenerationInput<T, S>,
): Generation<T, S> {
    const {week, now, activities, previous, currentWeek, preparedWeek, lunch} = input;
    const {planNow, weekStart} = planTarget(week, now);
    const today = weekdayFromDate(planNow);
    const nowMinutes = minutesOf(planNow);

    const candidates = frozenSlots(previous, today, nowMinutes);
    let tasks = excludePlacedTasks(input.tasks, candidates, today, nowMinutes);
    if (currentWeek) {
        tasks = excludeUpcomingTasks(tasks, currentWeek, weekdayFromDate(now), minutesOf(now));
    }
    if (preparedWeek) {
        tasks = excludeTasksIn(tasks, preparedWeek);
    }
    const frozen = withoutResentTasks(candidates, tasks);

    const refs = tasks.map((_, index) => `t${index + 1}`);
    const taskIdByRef = new Map(tasks.map((task, index) => [refs[index], task._id] as const));
    const plannable = [
        ...activities.map(activityToPlannable),
        ...tasks.map((task, index) => taskToPlannable(task, planNow, refs[index])),
    ];

    const weekWindows = buildDayWindows(plannable);
    const weekRequests = toSessionRequests(plannable, weekWindows);
    if (weekWindows.length === 0) {
        return {kind: 'nothing-to-plan'};
    }
    const dayWindows = remainingWindows(weekWindows, today, nowMinutes);
    if (dayWindows.length === 0) {
        return {kind: 'week-over', nextWeek: nextWeekStart(now)};
    }
    const requests = remainingRequests(weekRequests, frozen, dayWindows);
    const busy = busySlotsOf(frozen, dayWindows.map((window) => window.jour));

    const payload = JSON.stringify({
        jours: dayWindows,
        ...(lunch ? {pause: {debut: lunch.start, fin: lunch.end}} : {}),
        ...(busy.length > 0
            ? {occupe: busy.map((slot) => ({jour: slot.day, debut: slot.startTime, fin: slot.endTime, activite: slot.activity}))}
            : {}),
        activites: requests,
    });

    return {
        kind: 'ready',
        weekStart,
        weekWindows,
        weekRequests,
        dayWindows,
        requests,
        busy,
        frozen,
        partial: frozen.length > 0,
        taskIdByRef,
        payload,
        dropped: [
            ...cappedSessions(plannable, weekRequests),
            ...passedFixedBlocks(weekRequests, frozen, dayWindows, today),
        ],
    };
}

export function assembleSchedule<S extends StoredSlot, I>({frozen, current, replanned, lunch, taskIdByRef}: {
    frozen: readonly S[];
    current: readonly StoredSlot[];
    replanned: readonly ScheduleSlot[];
    lunch: LunchBreak | null;
    taskIdByRef: ReadonlyMap<string, I>;
}) {
    const stateById = new Map(current.map((slot) => [String(slot._id), slot]));

    const kept = frozen.map((slot) => {
        const state = stateById.get(String(slot._id)) ?? slot;
        return {
            day: slot.day,
            startTime: slot.startTime,
            endTime: slot.endTime,
            activity: slot.activity,
            description: slot.description,
            priority: slot.priority,
            status: state.status,
            locked: state.locked ?? false,
            part: slot.part ?? 1,
            parts: slot.parts ?? 1,
            ...(slot.taskId ? {taskId: slot.taskId} : {}),
        };
    });

    const fresh = numberParts(replanned, lunch).map((slot) => {
        const taskId = slot.ref ? taskIdByRef.get(slot.ref) : undefined;
        return taskId ? {...slot, taskId} : slot;
    });

    return [...kept, ...fresh].sort(compareSlots);
}
