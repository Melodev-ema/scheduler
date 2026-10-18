"use client";

import {useEffect, useRef, useState} from "react";
import {toast} from "react-toastify/unstyled";
import {apiService} from "@/services/ApiService";
import type {TaskInterface} from "@/models/Task";
import {BaseButton} from "@/components/uiComponents/BaseButton";
import Stepper, {StepButton} from "@/components/uiComponents/Stepper";
import Spinner from "@/components/uiComponents/Spinner";
import PriorityIcon from "@/components/uiComponents/icons/PriorityIcon";
import {CloseIcon} from "@/components/uiComponents/icons/icons";
import {PRIORITIES} from "@/components/uiComponents/priority";
import {formatDuration} from "@/components/uiComponents/format";
import {LateBadge} from "@/components/task/TaskBadges";
import {
    isOverdue, slotProblem, stepTaskMinutes, TASK_MAX_MINUTES, TASK_MIN_MINUTES, toDateInput,
} from "@/components/task/taskRules";

const MAX_TITLE = 200;

const EMPTY_DRAFT = {
    title: "",
    description: "",
    minutes: TASK_MIN_MINUTES,
    priority: 2,
    /** "YYYY-MM-DD" ; "" = sans échéance. */
    dueDate: "",
    startTime: "",
    endTime: "",
};

type Draft = typeof EMPTY_DRAFT;

/** Champ du design (`fld`) ; la couleur du contour s'ajoute à part, pour pouvoir passer au corail. */
const FIELD = "rounded-2xl border bg-cream text-ink transition-colors duration-100 hover:border-muted focus:border-ink";

function draftOf(task: TaskInterface | null, initialTitle: string): Draft {
    if (!task) return {...EMPTY_DRAFT, title: initialTitle.slice(0, MAX_TITLE)};
    return {
        title: task.title,
        description: task.description,
        minutes: task.minutes,
        priority: task.priority,
        dueDate: toDateInput(task.dueDate),
        startTime: task.startTime,
        endTime: task.endTime,
    };
}

/**
 * Création détaillée ou édition d'une tâche : un <dialog> natif ouvert en
 * modal, panneau à droite sur bureau, feuille montante sur mobile — comme
 * `AddActivityDialog`. Un seul objet d'état.
 */
