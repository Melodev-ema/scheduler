"use client";

import {useEffect, useState} from "react";
import {toast} from "react-toastify/unstyled";
import {apiService} from "@/services/ApiService";
import type {TaskInterface} from "@/models/Task";
import {BaseButton} from "@/components/uiComponents/BaseButton";
import {StepButton} from "@/components/uiComponents/Stepper";
import PriorityIcon from "@/components/uiComponents/icons/PriorityIcon";
import {CheckIcon, CircleCheckIcon, TrashIcon} from "@/components/uiComponents/icons/icons";
import TaskDialog from "@/components/task/TaskDialog";
import {LateBadge, TaskMark} from "@/components/task/TaskBadges";
import {isOverdue, sortTasks, taskMeta, taskSummary} from "@/components/task/taskRules";

const SKELETON_WIDTHS = ["w-[62%]", "w-[44%]", "w-[70%]", "w-[52%]"];

/**
 * Onglet « Tâches » : ajout rapide par le titre, le reste dans TaskDialog.
 * Cocher et supprimer mettent l'état local à jour d'abord, puis rechargent
 * si l'API refuse — comme l'écran Activités.
 */
export default function TaskList() {
    const [tasks, setTasks] = useState<TaskInterface[] | null>(null);
    const [version, setVersion] = useState(0);
    const [quickTitle, setQuickTitle] = useState("");
    const [adding, setAdding] = useState(false);
    const [dialog, setDialog] = useState<{ open: boolean, task: TaskInterface | null }>({open: false, task: null});

    useEffect(() => {
        let alive = true;
        apiService.get<{ data: TaskInterface[] }>("/api/task")
            .then(({data}) => {
                if (alive) setTasks(sortTasks(data));
            })
            .catch(() => {
                if (!alive) return;
                setTasks([]);
                toast.error("Les tâches n’ont pas pu être chargées.");
            });
        return () => {
            alive = false;
        };
    }, [version]);

    const reload = () => setVersion((v) => v + 1);

    async function quickAdd() {
        const title = quickTitle.trim();
        if (!title || adding) return;
        setAdding(true);
        try {
            await apiService.post("/api/task", {title});
            setQuickTitle("");
            reload();
        } catch {
            toast.error("La tâche n’a pas pu être ajoutée.");
        } finally {
            setAdding(false);
        }
    }

    function toggle(task: TaskInterface) {
        setTasks((list) => list && sortTasks(list.map((t) => t._id === task._id ? {...t, done: !t.done} : t)));
        apiService.post(`/api/task/${task._id}`, {done: !task.done})
            .catch(() => {
                toast.error("La tâche n’a pas pu être mise à jour.");
                reload();
            });
    }

    function remove(task: TaskInterface) {
        setTasks((list) => list && list.filter((t) => t._id !== task._id));
        apiService.delete(`/api/task/${task._id}`, {})
            .then(() => toast.success(`« ${task.title} » est supprimée.`))
            .catch(() => {
                toast.error("La tâche n’a pas pu être supprimée.");
                reload();
            });
    }

    const now = new Date();
    const todo = tasks?.filter((task) => !task.done) ?? [];
    const done = tasks?.filter((task) => task.done) ?? [];

    function row(task: TaskInterface) {
        return (
            <TaskRow key={task._id} task={task} overdue={isOverdue(task, now)}
                     onToggle={() => toggle(task)}
                     onOpen={() => setDialog({open: true, task})}
                     onRemove={() => remove(task)}/>
        );
    }

    return (
        <div className="flex flex-col gap-9 lg:flex-row">
            <div className="flex min-w-0 grow flex-col gap-3.5 md:gap-[18px]">
                <div className="flex flex-col md:flex-row md:items-baseline md:gap-3.5">
                    <h1 className="m-0 text-[32px] leading-9 font-extrabold tracking-[-1.2px] md:text-[40px] md:leading-[44px] md:tracking-[-1.4px]">
                        Tâches
                    </h1>
                    <div className="ital hidden text-[22px] text-muted md:block">ce qui ne revient pas chaque semaine</div>
                    {tasks &&
                        <div className="mt-0.5 text-[13px] font-semibold md:mt-0 md:ml-auto md:text-sm">
                            {taskSummary(tasks, now)}
                        </div>
                    }
                </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void quickAdd();
                    }}
                    className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2.5 md:rounded-[28px] md:border-[1.5px] md:border-ink md:py-2 md:pr-2 md:pl-[22px] md:transition-shadow md:focus-within:shadow-[0_0_0_4px_var(--color-line)]"
                >
                    <label htmlFor="quick-task" className="sr-only">Nouvelle tâche</label>
                    <input
                        id="quick-task"
                        value={quickTitle}
                        onChange={(e) => setQuickTitle(e.target.value)}
                        maxLength={200}
                        placeholder="Une chose à faire cette semaine…"
                        autoComplete="off"
                        enterKeyHint="done"
                        className="h-[54px] w-full min-w-0 rounded-[18px] border-[1.5px] border-ink bg-cream px-4 text-[17px] font-semibold text-ink md:h-12 md:grow md:rounded-none md:border-0 md:bg-transparent md:px-0 md:text-lg md:focus-visible:outline-none"
                    />
                    <div className="flex gap-2 md:contents">
                        <BaseButton theme="secondary" onClick={() => setDialog({open: true, task: null})}
                                    className="grow basis-0 md:grow-0 md:basis-auto">
                            Plus d’options
                        </BaseButton>
                        <BaseButton type="submit" disabled={!quickTitle.trim() || adding} ariaBusy={adding}
                                    className="grow basis-0 md:grow-0 md:basis-auto">
                            Ajouter
                        </BaseButton>
                    </div>
                </form>

                {tasks === null &&
                    <div role="status" aria-label="Chargement des tâches"
                         className="overflow-hidden rounded-[22px] border border-line md:rounded-3xl">
                        {SKELETON_WIDTHS.map((width) =>
                            <div key={width}
                                 className="flex items-center gap-3 border-t border-line px-3.5 py-4 first:border-t-0 md:gap-3.5 md:px-4">
                                <span className="size-7 shrink-0 animate-pulse rounded-full bg-line motion-reduce:animate-none"/>
                                <span className="flex grow flex-col gap-2">
                                    <span className={`h-3.5 animate-pulse rounded-full bg-line motion-reduce:animate-none ${width}`}/>
                                    <span className="h-2.5 w-[40%] animate-pulse rounded-full bg-line motion-reduce:animate-none md:w-[30%]"/>
                                </span>
                            </div>
                        )}
                    </div>
                }

                {tasks?.length === 0 &&
                    <div className="flex flex-col items-center gap-2.5 rounded-[22px] border-[1.5px] border-dashed border-muted px-[22px] py-9 text-center md:rounded-3xl md:px-8 md:py-12">
                        <CircleCheckIcon size={40} strokeWidth={1.6}/>
                        <p className="ital m-0 max-w-[460px] text-[21px] leading-[25px] md:text-2xl md:leading-7">
                            Aucune tâche. Note ici ce qui ne revient pas chaque semaine.
                        </p>
                    </div>
                }

                {todo.length > 0 &&
                    <ul aria-label="Tâches à faire"
                        className="m-0 list-none overflow-hidden rounded-[22px] border border-line p-0 md:rounded-3xl">
                        {todo.map(row)}
                    </ul>
                }

                {done.length > 0 &&
                    <>
                        <div className="eyebrow px-1 pt-1 md:pt-1.5">Faites</div>
                        <ul aria-label="Tâches faites"
                            className="m-0 list-none overflow-hidden rounded-[22px] border border-line p-0 md:rounded-3xl">
                            {done.map(row)}
                        </ul>
                    </>
                }

                <div className="flex flex-col gap-2 px-0.5 pt-1.5 lg:hidden">
                    <div className="flex items-start gap-2 text-[13px] leading-[18px]">
                        <LateBadge/><span>passe en premier à la prochaine génération.</span>
                    </div>
                    <p className="m-0 text-[13px] leading-[18px] text-muted">
                        Cocher le créneau d’une tâche dans « Ma semaine » la coche aussi ici. Une tâche non cochée revient la semaine suivante.
                    </p>
                </div>
            </div>

            <aside className="hidden w-80 shrink-0 flex-col gap-3.5 pt-1.5 lg:flex">
                <h2 className="serif m-0 text-[26px] leading-[30px]">Comment ça marche</h2>
                <div className="flex flex-col rounded-3xl border border-line px-5 py-1.5">
                    <div className="flex flex-col gap-1.5 py-3.5">
                        <div className="text-[15px] font-bold">Casées entre tes activités</div>
                        <p className="m-0 text-[13px] leading-[18px] text-muted">
                            À chaque génération, Schedula place tes tâches dans les trous de ta semaine. Une tâche non cochée revient la semaine suivante.
                        </p>
                    </div>
                    <div className="flex flex-col gap-1.5 border-t border-line py-3.5">
                        <LateBadge/>
                        <p className="m-0 text-[13px] leading-[18px] text-muted">
                            L’échéance est passée : la tâche passe en premier à la prochaine génération.
                        </p>
                    </div>
                    <div className="flex flex-col gap-1.5 border-t border-line py-3.5">
                        <div className="flex items-center gap-2">
                            <TaskMark/><span className="text-[13px] font-bold">dans ton planning</span>
                        </div>
                        <p className="m-0 text-[13px] leading-[18px] text-muted">
                            Cocher son créneau dans « Ma semaine » la coche aussi ici. Cocher ici ne touche pas au planning.
                        </p>
                    </div>
                </div>
            </aside>

            <TaskDialog
                open={dialog.open}
                task={dialog.task}
                initialTitle={quickTitle.trim()}
                onClose={() => setDialog({open: false, task: null})}
                onSaved={() => {
                    setDialog({open: false, task: null});
                    setQuickTitle("");
                    reload();
                }}
            />
        </div>
    );
}

