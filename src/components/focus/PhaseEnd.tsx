"use client";

import {BaseButton} from "@/components/uiComponents/BaseButton";
import {CupIcon, PlayIcon, SkipIcon} from "@/components/uiComponents/icons/icons";
import {formatDuration} from "@/components/uiComponents/format";
import {currentPhase, FocusState, focusMinutes, MINUTE_MS, nextPhaseKind, phaseMinutes, pomodoroNumber} from "@/server/domain/focus/cycle";
import {clockOf, extendFocusBreak, focusName, nextPhase, skipFocusBreak, stopFocus} from "@/components/focus/focusStore";
import CycleDots from "@/components/focus/CycleDots";

/**
 * Une phase vient de finir (`awaiting`) : on dit où l'on en est et on laisse
 * choisir la suite. Après un travail, la pause ; après une pause, la reprise.
 */
export default function PhaseEnd({state, now}: { state: FocusState, now: number }) {
    const name = focusName(state);
    const total = state.settings.pomodoros;
    const number = pomodoroNumber(state);
    const afterWork = currentPhase(state) === "work";
    const next = nextPhaseKind(state);

    if (afterWork) {
        const breakMinutes = next ? phaseMinutes(state.settings, next) : 0;
        const minutes = Math.round(focusMinutes(state));
        return (
            <div className="flex grow flex-col items-center text-center md:grow-0">
                <div className="flex flex-col items-center gap-2.5 pt-[70px] md:pt-0">
                    <CycleDots state={state} size={34}/>
                    <span className="ital mt-[18px] text-[44px] leading-12">Bien joué.</span>
                    <span className="text-xl font-extrabold">Pomodoro {number} sur {total} terminé</span>
                    <span className="text-[15px] leading-[21px] text-muted">
                        {name ? `${name} · ` : ""}{formatDuration(minutes)} de focus jusqu’ici.<br/>
                        Prends {breakMinutes} minutes, lève les yeux de l’écran.
                    </span>
                </div>
                <div className="mt-auto flex w-full max-w-[400px] flex-col items-center gap-2.5 pt-10 pb-8 md:mt-0 md:pb-0">
                    <BaseButton size="large" className="h-14 w-full" onClick={nextPhase}>
                        <CupIcon size={18}/>
                        {next === "longBreak" ? "Lancer la pause longue" : "Lancer la pause"} · {breakMinutes} min
                    </BaseButton>
                    {next !== "longBreak" &&
                        <BaseButton theme="secondary" size="large" className="w-full" onClick={skipFocusBreak}>
                            <SkipIcon size={18}/> Enchaîner sans pause
                        </BaseButton>
                    }
                    <BaseButton theme="link" size="small" onClick={stopFocus}>Arrêter le focus</BaseButton>
                </div>
            </div>
        );
    }

    const until = clockOf(now + state.settings.workMinutes * MINUTE_MS);
    return (
        <div className="flex grow flex-col items-center text-center md:grow-0">
            <div className="flex flex-col items-center gap-2.5 pt-[70px] md:pt-0">
                <CupIcon size={34}/>
                <span className="ital mt-3 text-[44px] leading-12">La pause est finie.</span>
                <span className="text-xl font-extrabold">Prochain : pomodoro {number + 1} sur {total}</span>
                <span className="text-[15px] text-muted">
                    {name ? `${name} · ` : ""}{state.settings.workMinutes} min · jusqu’à {until}
                </span>
            </div>
            <div className="mt-auto flex w-full max-w-[400px] flex-col items-center gap-2.5 pt-10 pb-8 md:mt-0 md:pb-0">
                <BaseButton size="large" className="h-14 w-full" onClick={nextPhase}>
                    <PlayIcon size={18}/> Reprendre
                </BaseButton>
                <BaseButton theme="secondary" size="large" className="w-full" onClick={extendFocusBreak}>
                    Encore 5 minutes
                </BaseButton>
                <BaseButton theme="link" size="small" onClick={stopFocus}>Arrêter là</BaseButton>
            </div>
        </div>
    );
}
