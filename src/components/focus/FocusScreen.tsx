"use client";

import {useRouter} from "next/navigation";
import {BaseButton} from "@/components/uiComponents/BaseButton";
import {ChevronDownIcon, PauseIcon, PlayIcon, StopIcon} from "@/components/uiComponents/icons/icons";
import {formatClock, formatDuration} from "@/components/uiComponents/format";
import {FocusState, focusMinutes, remainingMs} from "@/server/domain/focus/cycle";
import {
    clearFocus, describeTimer, focusName, formatTimer, pathBeforeFocus, pauseFocus, resumeFocus, stopFocus, useFocus,
} from "@/components/focus/focusStore";
import FocusLauncher from "@/components/focus/FocusLauncher";

/** 10:03 → « 10h03 ». */
export function clockOf(timestamp: number): string {
    const date = new Date(timestamp);
    return formatClock(date.getHours() * 60 + date.getMinutes());
}

/** Barre fine. Un <progress> : la CSP refuse l'attribut `style` qu'une largeur calculée demanderait. */
export function PhaseProgress({state, now, onButter}: { state: FocusState, now: number, onButter?: boolean }) {
    const elapsed = state.phaseDurationMs - remainingMs(state, now);
    return (
        <progress
            max={state.phaseDurationMs}
            value={Math.max(0, elapsed)}
            aria-hidden="true"
            className={`h-1.5 w-full appearance-none overflow-hidden rounded-[3px] [&::-webkit-progress-value]:rounded-[3px] [&::-webkit-progress-value]:bg-ink [&::-moz-progress-bar]:rounded-[3px] [&::-moz-progress-bar]:bg-ink ${onButter ? "bg-ink/15 [&::-webkit-progress-bar]:bg-ink/15" : "bg-line [&::-webkit-progress-bar]:bg-line"}`}
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
    return (
        <div className={`flex flex-col gap-0.5 ${centered ? "items-center text-center" : ""}`}>
            <span className="eyebrow">Focus libre</span>
            {name && <h1 className={`m-0 font-extrabold ${centered ? "text-2xl leading-7 tracking-[-0.5px]" : "text-[34px] leading-[38px] tracking-[-0.8px]"}`}>{name}</h1>}
        </div>
    );
}

/** Le minuteur qui tourne ou qui est en pause. */
function Timer({state, now, onReduce}: { state: FocusState, now: number, onReduce: () => void }) {
    const paused = state.status === "paused";
    const toggle = paused ? resumeFocus : pauseFocus;
    const times = (
        <div className="flex justify-between text-[13px] text-muted">
            <span>Commencé à {clockOf(state.phaseStartedAt)}</span>
            {!paused && <span>Fin à {clockOf(state.phaseEndsAt)}</span>}
        </div>
    );

    return (
        <>
            {/* Bureau */}
            <div className="hidden rounded-[28px] border border-line px-14 pt-11 pb-12 md:block">
                <div className="flex items-center justify-between">
                    <Heading state={state}/>
                    <BaseButton theme="secondary" size="small" onClick={onReduce} className="self-start">
                        <ChevronDownIcon size={16}/> Réduire
                    </BaseButton>
                </div>
                <div className="mt-11 flex items-baseline gap-3.5">
                    <span className="ital text-[44px] leading-[46px]">Travail</span>
                    <span className="text-[15px] text-muted">{state.settings.workMinutes} min</span>
                    {paused &&
                        <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink px-3 py-1 text-[13px] font-bold">
                            <PauseIcon size={12}/> En pause
                        </span>
                    }
                </div>
                <Digits state={state} now={now} className="mt-1 text-[216px] leading-[200px] tracking-[-6px]"/>
                <div className="mt-[22px] flex flex-col gap-2">
                    <PhaseProgress state={state} now={now}/>
                    {times}
                </div>
                <div className="mt-9 flex items-center gap-3">
                    <BaseButton onClick={toggle} className="h-14 min-w-[168px] px-7 text-base">
                        {paused ? <PlayIcon size={18}/> : <PauseIcon size={18}/>}
                        {paused ? "Reprendre" : "Pause"}
                    </BaseButton>
                    <BaseButton theme="link" onClick={stopFocus} className="h-14 px-5 text-base">
                        <StopIcon size={18}/> Arrêter
                    </BaseButton>
                </div>
            </div>

            {/* Mobile */}
            <div className="flex min-h-[calc(100dvh-24px)] flex-col md:hidden">
                <div className="flex items-center justify-between py-3.5">
                    <button type="button" onClick={onReduce} aria-label="Réduire le minuteur"
                            className="flex size-11 items-center justify-center rounded-full border border-line">
                        <ChevronDownIcon size={20}/>
                    </button>
                    <span className="eyebrow">Focus</span>
                    <span className="w-11"/>
                </div>
                <Heading state={state} centered/>
                <div className="mt-10 flex flex-col items-center px-2">
                    <span className="ital text-4xl leading-10">{paused ? "En pause" : "Travail"}</span>
                    <Digits state={state} now={now} className="text-[120px] leading-[120px] tracking-[-3px]"/>
                    <div className="mt-[18px] flex w-full flex-col gap-2">
                        <PhaseProgress state={state} now={now}/>
                        {times}
                    </div>
                </div>
                <div className="mt-auto flex items-end justify-center gap-7 pt-8 pb-11">
                    <RoundButton label="Arrêter" onClick={stopFocus}><StopIcon size={20}/></RoundButton>
                    <RoundButton label={paused ? "Reprendre" : "Pause"} onClick={toggle} primary>
                        {paused ? <PlayIcon size={28}/> : <PauseIcon size={28}/>}
                    </RoundButton>
                </div>
            </div>
        </>
    );
}

/** Bouton rond du mobile, libellé dessous. */
export function RoundButton({label, onClick, primary, children}: {
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

/** Focus terminé ou arrêté : le temps de focus, et de quoi repartir. */
function Done({state, onReduce}: { state: FocusState, onReduce: () => void }) {
    const minutes = Math.round(focusMinutes(state));
    const name = focusName(state);
    return (
        <div className="mx-auto flex min-h-[calc(100dvh-24px)] max-w-[440px] flex-col items-center pt-[70px] text-center md:min-h-0 md:rounded-[28px] md:border md:border-line md:p-12">
            <span className="ital text-[44px] leading-12">Fini.</span>
            <span className="mt-2 text-xl font-extrabold">
                {minutes ? `${formatDuration(minutes)} de focus` : "Pas de focus compté"}
            </span>
            {name && <span className="mt-1 text-[15px] text-muted">{name}</span>}
            <div className="mt-auto flex w-full flex-col gap-2.5 pt-10 pb-8 md:pb-0">
                <BaseButton size="large" className="w-full" onClick={clearFocus}>Nouveau focus</BaseButton>
                <BaseButton theme="link" className="w-full" onClick={() => {
                    clearFocus();
                    onReduce();
                }}>Fermer</BaseButton>
            </div>
        </div>
    );
}

/** `/focus` : le lanceur si rien ne tourne, sinon le minuteur. */
export default function FocusScreen() {
    const {state, now} = useFocus();
    const router = useRouter();
    const reduce = () => router.push(pathBeforeFocus());

    // Rendu serveur : on ne sait pas encore ce que garde le navigateur.
    if (now === 0) return null;
    if (!state) return <FocusLauncher onClose={reduce}/>;
    if (state.status === "finished") return <Done state={state} onReduce={reduce}/>;
    return <Timer state={state} now={now} onReduce={reduce}/>;
}
