"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {BaseButton} from "@/components/uiComponents/BaseButton";
import {PlayIcon} from "@/components/uiComponents/icons/icons";
import {currentPhase, FocusTarget, pomodoroNumber, remainingMs} from "@/server/domain/focus/cycle";
import {focusName, formatTimer, launchFocus, replaceFocus, useFocus} from "@/components/focus/focusStore";
import {PHASE_LABEL} from "@/components/focus/CycleList";
import FocusSheet from "@/components/focus/FocusSheet";

/** Le nom d'une cible, pour la question. */
function targetName(target: FocusTarget): string {
    return target.kind === "slot" ? target.activity : target.subject.trim() || "un focus libre";
}

/**
 * Un focus tourne déjà et l'on en lance un autre : on demande. Un seul focus
 * à la fois, jamais écrasé sans confirmation.
 */
export default function SwitchFocusDialog({target, onClose}: { target: FocusTarget | null, onClose: () => void }) {
    const {state, now} = useFocus();
    const router = useRouter();
    const running = state && state.status !== "finished" ? state : null;
    const next = target ? targetName(target) : "";
    const current = running ? focusName(running) || "Focus libre" : "";

    return (
        <FocusSheet open={target !== null && running !== null} onClose={onClose} labelledBy="switch-focus-title">
            <span className="eyebrow">Un focus est déjà en cours</span>
            <h2 id="switch-focus-title" className="m-0 text-2xl leading-[29px] font-extrabold">Passer à « {next} » ?</h2>
            {running &&
                <div className="flex items-center gap-3 rounded-[18px] border border-line px-4 py-3.5">
                    <div className="flex grow flex-col">
                        <span className="eyebrow">En cours</span>
                        <span className="text-base font-bold">{current}</span>
                        <span className="text-[13px] text-muted">
                            {PHASE_LABEL[currentPhase(running)]} · pomodoro {pomodoroNumber(running)} sur {running.settings.pomodoros}
                        </span>
                    </div>
                    {running.status !== "awaiting" &&
                        <span className="serif text-[32px] tabular-nums">{formatTimer(remainingMs(running, now))}</span>
                    }
                </div>
            }
            <p className="m-0 text-sm leading-5 text-muted">
                Le focus sur {current} s’arrêtera. Ses pomodoros terminés restent comptés.
            </p>
            <BaseButton size="large" className="h-14 w-full" onClick={() => {
                if (!target) return;
                replaceFocus(target);
                onClose();
                router.push("/focus");
            }}>
                <PlayIcon size={18}/> Lancer « {next} »
            </BaseButton>
            <BaseButton theme="secondary" size="large" className="w-full" onClick={onClose}>
                Garder « {current} »
            </BaseButton>
        </FocusSheet>
    );
}

/**
 * Lancer un focus d'où que ce soit : il démarre et l'on ouvre son écran, ou,
 * si un autre tourne, on pose d'abord la question. Rendre `dialog` à côté.
 */
export function useFocusLauncher() {
    const [pending, setPending] = useState<FocusTarget | null>(null);
    const router = useRouter();

    function launch(target: FocusTarget) {
        if (launchFocus(target) === "started") router.push("/focus");
        else setPending(target);
    }

    return {launch, dialog: <SwitchFocusDialog target={pending} onClose={() => setPending(null)}/>};
}
