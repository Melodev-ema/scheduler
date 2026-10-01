"use client";

import {useState} from "react";
import {useWeek} from "@/components/planning/useWeek";
import {formatSlotTime} from "@/components/planning/DayTimeline";
import {priorityStyle} from "@/components/uiComponents/priority";
import {weekdayFromDate} from "@/server/domain/planning/days";
import {isCurrentWeek} from "@/server/domain/planning/partial";
import {canFocus, targetOf} from "@/server/domain/focus/target";
import {useFocusLauncher} from "@/components/focus/SwitchFocusDialog";
import {BaseButton} from "@/components/uiComponents/BaseButton";
import {CheckIcon, CloseIcon, PlayIcon} from "@/components/uiComponents/icons/icons";
import {DEFAULT_FOCUS_SETTINGS} from "@/server/domain/focus/cycle";
import {formatTimer} from "@/components/focus/focusStore";

/** Rappel des durées du cycle, sous les chiffres. */
export function cycleSummary(): string {
    const s = DEFAULT_FOCUS_SETTINGS;
    return `${s.pomodoros} pomodoros de ${s.workMinutes} min, pauses de ${s.shortBreakMinutes} min, pause longue de ${s.longBreakMinutes} min.`;
}

/**
 * `/focus` quand rien ne tourne : un focus libre, avec un sujet facultatif.
 * Pas de fenêtre de réglage des durées pour l'instant (elles sont fixes).
 */
export default function FocusLauncher({onClose}: { onClose: () => void }) {
    const [subject, setSubject] = useState("");
    const {planning} = useWeek();
    const {launch, dialog} = useFocusLauncher();

    // Les créneaux d'aujourd'hui : faits (grisés) ou encore possibles. Les finis non faits n'y sont pas.
    const now = new Date();
    const today = weekdayFromDate(now);
    const slots = planning && isCurrentWeek(planning.timestamp, now)
        ? planning.schedule
            .filter((slot) => slot.day === today && (slot.status === "done" || canFocus(slot, planning, now)))
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
        : [];
    const priorityOf = (name: string) => planning?.activities?.find((a) => a.name === name)?.priority ?? 2;

    return (
        // Mobile : tout l'écran (en-tête et onglets masqués). Bureau : toute la hauteur sous l'en-tête, contenu centré.
        <div className="-mb-32 flex min-h-dvh w-full flex-col md:mb-0 md:min-h-[calc(100dvh-126px)] md:items-center md:justify-center md:rounded-[28px] md:border md:border-line md:p-10">
            <div className="mx-auto flex w-full max-w-[440px] grow flex-col md:grow-0">
                <div className="flex items-center justify-between py-3.5 md:hidden">
                    <button type="button" onClick={onClose} aria-label="Fermer"
                            className="flex size-11 items-center justify-center rounded-full border border-line">
                        <CloseIcon size={20}/>
                    </button>
                    <span className="eyebrow">Focus</span>
                    <span className="w-11"/>
                </div>
                <span className="eyebrow hidden text-center md:block">Focus libre</span>

                <form
                    className="flex grow flex-col"
                    onSubmit={(e) => {
                        e.preventDefault();
                        launch({kind: "free", subject: subject.trim()});
                    }}
                >
                    <div className="flex flex-col items-center pt-2 text-center">
                        <span className="ital text-[30px] leading-[34px]">Quand tu veux.</span>
                        <span className="serif text-[112px] leading-[116px] tracking-[-3px] tabular-nums">
                            {formatTimer(DEFAULT_FOCUS_SETTINGS.workMinutes * 60_000)}
                        </span>
                        <p className="m-0 mt-0.5 max-w-[300px] text-sm leading-5 text-muted">{cycleSummary()}</p>
                    </div>

                    <label htmlFor="focus-subject" className="mt-6 text-[13px] font-bold">
                        Sur quoi ? <span className="font-normal text-muted">(facultatif)</span>
                    </label>
                    <input
                        id="focus-subject"
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Ex. : trier mes mails"
                        maxLength={80}
                        className="mt-1.5 h-12 rounded-2xl border border-line bg-transparent px-4 text-[15px]"
                    />

                    {slots.length > 0 && planning &&
                        <div className="mt-[22px] flex flex-col gap-2">
                            <span className="eyebrow">Ou sur un créneau d’aujourd’hui</span>
                            {slots.map((slot) => {
                                const done = slot.status === "done";
                                const style = priorityStyle(priorityOf(slot.activity));
                                const time = formatSlotTime(slot);
                                return (
                                    <button
                                        key={slot._id}
                                        type="button"
                                        disabled={done}
                                        aria-label={done ? `Déjà fait : ${slot.activity}, ${time}` : `Lancer un focus sur ${slot.activity}, ${time}`}
                                        onClick={() => launch(targetOf(slot, planning))}
                                        className={`flex min-h-[52px] w-full items-center justify-between rounded-2xl border py-2 pr-2.5 pl-4 text-left text-ink disabled:cursor-not-allowed disabled:opacity-60 ${style.softBg} ${style.dotBorder}`}
                                    >
                                        <span className="flex flex-col">
                                            <span className={`text-[15px] font-bold ${done ? "line-through" : ""}`}>{slot.activity}</span>
                                            <span className="text-xs">{time}</span>
                                        </span>
                                        {done
                                            ? <span className="inline-flex items-center gap-1 text-[13px] font-semibold"><CheckIcon size={12}/>fait</span>
                                            : <span className="flex size-8 items-center justify-center rounded-full bg-ink text-butter"><PlayIcon size={12}/></span>
                                        }
                                    </button>
                                );
                            })}
                        </div>
                    }

                    <div className="mt-auto pt-8 pb-6 md:pb-0">
                        <BaseButton type="submit" size="large" className="w-full">
                            <PlayIcon size={18}/>
                            Lancer le focus
                        </BaseButton>
                    </div>
                </form>
                {dialog}
            </div>
        </div>
    );
}
