"use client";

import {useEffect, useRef, useState} from "react";
import {toast} from "react-toastify/unstyled";
import {apiService} from "@/services/ApiService";
import {WEEKDAYS} from "@/server/domain/planning/days";
import {BaseButton} from "@/components/uiComponents/BaseButton";
import Stepper, {StepButton} from "@/components/uiComponents/Stepper";
import DayPicker from "@/components/uiComponents/DayPicker";
import Switch from "@/components/uiComponents/Switch";
import Spinner from "@/components/uiComponents/Spinner";
import PriorityIcon from "@/components/uiComponents/icons/PriorityIcon";
import {CloseIcon, PlusIcon} from "@/components/uiComponents/icons/icons";
import {PRIORITIES, priorityStyle} from "@/components/uiComponents/priority";
import {formatClock, formatDays, formatDuration, formatTimes} from "@/components/uiComponents/format";
import EditableValue from "@/components/uiComponents/EditableValue";
import {parseTimeToMinutes} from "@/server/domain/planning/time";
import {
    DEFAULT_FIXED_START, fixedTimes, MAX_DURATION, MIN_DURATION, maxTimes, parseClock, parseDuration, stepDuration,
    TIME_STEP, toggleDay, withEnd,
} from "@/components/activity/activityRules";

const EMPTY_DRAFT = {
    name: "",
    priority: 2,
    timesPerWeek: 2,
    timeToSpend: 60,
    days: [] as string[],
    /** Début de l'horaire fixe, en minutes ; null = libre. */
    fixedStart: null as number | null,
};

type Draft = typeof EMPTY_DRAFT;

/** La phrase jaune en bas de la fenêtre : ce que Schedula va comprendre. */
function summaryOf(draft: Draft): string {
    if (draft.days.length === 0) return "Choisis au moins un jour pour que Schedula puisse la caser.";
    const days = draft.days.length === 7 ? "n’importe quel jour" : formatDays(draft.days).toLowerCase();
    const fixed = draft.fixedStart !== null ? `, à ${formatClock(draft.fixedStart)}` : "";
    return `${formatTimes(draft.timesPerWeek)} par semaine, ${formatDuration(draft.timeToSpend)} à chaque fois, ${days}${fixed}, ${priorityStyle(draft.priority).summary}.`;
}

/**
 * Fenêtre « Nouvelle activité » : un <dialog> natif ouvert en modal (piège du
 * focus et Échap fournis par le navigateur). Panneau à droite sur bureau,
 * feuille montante sur mobile. Un seul objet d'état, comme l'ancien formulaire.
 */
