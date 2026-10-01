"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {ChevronDownIcon, CupIcon, PauseIcon, PlayIcon} from "@/components/uiComponents/icons/icons";
import {currentPhase, FocusState, isSlotOver, pomodoroNumber, remainingMs} from "@/server/domain/focus/cycle";
import {formatSlotTime} from "@/components/planning/DayTimeline";
import {
    describeTimer, focusName, formatTimer, nextPhase, pauseFocus, resumeFocus, useFocus,
} from "@/components/focus/focusStore";
import {needsMarkDone} from "@/components/focus/MarkDoneDialog";

/** Le sur-titre : où en est le cycle, en quelques mots. */
function eyebrowOf(state: FocusState, now: number): string {
    if (state.status === "finished") return "Créneau terminé";
    if (state.target.kind === "slot" && isSlotOver(state, now)) {
        return `Créneau fini à ${formatSlotTime(state.target).split(" – ")[1]}`;
    }
    const step = `${pomodoroNumber(state)} sur ${state.settings.pomodoros}`;
    const work = currentPhase(state) === "work";
    if (state.status === "awaiting") return work ? `Pomodoro ${pomodoroNumber(state)} fait` : "Pause finie";
    if (state.status === "paused") return `En pause · ${step}`;
    if (!work) return `Pause · ${step}`;
    return `${state.target.kind === "free" ? "Focus libre" : "Travail"} · ${step}`;
}

/** Le focus actif, s'il y en a un et qu'on n'est pas déjà sur son écran. */
export function useActiveFocus() {
    const {state, now} = useFocus();
    const pathname = usePathname();
    // Un focus sur créneau fini reste affiché tant que « marquer comme fait ? » attend sa réponse.
    const active = state && (state.status !== "finished" || needsMarkDone(state)) && pathname !== "/focus" ? state : null;
    return {state: active, now};
}

function Strip({state, now}: { state: FocusState, now: number }) {
    if (state.status === "awaiting" || state.status === "finished") return null;
    return (
        <progress
            aria-hidden="true"
            max={state.phaseDurationMs}
            value={Math.max(0, state.phaseDurationMs - remainingMs(state, now))}
            className="absolute bottom-0 left-0 h-[3px] w-full appearance-none bg-transparent [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:bg-butter [&::-moz-progress-bar]:bg-butter"
        />
    );
}

function Action({state}: { state: FocusState }) {
    if (state.status === "finished") {
        return (
            <Link href="/focus"
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-butter px-4 text-sm font-bold text-ink no-underline">
                Le cocher ?
            </Link>
        );
    }
    if (state.status === "awaiting") {
        const work = currentPhase(state) === "work";
        return (
            <button type="button" onClick={nextPhase}
                    className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-butter px-4 text-sm font-bold text-ink">
                {work ? <CupIcon size={16}/> : <PlayIcon size={16}/>}
                {work ? "Lancer la pause" : "Reprendre"}
            </button>
        );
    }
    const paused = state.status === "paused";
    return (
        <button type="button" onClick={paused ? resumeFocus : pauseFocus} aria-label={paused ? "Reprendre" : "Mettre en pause"}
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-butter text-ink">
            {paused ? <PlayIcon size={18}/> : <PauseIcon size={18}/>}
        </button>
    );
}

function Summary({state, now, large}: { state: FocusState, now: number, large?: boolean }) {
    const name = focusName(state) || "Focus libre";
    const left = remainingMs(state, now);
    return (
        <Link href="/focus"
              aria-label={`Ouvrir le minuteur, ${name}${state.status === "awaiting" || state.status === "finished" ? "" : `, ${describeTimer(left)}`}`}
              className={`flex h-full min-w-0 items-center text-inherit no-underline ${large ? "grow gap-3" : "gap-4"}`}>
            <span className={`flex min-w-0 flex-col gap-px ${large ? "grow" : ""}`}>
                <span className="eyebrow truncate text-line">{eyebrowOf(state, now)}</span>
                <span className={`truncate font-bold ${large ? "text-[15px] leading-[19px]" : "max-w-[180px] text-sm leading-[18px]"}`}>{name}</span>
            </span>
            {state.status !== "awaiting" && state.status !== "finished" &&
                <span className={`serif text-[30px] leading-8 tabular-nums ${state.status === "paused" ? "opacity-55" : ""}`}>
                    {formatTimer(left)}
                </span>
            }
        </Link>
    );
}

/** Bureau : une pilule dans l'en-tête, à la place du bouton « Focus ». */
export function MiniPlayerPill({state, now}: { state: FocusState, now: number }) {
    return (
        <div className="relative inline-flex h-14 items-center gap-3 overflow-hidden rounded-[28px] bg-ink pr-1.5 pl-5 text-butter">
            <Summary state={state} now={now}/>
            <Action state={state}/>
            <Link href="/focus" aria-label="Agrandir le minuteur"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-butter">
                <ChevronDownIcon size={18} className="rotate-180"/>
            </Link>
            <Strip state={state} now={now}/>
        </div>
    );
}

/** Mobile : une barre posée au-dessus des onglets, et la place qu'elle prend en bas de page. */
export default function MiniPlayerBar() {
    const {state, now} = useActiveFocus();
    if (!state) return null;
    return (
        <div className="md:hidden">
            <div aria-hidden="true" className="h-20"/>
            <div className="fixed inset-x-3 bottom-[92px] z-30 flex h-16 items-center gap-2.5 overflow-hidden rounded-[20px] bg-ink pr-2.5 pl-4 text-butter shadow-[0_8px_24px_rgb(86_65_84/0.12)]">
                <Summary state={state} now={now} large/>
                <Action state={state}/>
                <Strip state={state} now={now}/>
            </div>
        </div>
    );
}
