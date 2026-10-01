"use client";

import {useRouter} from "next/navigation";
import {BaseButton} from "@/components/uiComponents/BaseButton";
import {ChevronDownIcon, CupIcon, PauseIcon, PlayIcon, SkipIcon, StopIcon} from "@/components/uiComponents/icons/icons";
import {formatDuration} from "@/components/uiComponents/format";
import {
    currentPhase, FocusState, focusMinutes, pomodoroNumber, pomodorosDone, remainingMs,
} from "@/server/domain/focus/cycle";
import {
    clearFocus, clockOf, describeTimer, focusName, formatTimer, pathBeforeFocus, pauseFocus, resumeFocus,
    skipFocusPhase, stopFocus, useFocus,
} from "@/components/focus/focusStore";
import FocusLauncher from "@/components/focus/FocusLauncher";
import CycleDots from "@/components/focus/CycleDots";
import CycleList, {PHASE_LABEL} from "@/components/focus/CycleList";
import PhaseEnd from "@/components/focus/PhaseEnd";
import MarkDoneDialog, {needsMarkDone} from "@/components/focus/MarkDoneDialog";
import {formatSlotTime} from "@/components/planning/DayTimeline";
import {priorityStyle} from "@/components/uiComponents/priority";

/** Une phrase pour chaque pause, choisie par le numéro du pomodoro. */
const BREAK_IDEAS = [
    "Lève-toi, bois un verre d’eau.",
    "Regarde au loin, par la fenêtre.",
    "Étire le dos et les épaules.",
    "Quelques pas, loin de l’écran.",
];

/** Barre fine. Un <progress> : la CSP refuse l'attribut `style` qu'une largeur calculée demanderait. */
function PhaseProgress({state, now}: { state: FocusState, now: number }) {
    const elapsed = state.phaseDurationMs - remainingMs(state, now);
    const onBreak = currentPhase(state) !== "work";
    return (
        <progress
            max={state.phaseDurationMs}
            value={Math.max(0, elapsed)}
            aria-hidden="true"
            className={`h-1.5 w-full appearance-none overflow-hidden rounded-[3px] [&::-webkit-progress-value]:rounded-[3px] [&::-webkit-progress-value]:bg-ink [&::-moz-progress-bar]:rounded-[3px] [&::-moz-progress-bar]:bg-ink ${onBreak ? "bg-ink/15 [&::-webkit-progress-bar]:bg-ink/15" : "bg-line [&::-webkit-progress-bar]:bg-line"}`}
        />
    );
}

function Digits({state, now, className}: { state: FocusState, now: number, className: string }) {
    const left = remainingMs(state, now);
    return (
        <div role="timer" aria-label={describeTimer(left)}
             className={`serif tabular-nums ${state.status === "paused" ? "opacity-45" : ""} ${className}`}>
            {formatTimer(left)}
        </div>
    );
}

function Heading({state, centered}: { state: FocusState, centered?: boolean }) {
    const name = focusName(state);
    const {target} = state;
    const onBreak = currentPhase(state) !== "work";
    const eyebrow = target.kind === "free" ? "Focus libre" : centered ? "Sur ton créneau" : "Focus sur un créneau";
    return (
        <div className={`flex flex-col gap-0.5 ${centered ? "items-center text-center" : ""}`}>
            <span className={`eyebrow ${onBreak ? "text-ink" : ""}`}>{eyebrow}</span>
            {name &&
                <div className={`flex items-center ${centered ? "mt-1 gap-2" : "mt-2 gap-3"}`}>
                    {target.kind === "slot" &&
                        <span aria-hidden="true" className={`shrink-0 rounded-full ${priorityStyle(target.priority).dotBg} ${centered ? "size-2.5" : "size-3"}`}/>}
                    <h1 className={`m-0 font-extrabold ${centered ? "text-2xl leading-7 tracking-[-0.5px]" : "text-[34px] leading-[38px] tracking-[-0.8px]"}`}>{name}</h1>
                </div>
            }
            {target.kind === "slot" &&
                <span className={`text-[15px] ${onBreak ? "text-ink" : "text-muted"} ${centered ? "text-sm" : "mt-1 pl-6"}`}>
                    Aujourd’hui · {formatSlotTime({startTime: target.startTime, endTime: target.endTime})}
                    {!centered && ` · priorité ${priorityStyle(target.priority).label.toLowerCase()}`}
                </span>
            }
        </div>
    );
}

