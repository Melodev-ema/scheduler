import type {PlanningInterface} from "@/models/Planning";
import type {WeekData} from "@/components/planning/weekData";

export type FetchWeek = (week: string | undefined) => Promise<WeekData>;

export interface WeekStore {
    snapshot(week?: string): WeekData | undefined;
    lastWeeks(): string[];
    subscribe(week: string | undefined, listener: () => void): () => void;
    load(week?: string): Promise<void>;
    refresh(week?: string): Promise<void>;
    reloadWatched(): void;
    update(week: string | undefined, change: (planning: PlanningInterface) => PlanningInterface): void;
}

const keyOf = (week?: string) => week ?? "";

export function createWeekStore(fetchWeek: FetchWeek): WeekStore {
    const entries = new Map<string, WeekData>();
    const inFlight = new Map<string, Promise<void>>();
    const requestedAgain = new Set<string>();
    const listeners = new Map<string, Set<() => void>>();
    let weeks: string[] = [];

    function notify(key: string) {
        listeners.get(key)?.forEach((listener) => listener());
    }

    function load(week?: string): Promise<void> {
        return inFlight.get(keyOf(week)) ?? start(week);
    }

    function refresh(week?: string): Promise<void> {
        const running = inFlight.get(keyOf(week));
        if (running) {
            requestedAgain.add(keyOf(week));
            return running;
        }
        return start(week);
    }

    function start(week?: string): Promise<void> {
        const key = keyOf(week);
        const promise = fetchWeek(week)
            .then((data) => {
                entries.set(key, data);
                if (data.weeks.length > 0) {
                    weeks = data.weeks;
                }
                notify(key);
            })
            .finally(() => {
                inFlight.delete(key);
                if (requestedAgain.delete(key)) {
                    void start(week);
                }
            });
        inFlight.set(key, promise);
        return promise;
    }

    return {
        snapshot: (week) => entries.get(keyOf(week)),
        lastWeeks: () => weeks,
        subscribe(week, listener) {
            const key = keyOf(week);
            const set = listeners.get(key) ?? new Set();
            set.add(listener);
            listeners.set(key, set);
            return () => {
                set.delete(listener);
                if (set.size === 0) {
                    listeners.delete(key);
                }
            };
        },
        load,
        refresh,
        reloadWatched() {
            for (const key of listeners.keys()) {
                void refresh(key === "" ? undefined : key);
            }
        },
        update(week, change) {
            const key = keyOf(week);
            const entry = entries.get(key);
            if (!entry?.planning) {
                return;
            }
            entries.set(key, {...entry, planning: change(entry.planning)});
            notify(key);
        },
    };
}