export default function AddActivityDialog({open, onClose, onCreated}: {
    open: boolean,
    onClose: () => void,
    onCreated: () => void,
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    function update<K extends keyof Draft>(key: K, value: Draft[K]) {
        setDraft((previous) => ({...previous, [key]: value}));
    }

    function setDays(days: string[]) {
        setDraft((previous) => ({
            ...previous,
            days,
            timesPerWeek: Math.max(1, Math.min(previous.timesPerWeek, maxTimes(days))),
        }));
    }

    function close() {
        setDraft(EMPTY_DRAFT);
        onClose();
    }

    const invalid = !draft.name.trim() || draft.days.length === 0;
    // Horaires tels qu'ils seront enregistrés : la fin se déduit du début et de la durée.
    const fixed = draft.fixedStart !== null ? fixedTimes(draft.fixedStart, draft.timeToSpend) : null;
    const fixedEnd = fixed ? parseTimeToMinutes(fixed.endTime) : null;

    /** Début et durée ensemble, le début recalé pour que le bloc finisse avant minuit. */
    function setTiming(start: number | null, duration: number) {
        setDraft((previous) => ({
            ...previous,
            timeToSpend: duration,
            fixedStart: start === null ? null : parseTimeToMinutes(fixedTimes(start, duration).startTime),
        }));
    }

    function setEnd(end: number) {
        if (draft.fixedStart === null) return;
        const next = withEnd(draft.fixedStart, end);
        if (next) setTiming(draft.fixedStart, next.timeToSpend);
    }

    async function save() {
        if (invalid || saving) return;
        setSaving(true);
        try {
            await apiService.post("/api/activity", {
                name: draft.name.trim(),
                description: "",
                priority: draft.priority,
                isCompleted: false,
                isActive: true,
                timeToSpend: draft.timeToSpend,
                timesPerWeek: Math.min(draft.timesPerWeek, maxTimes(draft.days)),
                days: draft.days,
                ...(fixed ?? {startTime: "", endTime: ""}),
            });
            toast.success(`« ${draft.name.trim()} » est ajoutée.`);
            setDraft(EMPTY_DRAFT);
            onCreated();
        } catch {
            toast.error("L’activité n’a pas pu être ajoutée.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby="add-title"
            onCancel={(e) => {
                e.preventDefault();
                close();
            }}
            onClick={(e) => {
                // Un clic sur le fond (le <dialog> lui-même, hors du contenu) ferme.
                if (e.target === e.currentTarget) close();
            }}
            className="sheet mx-0 mt-auto mb-0 h-[calc(100dvh-44px)] max-h-none w-full max-w-none overflow-hidden rounded-t-[28px] bg-cream p-0 text-ink md:mt-0 md:mr-0 md:ml-auto md:h-dvh md:w-[560px] md:rounded-none md:rounded-l-[32px]"
        >
            <div className="flex h-full flex-col">
                <div className="thin-scroll flex min-h-0 grow flex-col gap-[22px] overflow-y-auto px-5 pt-6 pb-5 md:gap-[26px] md:px-10 md:pt-[34px]">
                    <div className="flex items-center gap-3">
                        <StepButton label="Fermer" onClick={close} className="size-10">
                            <CloseIcon size={14}/>
                        </StepButton>
                        <div className="eyebrow">Nouvelle activité</div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label id="add-title" htmlFor="draft-name" className="serif text-[28px] leading-8 md:text-[34px] md:leading-[38px]">
                            Qu’est-ce qui te fait envie ?
                        </label>
                        <input
                            id="draft-name"
                            value={draft.name}
                            onChange={(e) => update("name", e.target.value)}
                            placeholder="Piano, méditation, cuisine…"
                            maxLength={200}
                            autoComplete="off"
                            className="h-[60px] rounded-none border-0 border-b-2 border-ink bg-transparent px-0.5 text-2xl font-bold tracking-[-0.6px] text-ink outline-none hover:border-muted focus:border-ink md:text-[28px]"
                        />
                    </div>

                    <div className="flex flex-col gap-2.5">
                        <div className="eyebrow" id="imp-label">Son importance</div>
                        <div className="grid grid-cols-3 gap-2 md:gap-2.5" role="group" aria-labelledby="imp-label">
                            {PRIORITIES.map((p) => {
                                const on = draft.priority === p.value;
                                return (
                                    <button
                                        key={p.value}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => update("priority", p.value)}
                                        className={`flex flex-col gap-1 rounded-[20px] border-[1.5px] px-3 pt-3.5 pb-4 text-left text-ink transition-transform hover:border-ink active:scale-[.98] md:px-3.5 ${on ? `${p.softBg} ${p.dotBorder}` : "border-line bg-cream"}`}
                                    >
                                        <span className="flex items-center gap-2 text-base font-bold md:text-[17px]">
                                            <PriorityIcon priority={p.value}/>{p.label}
                                        </span>
                                        <span className="ital text-[15px] leading-[18px] md:text-base">{p.desc}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                        <div className="flex flex-col gap-2 rounded-[20px] border border-line px-4 py-3.5">
                            <div className="eyebrow">Combien de fois par semaine</div>
                            <Stepper
                                value={formatTimes(draft.timesPerWeek)}
                                valueClassName="serif text-[26px] leading-[30px] md:text-[28px]"
                                decrementLabel="Moins de fois"
                                incrementLabel="Plus de fois"
                                canDecrement={draft.timesPerWeek > 1}
                                canIncrement={draft.timesPerWeek < maxTimes(draft.days)}
                                onDecrement={() => update("timesPerWeek", draft.timesPerWeek - 1)}
                                onIncrement={() => update("timesPerWeek", draft.timesPerWeek + 1)}
                            />
                        </div>
                        <div className="flex flex-col gap-2 rounded-[20px] border border-line px-4 py-3.5">
                            <div className="eyebrow">Durée d’une séance</div>
                            <Stepper
                                value={<EditableValue value={draft.timeToSpend} format={formatDuration}
                                                      parse={parseDuration} label="Durée d’une séance"
                                                      onCommit={(minutes) => setTiming(draft.fixedStart, minutes)}
                                                      className="serif text-[26px] leading-[30px] md:text-[28px]"/>}
                                decrementLabel="Séances plus courtes"
                                incrementLabel="Séances plus longues"
                                canDecrement={draft.timeToSpend > MIN_DURATION}
                                canIncrement={draft.timeToSpend < MAX_DURATION}
                                onDecrement={() => setTiming(draft.fixedStart, stepDuration(draft.timeToSpend, -1))}
                                onIncrement={() => setTiming(draft.fixedStart, stepDuration(draft.timeToSpend, 1))}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-2.5">
                        <div className="flex items-baseline justify-between">
                            <div className="eyebrow">Jours possibles</div>
                            <div className="flex gap-1">
                                {[
                                    {label: "Semaine", days: WEEKDAYS.slice(0, 5)},
                                    {label: "Week-end", days: WEEKDAYS.slice(5)},
                                    {label: "Tous", days: WEEKDAYS.slice()},
                                ].map((preset) =>
                                    <button key={preset.label} type="button" onClick={() => setDays([...preset.days])}
                                            className="h-7 rounded-[14px] px-2.5 text-[13px] font-semibold text-ink underline underline-offset-[3px] hover:bg-line active:scale-95">
                                        {preset.label}
                                    </button>
                                )}
                            </div>
                        </div>
                        <DayPicker size="large" selected={draft.days} onToggle={(day) => setDays(toggleDay(draft.days, day))}/>
                    </div>

                    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-3">
                        <Switch
                            label="Horaire fixe"
                            checked={draft.fixedStart !== null}
                            onChange={(checked) => update("fixedStart", checked ? DEFAULT_FIXED_START : null)}
                        />
                        <div className="grow">
                            <div className="text-[15px] font-bold">Horaire fixe</div>
                            <div className="text-xs text-muted">Toujours à la même heure</div>
                        </div>
                        {draft.fixedStart !== null && fixedEnd !== null &&
                            <div className="flex w-full items-center gap-2 md:w-auto">
                                <div className="w-[150px]">
                                <Stepper
                                    value={<EditableValue value={draft.fixedStart} format={formatClock}
                                                          parse={parseClock} label="Heure de début"
                                                          onCommit={(start) => setTiming(start, draft.timeToSpend)}
                                                          className="serif text-2xl"/>}
                                    decrementLabel="Plus tôt"
                                    incrementLabel="Plus tard"
                                    canDecrement={draft.fixedStart > 0}
                                    canIncrement={draft.fixedStart + TIME_STEP + draft.timeToSpend < 24 * 60}
                                    onDecrement={() => update("fixedStart", Math.max(0, (draft.fixedStart ?? 0) - TIME_STEP))}
                                    onIncrement={() => update("fixedStart", (draft.fixedStart ?? 0) + TIME_STEP)}
                                />
                                </div>
                                <div className="text-muted" aria-hidden="true">→</div>
                                <div className="w-[76px]">
                                    <EditableValue value={fixedEnd} format={formatClock} parse={parseClock}
                                                   label="Heure de fin" onCommit={setEnd} className="serif h-[30px] text-2xl"/>
                                </div>
                            </div>
                        }
                    </div>

                    <div className="rounded-[22px] bg-butter px-5 py-4" aria-live="polite">
                        <div className="ital text-lg leading-[22px] md:text-xl md:leading-6">{summaryOf(draft)}</div>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-3 border-t border-line px-5 pt-4 pb-6 md:px-10 md:pt-[18px] md:pb-7">
                    <BaseButton theme="link" size="large" onClick={close} className="font-semibold">Annuler</BaseButton>
                    <div className="grow"/>
                    <BaseButton size="large" onClick={save} disabled={invalid || saving} ariaBusy={saving}>
                        {saving ? <Spinner/> : <PlusIcon size={16}/>}
                        Ajouter l’activité
                    </BaseButton>
                </div>
            </div>
        </dialog>
    );
}
