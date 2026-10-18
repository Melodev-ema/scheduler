"use client";

import {useCallback, useEffect, useState} from "react";
import {toast} from "react-toastify/unstyled";
import {PlanningInterface} from "@/models/Planning";
import {ActivityInterface} from "@/models/Activity";
import {apiService, HttpError} from "@/services/ApiService";
import {parseWeekKey, weekKeyOf} from "@/server/domain/planning/week";
import {formatShortDate} from "@/components/uiComponents/format";

/**
 * Il n'y a pas de store : chaque composant garde son état local. Ce signal de
 * fenêtre est le seul lien entre eux — une génération ou une activité modifiée
 * le déclenche, et chaque `useWeek` monté recharge ses données.
 */
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

interface WeekData {
    planning: PlanningInterface | null;
    activities: ActivityInterface[];
    weeks: string[];
    loaded: boolean;
}

/**
 * Planning de la semaine `week` (clé `YYYY-MM-DD` d'un lundi ; absente = la semaine
 * en cours), activités et semaines planifiées, rechargés à chaque `notifySchedulerChanged()`.
 */
export function useWeek(week?: string) {
    const [data, setData] = useState<WeekData>({planning: null, activities: [], weeks: [], loaded: false});
    const [version, setVersion] = useState(0);
    const [generating, setGenerating] = useState(generationRunning);

    useEffect(() => {
        let alive = true;
        // Pas de planning : la route répond 404, ce n'est pas une erreur ici.
        Promise.allSettled([
            apiService.get<PlanningInterface>(
                week ? `/api/generate_weekly_planning?week=${encodeURIComponent(week)}` : "/api/generate_weekly_planning",
            ),
            apiService.get<{ data: ActivityInterface[] }>("/api/activity"),
            apiService.get<{ weeks: string[] }>("/api/planning/weeks"),
        ]).then(([planning, activities, weeks]) => {
            if (!alive) return;
            setData({
                planning: planning.status === "fulfilled" ? planning.value : null,
                activities: activities.status === "fulfilled" ? activities.value.data : [],
                weeks: weeks.status === "fulfilled" ? weeks.value.weeks : [],
                loaded: true,
            });
        });
        return () => {
            alive = false;
        };
    }, [version, week]);

    useEffect(() => {
        const reload = () => setVersion((v) => v + 1);
        const follow = () => setGenerating(generationRunning);
        window.addEventListener(SCHEDULER_CHANGED, reload);
        window.addEventListener(SCHEDULER_GENERATING, follow);
        return () => {
            window.removeEventListener(SCHEDULER_CHANGED, reload);
            window.removeEventListener(SCHEDULER_GENERATING, follow);
        };
    }, []);

    const setPlanning = useCallback((update: (planning: PlanningInterface) => PlanningInterface) => {
        setData((previous) => previous.planning ? {...previous, planning: update(previous.planning)} : previous);
    }, []);

    return {
        ...data,
        // Les activités se comparent à la semaine en cours seulement : une autre semaine est figée.
        stale: (!week || week === weekKeyOf(new Date()))
            && isWeekStale(data.planning, data.activities),
        generating,
        reload: () => setVersion((v) => v + 1),
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
