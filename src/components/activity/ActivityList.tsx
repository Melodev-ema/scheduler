"use client";

import {useEffect, useState} from "react";
import {toast} from "react-toastify/unstyled";
import {ActivityInterface} from "@/models/Activity";
import {apiService} from "@/services/ApiService";
import ActivityCard, {ActivityPatch} from "@/components/activity/ActivityCard";
import AddActivityDialog from "@/components/activity/AddActivityDialog";
import FixedTimesPanel from "@/components/activity/FixedTimesPanel";
import LunchBreakPanel from "@/components/activity/LunchBreakPanel";
import {notifySchedulerChanged} from "@/components/planning/useWeek";
import {BaseButton} from "@/components/uiComponents/BaseButton";
import Spinner from "@/components/uiComponents/Spinner";
import {PlusIcon} from "@/components/uiComponents/icons/icons";
import {formatTimes} from "@/components/uiComponents/format";
import {effectiveTimes} from "@/components/activity/activityRules";

/**
 * Écran Activités : cartes résumées, ouvertes pour les éditer sur place, carte « Une nouvelle envie ? »
 * et panneau des horaires fixes. Chaque modification part aussitôt vers l'API ;
 * l'état local est mis à jour d'abord, puis rechargé si l'API refuse.
 */
export default function ActivityList() {
    const [activities, setActivities] = useState<ActivityInterface[] | null>(null);
    const [version, setVersion] = useState(0);
    const [adding, setAdding] = useState(false);

    useEffect(() => {
        let alive = true;
        apiService.get<{ data: ActivityInterface[] }>("/api/activity")
            .then((response) => {
                if (alive) setActivities(response.data);
            })
            .catch(() => {
                if (!alive) return;
                setActivities([]);
                toast.error("Impossible de charger tes activités.");
            });
        return () => {
            alive = false;
        };
    }, [version]);

    const reload = () => setVersion((v) => v + 1);

    function save(id: string, patch: ActivityPatch) {
        setActivities((list) => list && list.map((a) => a._id === id ? {...a, ...patch} : a));
        apiService.post(`/api/activity/${id}`, patch)
            .then(() => notifySchedulerChanged())
            .catch(() => {
                toast.error("La modification n’a pas été enregistrée.");
                reload();
            });
    }

    function remove(activity: ActivityInterface) {
        if (typeof activity._id !== "string") return;
        const id = activity._id;
        setActivities((list) => list && list.filter((a) => a._id !== id));
        apiService.delete<{ index: string }, void>("/api/activity", {index: id})
            .then(() => {
                toast.success(`« ${activity.name} » est supprimée.`);
                notifySchedulerChanged();
            })
            .catch(() => {
                toast.error("La suppression a échoué.");
                reload();
            });
    }

    if (activities === null) {
        return (
            <div className="flex items-center gap-3 py-10 text-muted" role="status">
                <Spinner/> Chargement de tes activités…
            </div>
        );
    }

    const total = activities.reduce((sum, a) => sum + effectiveTimes({
        days: a.days ?? [],
        timesPerWeek: a.timesPerWeek ?? null,
    }), 0);

    return (
        <div className="flex flex-col gap-9 xl:flex-row">
            <div className="flex min-w-0 grow flex-col gap-3.5 md:gap-5">
                <div className="flex flex-wrap items-baseline gap-x-3.5">
                    <h1 className="serif m-0 text-[30px] leading-[34px] md:text-[40px] md:leading-[44px]">
                        <span className="md:hidden">Tes activités</span>
                        <span className="hidden md:inline">Ce qui compte pour toi</span>
                    </h1>
                    <div className="ital text-[19px] text-muted md:text-[22px]">{formatTimes(total)} par semaine</div>
                </div>

                <BaseButton theme="soft" size="large" onClick={() => setAdding(true)} className="h-[54px] md:hidden">
                    <PlusIcon size={18}/> Nouvelle activité
                </BaseButton>

                <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 min-[1400px]:grid-cols-3">
                    {activities.map((activity) =>
                        <ActivityCard
                            key={activity._id}
                            activity={activity}
                            onSave={(patch) => typeof activity._id === "string" && save(activity._id, patch)}
                            onDelete={() => remove(activity)}
                        />
                    )}
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="hidden items-center gap-3.5 rounded-3xl border-[1.5px] border-dashed border-muted bg-transparent px-5 py-3.5 text-left text-ink transition-[transform,background-color] duration-100 hover:border-solid hover:border-ink hover:bg-butter active:scale-[.97] md:flex"
                    >
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-butter">
                            <PlusIcon size={20}/>
                        </span>
                        <span className="flex flex-col">
                            <span className="ital text-[22px] leading-[26px]">Une nouvelle envie ?</span>
                            <span className="text-sm text-muted">Ajouter une activité</span>
                        </span>
                    </button>
                </div>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-9 xl:w-[330px]">
                <FixedTimesPanel
                    activities={activities}
                    onSave={(id, patch) => save(id, patch)}
                />
                <LunchBreakPanel/>
            </div>

            <AddActivityDialog
                open={adding}
                onClose={() => setAdding(false)}
                onCreated={() => {
                    setAdding(false);
                    reload();
                    notifySchedulerChanged();
                }}
            />
        </div>
    );
}
