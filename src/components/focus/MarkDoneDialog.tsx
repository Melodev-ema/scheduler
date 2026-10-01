"use client";

import {useState} from "react";
import {toast} from "react-toastify";
import {apiService, HttpError} from "@/services/ApiService";
import {notifySchedulerChanged} from "@/components/planning/useWeek";
import {BaseButton} from "@/components/uiComponents/BaseButton";
import {CheckIcon} from "@/components/uiComponents/icons/icons";
import {formatDuration} from "@/components/uiComponents/format";
import {FocusState, focusMinutes, pomodorosDone, SlotTarget} from "@/server/domain/focus/cycle";
import {clearFocus, resolveFocus} from "@/components/focus/focusStore";
import FocusSheet from "@/components/focus/FocusSheet";

/** Un focus sur un créneau, fini, dont la question n'a pas encore eu de réponse. */
export function needsMarkDone(state: FocusState | null): state is FocusState & { target: SlotTarget } {
    return state !== null && state.status === "finished" && state.target.kind === "slot"
        && state.resolved !== true && focusMinutes(state) >= 1;
}

/**
 * La fin d'un focus sur un créneau : on propose de le cocher. Une séance
 * coupée par la pause déjeuner ne coche que la partie sous focus, comme un
 * clic sur la carte.
 */
export default function MarkDoneDialog({state}: { state: FocusState & { target: SlotTarget } }) {
    const [saving, setSaving] = useState(false);
    const {target} = state;
    const done = pomodorosDone(state);
    const minutes = formatDuration(Math.round(focusMinutes(state)));

    async function markDone() {
        setSaving(true);
        try {
            await apiService.post("/api/schedule/status", {status: "done", id: target.slotId, planningId: target.planningId});
            toast.success(`« ${target.activity} » est coché.`);
            notifySchedulerChanged();
            clearFocus();
        } catch (error) {
            if (error instanceof HttpError && error.status === 404) {
                toast.info("Ce créneau n’est plus dans ta semaine.");
                clearFocus();
            } else {
                toast.error("Impossible d’enregistrer ce créneau.");
            }
        } finally {
            setSaving(false);
        }
    }

    return (
        <FocusSheet open onClose={resolveFocus} labelledBy="mark-done-title">
            <span className="eyebrow">Créneau terminé</span>
            <h2 id="mark-done-title" className="m-0 text-2xl leading-[29px] font-extrabold">
                Marquer « {target.activity} » comme fait ?
            </h2>
            <p className="m-0 text-[15px] leading-[21px] text-muted">
                {minutes} de focus{done ? `, sur ${done} pomodoro${done > 1 ? "s" : ""}` : ""}. Le créneau sera coché dans ta semaine.
            </p>
            <BaseButton size="large" className="h-14 w-full" onClick={markDone} disabled={saving} ariaBusy={saving}>
                <CheckIcon size={16}/> Oui, c’est fait
            </BaseButton>
            <BaseButton theme="secondary" size="large" className="w-full" onClick={resolveFocus} disabled={saving}>
                Pas encore
            </BaseButton>
        </FocusSheet>
    );
}
