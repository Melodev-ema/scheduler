"use client";

import {useState} from "react";
import {BaseButton} from "@/components/uiComponents/BaseButton";
import {CloseIcon, PlayIcon} from "@/components/uiComponents/icons/icons";
import {DEFAULT_FOCUS_SETTINGS} from "@/server/domain/focus/cycle";
import {formatTimer, launchFocus} from "@/components/focus/focusStore";

/** Rappel des durées du cycle, sous les chiffres. */
export function cycleSummary(): string {
    const s = DEFAULT_FOCUS_SETTINGS;
    return `Un pomodoro de ${s.workMinutes} min.`;
}

/**
 * `/focus` quand rien ne tourne : un focus libre, avec un sujet facultatif.
 * Pas de fenêtre de réglage des durées pour l'instant (elles sont fixes).
 */
export default function FocusLauncher({onClose}: { onClose: () => void }) {
    const [subject, setSubject] = useState("");

    return (
        <div className="mx-auto flex min-h-[calc(100dvh-24px)] w-full max-w-[440px] flex-col md:min-h-0 md:rounded-[28px] md:border md:border-line md:p-10">
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
                    launchFocus({kind: "free", subject: subject.trim()});
                }}
            >
                <div className="flex flex-col items-center pt-2 text-center">
                    <span className="ital text-[30px] leading-[34px]">Quand tu veux.</span>
                    <span className="serif text-[112px] leading-[116px] tracking-[-3px] tabular-nums">
                        {formatTimer(DEFAULT_FOCUS_SETTINGS.workMinutes * 60_000)}
                    </span>
                    <p className="m-0 mt-0.5 text-sm text-muted">{cycleSummary()}</p>
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

                <div className="mt-auto pt-8 pb-6 md:pb-0">
                    <BaseButton type="submit" size="large" className="w-full">
                        <PlayIcon size={18}/>
                        Lancer le focus
                    </BaseButton>
                </div>
            </form>
        </div>
    );
}
