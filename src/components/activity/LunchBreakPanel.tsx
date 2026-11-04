"use client";

import {useEffect, useState} from "react";
import {toast} from "react-toastify/unstyled";
import {apiService} from "@/services/ApiService";
import {BaseButton} from "@/components/uiComponents/BaseButton";
import {DEFAULT_LUNCH_BREAK, LunchBreak, validateLunchBreak} from "@/server/domain/planning/lunchBreak";

type Draft = { enabled: boolean, start: string, end: string };

function toDraft(lunch: LunchBreak | null): Draft {
    return lunch ? {enabled: true, ...lunch} : {enabled: false, ...DEFAULT_LUNCH_BREAK};
}

/**
 * « Pause déjeuner » : une seule pour la semaine, ou aucune. S'applique à la
 * prochaine génération ; le planning en cours garde la sienne.
 */
export default function LunchBreakPanel() {
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let alive = true;
        apiService.get<{ lunchBreak: LunchBreak | null }>("/api/settings")
            .then(({lunchBreak}) => {
                if (alive) setDraft(toDraft(lunchBreak));
            })
            .catch(() => {
                if (!alive) return;
                setDraft(toDraft(DEFAULT_LUNCH_BREAK));
                toast.error("Impossible de charger ta pause déjeuner.");
            });
        return () => {
            alive = false;
        };
    }, []);

    if (draft === null) return null;

    const update = (patch: Partial<Draft>) => setDraft({...draft, ...patch});

    function save() {
        if (draft === null) return;
        const lunchBreak = draft.enabled ? {start: draft.start, end: draft.end} : null;
        const errors = lunchBreak ? validateLunchBreak(lunchBreak) : [];
        if (errors.length > 0) {
            toast.error(errors[0]);
            return;
        }
        setSaving(true);
        apiService.put<{ lunchBreak: LunchBreak | null }, { lunchBreak: LunchBreak | null }>("/api/settings", {lunchBreak})
            .then(() => toast.success("Pause enregistrée. Elle vaudra dès la prochaine génération."))
            .catch(() => toast.error("La pause n’a pas été enregistrée."))
            .finally(() => setSaving(false));
    }

    return (
        <section className="flex w-full shrink-0 flex-col gap-4 xl:w-[330px]">
            <h2 className="serif m-0 text-[28px] leading-8">Pause déjeuner</h2>
            <div className="flex flex-col gap-3 rounded-3xl border border-line px-[18px] py-3.5">
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!draft.enabled}
                           onChange={(event) => update({enabled: !event.target.checked})}/>
                    Pas de pause
                </label>
                <div className="flex items-center gap-2 text-sm">
                    <input type="time" aria-label="Début de la pause" value={draft.start} disabled={!draft.enabled}
                           onChange={(event) => update({start: event.target.value})}
                           className="rounded-full border border-line bg-transparent px-3 py-1 disabled:text-muted"/>
                    <span>–</span>
                    <input type="time" aria-label="Fin de la pause" value={draft.end} disabled={!draft.enabled}
                           onChange={(event) => update({end: event.target.value})}
                           className="rounded-full border border-line bg-transparent px-3 py-1 disabled:text-muted"/>
                </div>
                <BaseButton theme="soft" size="small" onClick={save} disabled={saving} className="self-start">
                    Enregistrer
                </BaseButton>
            </div>
        </section>
    );
}