/** Bouton rond du mobile, libellé dessous. */
function RoundButton({label, onClick, primary, children}: {
    label: string, onClick: () => void, primary?: boolean, children: React.ReactNode,
}) {
    return (
        <button type="button" onClick={onClick} className="flex min-w-20 flex-col items-center gap-2 text-ink">
            <span className={`flex items-center justify-center rounded-full transition-transform active:scale-95 ${primary ? "size-20 bg-ink text-butter" : "size-14 border-[1.5px] border-ink"}`}>
                {children}
            </span>
            <span className="text-[13px] font-semibold">{label}</span>
        </button>
    );
}

/** Le minuteur qui tourne ou qui est en pause, en travail comme en pause. */
function timerViews({state, now}: { state: FocusState, now: number }) {
    const paused = state.status === "paused";
    const kind = currentPhase(state);
    const onBreak = kind !== "work";
    const toggle = paused ? resumeFocus : pauseFocus;
    const number = pomodoroNumber(state);
    const total = state.settings.pomodoros;
    const times = (
        <div className={`flex justify-between text-[13px] ${onBreak ? "text-ink" : "text-muted"}`}>
            <span>{onBreak ? `Pause depuis ${clockOf(state.phaseStartedAt)}` : `Commencé à ${clockOf(state.phaseStartedAt)}`}</span>
            {!paused && <span>{onBreak ? `Reprise à ${clockOf(state.phaseEndsAt)}` : `Pause à ${clockOf(state.phaseEndsAt)}`}</span>}
        </div>
    );
    const label = (
        <span className="inline-flex items-center gap-2">
            {onBreak && <CupIcon size={26}/>}
            <span className="ital">{PHASE_LABEL[kind]}</span>
        </span>
    );

    return {
        desktop: (
            <div className="flex min-w-0 flex-col">
                <div className="mt-11 flex items-baseline gap-3.5">
                    <span className="text-[44px] leading-[46px]">{label}</span>
                    <span className="text-[15px] text-muted">{Math.round(state.phaseDurationMs / 60_000)} min</span>
                    {paused &&
                        <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink px-3 py-1 text-[13px] font-bold">
                            <PauseIcon size={12}/> En pause
                        </span>
                    }
                </div>
                <Digits state={state} now={now} className="mt-1 text-[216px] leading-[200px] tracking-[-6px]"/>
                {onBreak && <div className="ital mt-1 text-[21px]">{BREAK_IDEAS[(number - 1) % BREAK_IDEAS.length]}</div>}
                <div className="mt-[22px] flex flex-col gap-2">
                    <PhaseProgress state={state} now={now}/>
                    {times}
                </div>
                <div className="mt-9 flex flex-wrap items-center gap-3">
                    <BaseButton onClick={toggle} className="h-14 min-w-[168px] px-7 text-base">
                        {paused ? <PlayIcon size={18}/> : <PauseIcon size={18}/>}
                        {paused ? "Reprendre" : "Pause"}
                    </BaseButton>
                    <BaseButton theme="secondary" onClick={skipFocusPhase} className="h-14 px-6 text-base">
                        <SkipIcon size={18}/> {onBreak ? "Passer la pause" : "Passer à la pause"}
                    </BaseButton>
                    <BaseButton theme="link" onClick={stopFocus} className="h-14 px-5 text-base">
                        <StopIcon size={18}/> Arrêter
                    </BaseButton>
                </div>
            </div>
        ),
        mobile: (
            <>
                <div className="mt-10 flex flex-col items-center px-2">
                    <span className="text-4xl leading-10">{paused ? <span className="ital">En pause</span> : label}</span>
                    <Digits state={state} now={now} className="text-[120px] leading-[120px] tracking-[-3px]"/>
                    {onBreak && <div className="ital mt-0.5 text-[19px]">{BREAK_IDEAS[(number - 1) % BREAK_IDEAS.length]}</div>}
                    <div className="mt-[18px] flex w-full flex-col gap-2">
                        <PhaseProgress state={state} now={now}/>
                        {times}
                    </div>
                    <div className="mt-7 flex flex-col items-center gap-2.5">
                        <CycleDots state={state}/>
                        <span className="text-sm font-bold">Pomodoro {number} sur {total}{onBreak ? " fait" : ""}</span>
                    </div>
                </div>
                <div className="mt-auto flex items-end justify-center gap-7 pt-8 pb-11">
                    <RoundButton label="Arrêter" onClick={stopFocus}><StopIcon size={20}/></RoundButton>
                    <RoundButton label={paused ? "Reprendre" : "Pause"} onClick={toggle} primary>
                        {paused ? <PlayIcon size={28}/> : <PauseIcon size={28}/>}
                    </RoundButton>
                    <RoundButton label={onBreak ? "Passer la pause" : "Passer"} onClick={skipFocusPhase}>
                        <SkipIcon size={20}/>
                    </RoundButton>
                </div>
            </>
        ),
    };
}

