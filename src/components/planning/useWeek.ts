"use client";

import {useCallback, useEffect, useState, useSyncExternalStore} from "react";
import {toast} from "react-toastify/unstyled";
import {PlanningInterface} from "@/models/Planning";
import {ActivityInterface} from "@/models/Activity";
import {apiService, HttpError} from "@/services/ApiService";
import {parseWeekKey, weekKeyOf} from "@/server/domain/planning/week";
import {formatShortDate} from "@/components/uiComponents/format";
import {WeekData, weekDataOf} from "@/components/planning/weekData";
import {createWeekStore} from "@/components/planning/weekStore";

const NO_ACTIVITIES: ActivityInterface[] = [];

const SCHEDULER_CHANGED = "scheduler:changed";

export function notifySchedulerChanged() {
    window.dispatchEvent(new Event(SCHEDULER_CHANGED));
}

/**
 * Une génération en cours, signalée de la même façon. Tant qu'elle tourne, la
 * semaine ne se coche ni ne se verrouille : le planning qu'elle écrira
 * remplacerait ces changements. Gardé aussi au niveau du module, pour qu'un
 * `useWeek` monté pendant la génération parte du bon état.
 */
const SCHEDULER_GENERATING = "scheduler:generating";
let generationRunning = false;

function setGenerationRunning(running: boolean) {
    generationRunning = running;
    window.dispatchEvent(new Event(SCHEDULER_GENERATING));
}

/**
 * La semaine affichée ne reflète plus les activités : l'une a été modifiée
 * après la génération (`updatedAt`, absent des documents antérieurs aux
 * timestamps), ajoutée ou supprimée. Les tâches externes (`source`) ne
 * comptent pas : elles ne sont pas des activités.
 */
export function isWeekStale(planning: PlanningInterface | null, activities: ActivityInterface[]): boolean {
    if (!planning?.timestamp) return false;
    const generatedAt = new Date(planning.timestamp).getTime();
    if (activities.some((a) => a.updatedAt && new Date(a.updatedAt).getTime() > generatedAt)) {
        return true;
    }
    const planned = new Set((planning.activities ?? []).filter((a) => !a.source).map((a) => a.name));
    const current = new Set(activities.map((a) => a.name));
    if (planned.size !== current.size) return true;
    return [...current].some((name) => !planned.has(name));
}


/**
 * Planning de la semaine `week` (clé `YYYY-MM-DD` d'un lundi ; absente = la semaine
 * en cours), activités et semaines planifiées, rechargés à chaque `notifySchedulerChanged()`.
 */
function fetchWeekData(week: string | undefined): Promise<WeekData> {
    // Pas de planning : la route répond 404, ce n'est pas une erreur ici.
    return Promise.allSettled([
        apiService.get<PlanningInterface>(
            week ? `/api/generate_weekly_planning?week=${encodeURIComponent(week)}` : "/api/generate_weekly_planning",
        ),
        apiService.get<{ data: ActivityInterface[] }>("/api/activity"),
        apiService.get<{ weeks: string[] }>("/api/planning/weeks"),
    ]).then((results) => weekDataOf(results, week));
}

const store = createWeekStore(fetchWeekData);
let watchers = 0;

function reloadWatched() {
    store.reloadWatched();
}

function watch(week: string | undefined, listener: () => void): () => void {
    if (watchers++ === 0) {
        window.addEventListener(SCHEDULER_CHANGED, reloadWatched);
    }
    const unsubscribe = store.subscribe(week, listener);
    return () => {
        unsubscribe();
        if (--watchers === 0) {
            window.removeEventListener(SCHEDULER_CHANGED, reloadWatched);
        }
    };
}

export function useWeek(week?: string) {
    const subscribe = useCallback((listener: () => void) => watch(week, listener), [week]);
    const data = useSyncExternalStore(subscribe, () => store.snapshot(week), () => undefined);
    const [generating, setGenerating] = useState(generationRunning);

    useEffect(() => {
        void store.load(week);
    }, [week]);

    useEffect(() => {
        const follow = () => setGenerating(generationRunning);
        window.addEventListener(SCHEDULER_GENERATING, follow);
        return () => window.removeEventListener(SCHEDULER_GENERATING, follow);
    }, []);

    const setPlanning = useCallback((update: (planning: PlanningInterface) => PlanningInterface) => {
        store.update(week, update);
    }, [week]);

    const reload = useCallback(() => void store.refresh(week), [week]);

    const failed = data?.failed ?? false;
    return {
        planning: data?.planning ?? null,
        activities: data?.activities ?? NO_ACTIVITIES,
        weeks: data?.weeks ?? store.lastWeeks(),
        loaded: data !== undefined,
        failed,
        stale: !failed
            && (!week || week === weekKeyOf(new Date()))
            && isWeekStale(data?.planning ?? null, data?.activities ?? NO_ACTIVITIES),
        generating,
        reload,
        setPlanning,
    };
}

/**
 * Filet de sécurité : le serveur abandonne de lui-même à 2 min (échéance de la
 * route). Au-delà de 2 min 30, c'est que la connexion elle-même est perdue.
 */
const GENERATION_TIMEOUT_MS = 150 * 1000;

export type GenerationOutcome =
    | { kind: "done" }
    | { kind: "failed" }
    | { kind: "nothing-left", nextWeek: string, prepared: boolean };

/** Lance une génération, prévient l'utilisateur, puis signale le changement. */
export async function generateWeek(week: "current" | "next" = "current"): Promise<GenerationOutcome> {
    setGenerationRunning(true);
    try {
        const result = await apiService.post<{ week: string }, { violations: string[], partial?: boolean, week?: string }>(
            "/api/generate_weekly_planning", {week}, undefined, GENERATION_TIMEOUT_MS,
        );
        const monday = result.week ? parseWeekKey(result.week) : null;
        if (result.violations && result.violations.length > 0) {
            toast.warning("Ta semaine est prête, mais certaines règles ne sont pas respectées.");
        } else if (week === "next" && monday) {
            toast.success(`Ta semaine du ${formatShortDate(monday)} est prête.`);
        } else {
            toast.success(result.partial ? "Le reste de ta semaine est replanifié." : "Ta semaine est prête.");
        }
        notifySchedulerChanged();
        return {kind: "done"};
    } catch (error) {
        if (error instanceof HttpError && error.status === 409) {
            const body = error.body as { nextWeek?: unknown, nextWeekPrepared?: unknown } | undefined;
            if (typeof body?.nextWeek === "string") {
                return {kind: "nothing-left", nextWeek: body.nextWeek, prepared: body.nextWeekPrepared === true};
            }
            toast.info(error.detail ? `${error.detail}.` : "Il ne reste rien à planifier cette semaine.");
            return {kind: "failed"};
        }
        toast.error(error instanceof DOMException && error.name === "TimeoutError"
            ? "La génération prend trop de temps. Réessaie dans quelques minutes."
            : "La génération a échoué. Réessaie dans quelques minutes.");
        return {kind: "failed"};
    } finally {
        setGenerationRunning(false);
    }
}