/** Une ligne : rond à cocher, titre et détails (ouvre l'édition), corbeille. */
function TaskRow({task, overdue, onToggle, onOpen, onRemove}: {
    task: TaskInterface,
    overdue: boolean,
    onToggle: () => void,
    onOpen: () => void,
    onRemove: () => void,
}) {
    const meta = taskMeta(task);
    return (
        <li className="flex items-center gap-1 border-t border-line py-1 pr-0.5 pl-1.5 transition-colors duration-100 first:border-t-0 hover:bg-line md:gap-2 md:pr-3 md:pl-2">
            <button
                type="button"
                aria-pressed={task.done}
                aria-label={`${task.done ? "Marquer comme à faire" : "Marquer comme faite"} : ${task.title}`}
                onClick={onToggle}
                className="group flex size-11 shrink-0 items-center justify-center rounded-xl p-0"
            >
                <span
                    className={`flex size-7 items-center justify-center rounded-full border-[1.5px] border-ink transition-shadow duration-100 group-hover:shadow-[0_0_0_3px_var(--color-line)] ${task.done ? "bg-ink text-butter" : "bg-transparent"}`}>
                    {task.done && <CheckIcon size={13} strokeWidth={3.5}/>}
                </span>
            </button>
            <button
                type="button"
                onClick={onOpen}
                aria-label={`Modifier la tâche : ${task.title}, ${meta}${overdue ? ", en retard" : ""}`}
                className="flex min-w-0 grow flex-col gap-1 rounded-xl bg-transparent py-2.5 text-left text-ink md:gap-[3px] md:py-1.5"
            >
                <span className="flex min-w-0 items-center gap-[7px] md:gap-2">
                    {!task.done && <PriorityIcon priority={task.priority} className="size-2"/>}
                    <span className={`truncate text-base font-bold ${task.done ? "text-muted line-through" : ""}`}>
                        {task.title}
                    </span>
                    {overdue && <span className="hidden shrink-0 md:inline-flex"><LateBadge/></span>}
                </span>
                <span className="text-[13px] leading-[17px] text-muted">{meta}</span>
                {overdue && <span className="flex self-start md:hidden"><LateBadge/></span>}
            </button>
            <StepButton ghost label={`Supprimer : ${task.title}`} onClick={onRemove} className="size-11 md:size-10">
                <TrashIcon size={16} className="text-muted"/>
            </StepButton>
        </li>
    );
}