/** Focus terminé ou arrêté : le temps de focus, et de quoi repartir. */
function Done({state, onReduce}: { state: FocusState, onReduce: () => void }) {
    const minutes = Math.round(focusMinutes(state));
    const done = pomodorosDone(state);
    const name = focusName(state);
    return (
        <div className="flex grow flex-col items-center pt-[70px] text-center md:pt-6">
            <CycleDots state={state} size={34}/>
            <span className="ital mt-[18px] text-[44px] leading-12">Fini.</span>
            <span className="mt-2 text-xl font-extrabold">
                {minutes ? `${formatDuration(minutes)} de focus` : "Pas de focus compté"}
            </span>
            <span className="mt-1 text-[15px] text-muted">
                {name ? `${name} · ` : ""}{done} pomodoro{done > 1 ? "s" : ""} sur {state.settings.pomodoros}
            </span>
            <div className="mt-auto flex w-full max-w-[400px] flex-col gap-2.5 pt-10 pb-8 md:pb-0">
                <BaseButton size="large" className="w-full" onClick={clearFocus}>Nouveau focus</BaseButton>
                <BaseButton theme="link" className="w-full" onClick={() => {
                    clearFocus();
                    onReduce();
                }}>Fermer</BaseButton>
            </div>
        </div>
    );
}

/** `/focus` : le lanceur si rien ne tourne, sinon le minuteur et ses transitions. */
export default function FocusScreen() {
    const {state, now} = useFocus();
    const router = useRouter();
    const reduce = () => router.push(pathBeforeFocus());

    // Rendu serveur : on ne sait pas encore ce que garde le navigateur.
    if (now === 0) return null;
    if (!state) return <FocusLauncher onClose={reduce}/>;

    const onBreak = state.status !== "finished" && state.status !== "awaiting" && currentPhase(state) !== "work";
    const timer = state.status === "running" || state.status === "paused" ? timerViews({state, now}) : null;
    const body = state.status === "finished"
        ? <Done state={state} onReduce={reduce}/>
        : state.status === "awaiting" ? <PhaseEnd state={state} now={now}/> : null;

    return (
        <>
            {needsMarkDone(state) && <MarkDoneDialog state={state}/>}
            {/* Bureau */}
            <div className={`hidden rounded-[28px] border px-14 pt-11 pb-12 md:block ${onBreak ? "border-butter bg-butter" : "border-line"}`}>
                <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-14">
                    <div className="flex min-w-0 flex-col">
                        <div className="flex items-start justify-between gap-4">
                            <Heading state={state}/>
                            <BaseButton theme="secondary" size="small" onClick={reduce}>
                                <ChevronDownIcon size={16}/> Réduire
                            </BaseButton>
                        </div>
                        {timer?.desktop}
                        {body && <div className="flex min-h-[460px] flex-col">{body}</div>}
                    </div>
                    <CycleList state={state}/>
                </div>
            </div>

            {/* Mobile : le minuteur prend tout l'écran, fond jaune pendant la pause. */}
            <div className={`-mx-5 -mb-32 flex min-h-dvh flex-col px-5 md:hidden ${onBreak ? "bg-butter" : ""}`}>
                <div className="flex items-center justify-between py-3.5">
                    <button type="button" onClick={reduce} aria-label="Réduire le minuteur"
                            className={`flex size-11 items-center justify-center rounded-full border ${onBreak ? "border-ink/30" : "border-line"}`}>
                        <ChevronDownIcon size={20}/>
                    </button>
                    <span className={`eyebrow ${onBreak ? "text-ink" : ""}`}>{onBreak ? "Pause" : "Focus"}</span>
                    <span className="w-11"/>
                </div>
                {state.status !== "awaiting" && state.status !== "finished" && <Heading state={state} centered/>}
                {timer?.mobile}
                {body}
            </div>
        </>
    );
}
