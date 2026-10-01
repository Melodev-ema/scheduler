"use client";

import {BaseButton} from "@/components/uiComponents/BaseButton";
import {useWeek} from "@/components/planning/useWeek";
import {FocusState, SlotTarget} from "@/server/domain/focus/cycle";
import {isValidTime, parseTimeToMinutes} from "@/server/domain/planning/time";
import {formatClock} from "@/components/uiComponents/format";
import {acknowledgeFocusSlotEnd, stopFocus} from "@/components/focus/focusStore";

/** Le créneau du jour qui a commencé depuis la fin de celui-ci, s'il y en a un. */
function useStartedNext(target: SlotTarget, now: number): { activity: string, minutes: number } | null {
    const {planning} = useWeek();
    const date = new Date(now);
    const nowMinutes = date.getHours() * 60 + date.getMinutes();
    const end = parseTimeToMinutes(target.endTime);
    const next = (planning?.schedule ?? [])
        .filter((slot) => slot.day === target.day && isValidTime(slot.startTime))
        .map((slot) => ({activity: slot.activity, start: parseTimeToMinutes(slot.startTime)}))
        .filter((slot) => slot.start >= end && slot.start <= nowMinutes)
        .sort((a, b) => a.start - b.start)[0];
    return next ? {activity: next.activity, minutes: nowMinutes - next.start} : null;
}

/**
 * L'heure de fin du créneau est passée pendant un travail : finir ce
 * pomodoro, ou s'arrêter là. La question n'est posée qu'une fois.
 */
export default function SlotOverBanner({state, now}: { state: FocusState & { target: SlotTarget }, now: number }) {
    const {target} = state;
    const next = useStartedNext(target, now);
    const end = formatClock(parseTimeToMinutes(target.endTime));

    return (
        <div role="alert" className="flex flex-col gap-3 rounded-[20px] bg-butter px-4 py-3.5 text-ink md:flex-row md:items-center md:px-5">
            <p className="m-0 grow text-[15px] leading-[21px]">
                <span className="font-bold">Ton créneau s’est terminé à {end}.</span>
                {next && <><br/>{next.activity} a commencé {next.minutes ? `il y a ${next.minutes} min` : "à l’instant"}.</>}
            </p>
            <div className="flex gap-2">
                <BaseButton size="small" onClick={acknowledgeFocusSlotEnd} className="grow md:grow-0">Finir ce pomodoro</BaseButton>
                <BaseButton theme="secondary" size="small" onClick={stopFocus} className="grow md:grow-0">Terminer maintenant</BaseButton>
            </div>
        </div>
    );
}