export default function TaskDialog({open, task, initialTitle, onClose, onSaved}: {
    open: boolean,
    task: TaskInterface | null,
    initialTitle: string,
    onClose: () => void,
    onSaved: () => void,
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleRef = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (open && !dialog.open) {
            setDraft(draftOf(task, initialTitle));
            dialog.showModal();
            // showModal() donne le focus au premier bouton (« Fermer ») : on le place sur le titre, là où l'on tape.
            titleRef.current?.focus();
        }
        if (!open && dialog.open) dialog.close();
    }, [open, task, initialTitle]);

    function update<K extends keyof Draft>(key: K, value: Draft[K]) {
        setDraft((previous) => ({...previous, [key]: value}));
    }

    const problem = slotProblem(draft.startTime, draft.endTime);
    const halfSlot = (draft.startTime === "") !== (draft.endTime === "");
    const invalid = !draft.title.trim() || problem !== "";
    const overdue = task !== null && isOverdue({dueDate: draft.dueDate || null, done: task.done}, new Date());

    async function save() {
        if (invalid || saving) return;
        setSaving(true);
        const body = {
            title: draft.title.trim(),
            description: draft.description,
            minutes: draft.minutes,
            priority: draft.priority,
            // null, pas undefined : Zod retire les clés undefined, et une échéance effacée doit l'être en base.
            dueDate: draft.dueDate === "" ? null : draft.dueDate,
            startTime: draft.startTime,
            endTime: draft.endTime,
        };
        try {
            if (task) {
                await apiService.post(`/api/task/${task._id}`, body);
            } else {
                await apiService.post("/api/task", body);
            }
            toast.success(`« ${body.title} » est enregistrée.`);
            onSaved();
        } catch {
            toast.error("La tâche n’a pas pu être enregistrée.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby="task-title"
            onCancel={(e) => {
                e.preventDefault();
                onClose();
            }}
            onClick={(e) => {
                // Un clic sur le fond (le <dialog> lui-même, hors du contenu) ferme.
                if (e.target === e.currentTarget) onClose();
            }}
            className="sheet mx-0 mt-auto mb-0 h-[calc(100dvh-44px)] max-h-none w-full max-w-none overflow-hidden rounded-t-[28px] bg-cream p-0 text-ink md:mt-0 md:mr-0 md:ml-auto md:h-dvh md:w-[560px] md:rounded-none md:rounded-l-[32px]"
        >
            <form
                className="flex h-full flex-col"
                onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                }}
            >
                <div aria-hidden="true" className="flex shrink-0 justify-center pt-2.5 md:hidden">
                    <span className="h-[5px] w-10 rounded-full bg-line"/>
                </div>

                <div className="thin-scroll flex min-h-0 grow flex-col gap-5 overflow-y-auto px-5 pt-2 pb-4 md:px-10 md:pt-[34px]">
                    <div className="flex items-center justify-between gap-3">
                        <h2 id="task-title" className="m-0 text-[28px] leading-[1.1] font-extrabold tracking-[-1px] md:text-[34px]">
                            {task ? "Modifier la tâche" : "Nouvelle tâche"}
                        </h2>
                        <StepButton label="Fermer" onClick={onClose} className="size-11">
                            <CloseIcon size={14} strokeWidth={2.2}/>
                        </StepButton>
                    </div>

                    {overdue &&
                        <div className="flex flex-wrap items-center gap-2.5">
                            <LateBadge/>
                            <span className="text-[13px]">Elle passera en premier à la prochaine génération.</span>
                        </div>
                    }

                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between">
                            <label htmlFor="task-field-title" className="eyebrow">Titre</label>
                            <span className="text-xs text-muted">{draft.title.length}/{MAX_TITLE}</span>
                        </div>
                        <input id="task-field-title" ref={titleRef} required maxLength={MAX_TITLE} value={draft.title}
                               onChange={(e) => update("title", e.target.value)}
                               placeholder="Appeler le plombier" autoComplete="off"
                               className={`${FIELD} h-[52px] border-line px-4 text-lg font-bold placeholder:font-normal`}/>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="task-field-desc" className="eyebrow">Description</label>
                        <textarea id="task-field-desc" rows={3} maxLength={2000} value={draft.description}
                                  onChange={(e) => update("description", e.target.value)}
                                  placeholder="Un détail utile, un numéro…"
                                  className={`${FIELD} resize-y border-line px-4 py-3 text-[15px] leading-[21px]`}/>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="flex flex-col gap-1.5">
                            <div className="eyebrow" id="task-dur">Durée</div>
                            <div role="group" aria-labelledby="task-dur"
                                 className="flex h-[52px] items-center rounded-2xl border border-line px-2">
                                <div className="w-full">
                                    <Stepper
                                        value={formatDuration(draft.minutes)}
                                        valueClassName="serif text-xl"
                                        decrementLabel="Moins 15 minutes"
                                        incrementLabel="Plus 15 minutes"
                                        canDecrement={draft.minutes > TASK_MIN_MINUTES}
                                        canIncrement={draft.minutes < TASK_MAX_MINUTES}
                                        onDecrement={() => update("minutes", stepTaskMinutes(draft.minutes, -1))}
                                        onIncrement={() => update("minutes", stepTaskMinutes(draft.minutes, 1))}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <div className="eyebrow" id="task-prio">Priorité</div>
                            <div role="group" aria-labelledby="task-prio" className="flex h-[52px] gap-1 rounded-2xl bg-line p-1">
                                {PRIORITIES.map((p) => {
                                    const on = draft.priority === p.value;
                                    return (
                                        <button
                                            key={p.value}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => update("priority", p.value)}
                                            className={`flex grow items-center justify-center gap-[5px] rounded-xl px-2 text-[13px] whitespace-nowrap font-bold text-ink transition-[transform,background-color] duration-100 active:scale-95 ${on ? p.softBg : "bg-transparent hover:bg-cream"}`}
                                        >
                                            <PriorityIcon priority={p.value} className="size-[7px]"/>
                                            {p.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="task-field-due" className="eyebrow">Échéance</label>
                        <input id="task-field-due" type="date" value={draft.dueDate}
                               onChange={(e) => update("dueDate", e.target.value)}
                               className={`${FIELD} h-[52px] border-line px-4 text-base`}/>
                    </div>

                    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                        <legend className="eyebrow mb-1.5 p-0">
                            Créneau fixe <span className="font-medium tracking-normal normal-case">(facultatif)</span>
                        </legend>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <label htmlFor="task-field-start" className="text-[13px] font-semibold">Début</label>
                                <input id="task-field-start" type="time" value={draft.startTime}
                                       onChange={(e) => update("startTime", e.target.value)}
                                       aria-describedby="task-slot-help" aria-invalid={halfSlot && !draft.startTime}
                                       className={`${FIELD} h-[52px] px-3.5 text-base ${halfSlot && !draft.startTime ? "border-coral" : "border-line"}`}/>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label htmlFor="task-field-end" className="text-[13px] font-semibold">Fin</label>
                                <input id="task-field-end" type="time" value={draft.endTime}
                                       onChange={(e) => update("endTime", e.target.value)}
                                       aria-describedby="task-slot-help" aria-invalid={halfSlot && !draft.endTime}
                                       className={`${FIELD} h-[52px] px-3.5 text-base ${halfSlot && !draft.endTime ? "border-coral" : "border-line"}`}/>
                            </div>
                        </div>
                        <div id="task-slot-help" role="status" className="min-h-[18px]">
                            {problem &&
                                <div className="flex items-start gap-2 text-[13px] leading-[18px] font-semibold">
                                    <span className="mt-[5px] size-[7px] shrink-0 rounded-full bg-coral" aria-hidden="true"/>
                                    <span>{problem}</span>
                                    <button type="button"
                                            onClick={() => setDraft((previous) => ({...previous, startTime: "", endTime: ""}))}
                                            className="ml-auto shrink-0 bg-transparent p-0 text-[13px] font-semibold text-ink underline underline-offset-[3px]">
                                        Effacer
                                    </button>
                                </div>
                            }
                        </div>
                    </fieldset>
                </div>

                <div className="flex shrink-0 items-center gap-3 border-t border-line px-5 pt-3.5 pb-[22px] md:px-10 md:pb-7">
                    <BaseButton theme="link" size="large" onClick={onClose} className="font-semibold">Annuler</BaseButton>
                    <div className="grow"/>
                    <BaseButton type="submit" size="large" disabled={invalid || saving} ariaBusy={saving}>
                        {saving && <Spinner/>}
                        {task ? "Enregistrer" : "Ajouter"}
                    </BaseButton>
                </div>
            </form>
        </dialog>
    );
}
