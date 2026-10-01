"use client";

import {useState} from "react";
import Link from "next/link";
import {toast} from "react-toastify";
import {PlanningInterface} from "@/models/Planning";
import {ScheduleInterface} from "@/models/Schedule";
import {apiService} from "@/services/ApiService";
import {WEEKDAYS, weekdayFromDate} from "@/server/domain/planning/days";
import {parseTimeToMinutes} from "@/server/domain/planning/time";
import {lunchBreakOf} from "@/server/domain/planning/lunchBreak";
import {isCurrentWeek, isFrozen, sessionPartsOf} from "@/server/domain/planning/partial";
import DayTimeline, {DayItems, SlotFocus} from "@/components/planning/DayTimeline";
import {canFocus, isFocusOn, targetOf} from "@/server/domain/focus/target";
import {useFocus} from "@/components/focus/focusStore";
import {useFocusLauncher} from "@/components/focus/SwitchFocusDialog";
import {useRouter} from "next/navigation";
import GenerateButton from "@/components/planning/GenerateButton";
import {useWeek} from "@/components/planning/useWeek";
import Spinner from "@/components/uiComponents/Spinner";
import PriorityIcon from "@/components/uiComponents/icons/PriorityIcon";
import {AlertIcon, CloseIcon} from "@/components/uiComponents/icons/icons";
import {PRIORITIES, priorityStyle} from "@/components/uiComponents/priority";
import {
    addDays, DAY_SHORT, formatLongDate, formatShortDate, formatTimes, isSameDay, mondayOf,
} from "@/components/uiComponents/format";

interface ProgressRow {
    name: string;
    priority: number;
    planned: number;
    done: number;
    /** Séances demandées que le planning n'a pas placées. */
    missing: number;
}

/**
 * Avancement par activité, lu dans le planning lui-même : `activities` est ce
 * qui a été demandé au modèle (`sessions`), `schedule` ce qu'il a placé. Les
 * anciens instantanés n'ont pas `sessions` : on compte alors les créneaux.
 */
function progressOf(planning: PlanningInterface): ProgressRow[] {
    const schedule = planning.schedule ?? [];
    return (planning.activities ?? [])
        .map((activity) => {
            const slots = schedule.filter((slot) => slot.activity === activity.name);
            const planned = activity.sessions ?? slots.length;
            const done = Math.min(planned, slots.filter((slot) => slot.status === "done").length);
            return {
                name: activity.name,
                priority: activity.priority,
                planned,
                done,
                missing: Math.max(0, planned - slots.length),
            };
        })
        .filter((row) => row.planned > 0)
        .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, "fr"));
}

/**
 * Bandeaux masquables (règles non respectées, explication du modèle), masqués
 * pour un planning donné. Préférence locale au navigateur : une nouvelle
 * génération (autre `_id`) les réaffiche. Lue seulement une fois le planning
 * chargé, donc jamais au rendu serveur.
 */
type Dismissable = "violations" | "note";

function readHidden(kind: Dismissable): string | null {
    try {
        return localStorage.getItem(`scheduler:hidden-${kind}`);
    } catch {
        return null;
    }
}

function writeHidden(kind: Dismissable, planningId: string) {
    try {
        localStorage.setItem(`scheduler:hidden-${kind}`, planningId);
    } catch {
        // Stockage indisponible : le bandeau reste masqué jusqu'au rechargement.
    }
}

function HideButton({onClick}: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label="Masquer ce message"
            title="Masquer ce message"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-line hover:text-ink"
        >
            <CloseIcon size={13}/>
        </button>
    );
}

function startMinutes(slot: ScheduleInterface): number {
    try {
        return parseTimeToMinutes(slot.startTime);
    } catch {
        return 0;
    }
}

export default function WeeklyPlanning() {
    const {planning, loaded, stale, setPlanning, reload, generating} = useWeek();
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [noteOpen, setNoteOpen] = useState(false);
    const [hidden, setHidden] = useState<Partial<Record<Dismissable, string>>>({});
    const focusState = useFocus().state;
    const focusLauncher = useFocusLauncher();
    const router = useRouter();

    if (!loaded) {
        return (
            <div className="flex items-center gap-3 py-10 text-muted" role="status">
                <Spinner/> Chargement de ta semaine…
            </div>
        );
    }

    const today = new Date();
    const monday = mondayOf(planning ? new Date(planning.timestamp) : today);
    const sunday = addDays(monday, 6);

    const priorityByName = new Map((planning?.activities ?? []).map((a) => [a.name, a.priority]));
    const priorityOf = (name: string) => priorityByName.get(name) ?? 2;

    const days = WEEKDAYS.map((day, index) => {
        const date = addDays(monday, index);
        return {
            day,
            label: DAY_SHORT[index],
            date: String(date.getDate()),
            isToday: isSameDay(date, today),
            slots: (planning?.schedule ?? [])
                .filter((slot) => slot.day === day)
                .sort((a, b) => startMinutes(a) - startMinutes(b)),
        };
    });
    // Un week-end sans rien, sur bureau : deux colonnes étroites au lieu de deux pleines.
    const emptyWeekend = days.slice(5).every((d) => d.slots.length === 0);
    const todayIndex = days.findIndex((d) => d.isToday);
    const selected = days[selectedDay ?? (todayIndex >= 0 ? todayIndex : 0)];

    const progress = planning ? progressOf(planning) : [];
    const planned = progress.reduce((sum, row) => sum + row.planned, 0);
    const done = progress.reduce((sum, row) => sum + row.done, 0);
    const percent = planned ? Math.round(done / planned * 100) : 0;

    function toggle(slot: ScheduleInterface) {
        if (!planning || generating) return;
        const status = slot.status === "done" ? "pending" : "done";
        // Optimiste : la coche apparaît tout de suite, et revient si l'API refuse.
        setPlanning((p) => ({
            ...p,
            schedule: p.schedule.map((s) => s._id === slot._id ? {...s, status} : s),
        }));
        apiService.post("/api/schedule/status", {status, id: slot._id, planningId: planning._id})
            .catch(() => {
                toast.error("Impossible d’enregistrer ce créneau.");
                reload();
            });
    }

    // Calculé au rendu : suffisant pour une page qu'on recharge à chaque action.
    const currentWeek = planning !== null && isCurrentWeek(planning.timestamp, today);
    const weekday = weekdayFromDate(today);
    const nowMinutes = today.getHours() * 60 + today.getMinutes();

    /**
     * Seule une séance à venir se verrouille : faite ou commencée, elle est déjà
     * gardée. Jugé sur la séance entière — une séance coupée dont la matinée est
     * passée est gardée d'un bloc, son après-midi n'a rien à verrouiller.
     */
    function canLock(slot: ScheduleInterface): boolean {
        return currentWeek && planning !== null && sessionPartsOf(planning.schedule, slot)
            .every((part) => !isFrozen({...part, locked: false}, weekday, nowMinutes));
    }

    function lock(slot: ScheduleInterface) {
        if (!planning || generating) return;
        // Les deux moitiés d'une séance coupée se verrouillent ensemble.
        const ids = sessionPartsOf(planning.schedule, slot).map((s) => s._id);
        const locked = slot.locked !== true;
        setPlanning((p) => ({
            ...p,
            schedule: p.schedule.map((s) => ids.includes(s._id) ? {...s, locked} : s),
        }));
        apiService.post("/api/schedule/lock", {planningId: planning._id, ids, locked})
            .catch(() => {
                toast.error("Impossible de verrouiller ce créneau.");
                reload();
            });
    }

    /** Le ▶ des créneaux du jour : lancer un focus, ou rouvrir celui qui tourne. */
    const activeFocus = focusState && focusState.status !== "finished" ? focusState : null;
    const focus: SlotFocus = {
        canFocus: (slot) => planning !== null && canFocus(slot, planning, today),
        isFocused: (slot) => isFocusOn(activeFocus?.target, slot),
        onFocus: (slot) => {
            if (!planning || generating) return;
            if (isFocusOn(activeFocus?.target, slot)) router.push("/focus");
            else focusLauncher.launch(targetOf(slot, planning));
        },
    };

    const title = (
        <div className="flex flex-wrap items-baseline gap-x-3.5">
            <h1 className="serif m-0 text-[30px] leading-[34px] xl:text-[36px] xl:leading-10">
                Semaine du {formatShortDate(monday)}
            </h1>
            <div className="ital text-[19px] text-muted xl:text-[19px]">au {formatLongDate(sunday)}</div>
        </div>
    );

    const legend = (
        <div className="flex items-center gap-3.5">
            <span className="eyebrow hidden xl:inline">Priorité</span>
            {PRIORITIES.map((p) =>
                <span key={p.value} className="flex items-center gap-1.5 text-xs font-semibold xl:text-[13px]">
                    <PriorityIcon priority={p.value} className="size-[9px] xl:size-2.5"/>{p.label}
                </span>
            )}
        </div>
    );

    const hero = (
        <div
            className="flex shrink-0 items-center gap-4 rounded-3xl bg-ink px-5 py-[18px] text-cream xl:w-[320px] xl:gap-4 xl:rounded-[26px] xl:px-6 xl:py-4">
            <div className="serif text-[54px] leading-[54px] text-butter xl:text-[64px] xl:leading-[64px]">{percent}%</div>
            <div className="flex flex-col gap-1 xl:gap-1.5">
                <div className="ital text-[19px] leading-5 xl:text-[21px] xl:leading-[22px]">
                    de ta semaine,<br className="hidden xl:inline"/> déjà faite.
                </div>
                <div className="text-xs text-line">{done} séances sur {planned} prévues</div>
            </div>
        </div>
    );

    const progressList = (
        <div className="grid grid-cols-1 gap-x-5 xl:grid-cols-4 xl:gap-y-2">
            {progress.map((row) =>
                <div key={row.name}
                     className="flex min-w-0 flex-col gap-1.5 border-t border-line py-2.5 xl:border-0 xl:py-0">
                    <div className="flex items-baseline gap-1.5">
                        <PriorityIcon priority={row.priority} className="size-2 self-center"/>
                        <div className="min-w-0 grow break-words hyphens-auto text-[15px] font-bold xl:text-sm">{row.name}</div>
                        <div className="shrink-0 text-[13px] text-muted xl:text-xs">{row.done} / {formatTimes(row.planned)}</div>
                    </div>
                    <progress
                        max={row.planned}
                        value={row.done}
                        aria-label={`${row.name} : ${row.done} séances faites sur ${row.planned}`}
                        className={`h-1.5 w-full appearance-none overflow-hidden rounded-[3px] bg-line [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:rounded-[3px] [&::-moz-progress-bar]:rounded-[3px] ${priorityStyle(row.priority).progressFill}`}
                    />
                    {row.missing > 0 &&
                        <div className="self-start rounded-md bg-butter px-1.5 py-0.5 text-xs font-semibold xl:text-[11px]">
                            {formatTimes(row.missing)} sans créneau
                        </div>
                    }
                </div>
            )}
        </div>
    );

    const staleBanner = stale &&
        <div role="status" className="flex items-center gap-2.5 rounded-2xl bg-butter px-4 py-2.5 text-sm xl:py-1.5">
            <AlertIcon className="hidden shrink-0 xl:block"/>
            <span>Tes activités ont changé. <span className="ital text-[17px]">Génère à nouveau</span> pour remettre ta semaine d’aplomb.</span>
        </div>;

    const isHidden = (kind: Dismissable) => !!planning
        && (hidden[kind] === planning._id || readHidden(kind) === planning._id);

    function hide(kind: Dismissable) {
        if (!planning) return;
        writeHidden(kind, planning._id);
        setHidden((previous) => ({...previous, [kind]: planning._id}));
    }

    const noteBlock = planning?.note && !isHidden("note") &&
        <div className="flex items-start gap-2 rounded-2xl border border-line py-1.5 ps-4 pe-1.5 text-sm">
            <div className="flex min-w-0 grow flex-col items-start py-1.5">
                {/* Deux lignes sur bureau, pour garder la semaine visible sans défiler. */}
                <p className={`m-0 ${noteOpen ? "" : "xl:line-clamp-2"}`}>
                    <span className="font-semibold">Pourquoi cette semaine ? </span>
                    <span className="text-muted">{planning.note}</span>
                </p>
                <button type="button" onClick={() => setNoteOpen((open) => !open)} aria-expanded={noteOpen}
                        className="hidden text-xs font-semibold text-ink underline underline-offset-2 xl:block">
                    {noteOpen ? "Réduire" : "Lire la suite"}
                </button>
            </div>
            <HideButton onClick={() => hide("note")}/>
        </div>;

    const violations = isHidden("violations") ? [] : planning?.violations ?? [];
    const sacrifices = planning?.sacrifices ?? [];
    const rulesBlock = (violations.length > 0 || sacrifices.length > 0) &&
        <div className="flex flex-col gap-3">
            {violations.length > 0 &&
                <div role="alert"
                     className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-coral px-4 py-3.5 text-sm md:flex-row xl:py-2.5 md:items-start">
                    <div className="grow">
                        <p className="font-bold">Cette semaine ne respecte pas toutes les règles.</p>
                        <ul className="mt-1.5 list-disc ps-5">
                            {violations.map((violation, index) => <li key={index}>{violation}</li>)}
                        </ul>
                    </div>
                    <div className="flex items-center gap-2 self-start">
                        <GenerateButton compact theme="secondary" label="Relancer"/>
                        <HideButton onClick={() => hide("violations")}/>
                    </div>
                </div>
            }
            {sacrifices.length > 0 &&
                <details className="rounded-2xl border border-line px-4 py-3 text-sm">
                    <summary className="cursor-pointer font-semibold">
                        Sacrifié cette semaine <span className="text-muted">({sacrifices.length})</span>
                    </summary>
                    <ul className="mt-2 list-disc ps-5 text-muted">
                        {sacrifices.map((sacrifice, index) =>
                            <li key={index}>
                                <span className="font-semibold text-ink">{sacrifice.activity}</span>
                                {sacrifice.day ? `, ${sacrifice.day}` : ""} : {sacrifice.type}
                                {sacrifice.detail ? ` — ${sacrifice.detail}` : ""}
                            </li>
                        )}
                    </ul>
                </details>
            }
        </div>;

    if (!planning) {
        return (
            <div className="flex flex-col gap-6 pt-1 xl:pt-4">
                {title}
                <div className="flex flex-col items-start gap-3 rounded-[28px] border border-line p-6 xl:p-8">
                    <div className="ital text-[26px] leading-[30px]">Ta semaine est encore toute blanche.</div>
                    <p className="max-w-prose text-sm text-muted">
                        Dis à Schedula <Link href="/activity" className="font-semibold text-ink underline underline-offset-[3px]">ce qui compte pour toi</Link>,
                        puis clique sur « Générer ma semaine » : il range tes activités jour par jour.
                    </p>
                </div>
            </div>
        );
    }

    const lunch = lunchBreakOf(planning);

    return (
        <>
            {focusLauncher.dialog}
            {/* Bureau */}
            <div className="hidden flex-col gap-4 xl:flex">
                <div className="flex items-stretch gap-5">
                    {hero}
                    <div className="flex min-w-0 grow flex-col justify-center gap-2">
                        <div className="flex items-baseline gap-3.5">
                            {title}
                            <div className="ml-auto">{legend}</div>
                        </div>
                        {progressList}
                    </div>
                </div>
                {staleBanner}
                {(noteBlock || rulesBlock) &&
                    // Deux colonnes seulement si les deux blocs sont là : seul, un bloc prend toute la largeur.
                    <div className={`grid items-start gap-4 ${noteBlock && rulesBlock ? "xl:grid-cols-2" : ""}`}>
                        {noteBlock}
                        {rulesBlock}
                    </div>
                }
                <div className={`grid items-start gap-2 ${emptyWeekend ? "grid-cols-[repeat(5,minmax(0,1fr))_repeat(2,minmax(0,.5fr))]" : "grid-cols-7"}`}>
                    {days.map((d) =>
                        <DayTimeline key={d.day} day={d.day} label={d.label} date={d.date} isToday={d.isToday}
                                     slots={d.slots} seed={planning._id} lunch={lunch} priorityOf={priorityOf} onToggle={toggle}
                                     canLock={canLock} onLock={lock} focus={focus} disabled={generating}/>
                    )}
                </div>
            </div>

            {/* Mobile et tablette */}
            <div className="flex flex-col gap-[18px] xl:hidden">
                {title}
                {hero}
                {staleBanner}
                {noteBlock}
                {rulesBlock}
                <div className="grid grid-cols-7 gap-[5px]" role="group" aria-label="Jour affiché">
                    {days.map((d, index) => {
                        const isSelected = d === selected;
                        return (
                            <button
                                key={d.day}
                                type="button"
                                aria-pressed={isSelected}
                                aria-label={`${d.day} ${d.date}`}
                                onClick={() => setSelectedDay(index)}
                                className={`flex h-[66px] flex-col items-center justify-center gap-0.5 rounded-[22px] border p-0 outline-offset-2 transition-transform active:scale-95 ${d.isToday ? "border-ink bg-ink text-butter" : "border-line bg-transparent text-ink"} ${isSelected ? "outline-2 outline-ink" : ""}`}
                            >
                                <span className="text-[11px] font-semibold tracking-[.6px] uppercase">{d.label}</span>
                                <span className="serif text-[22px] leading-6">{d.date}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex flex-col gap-2.5">
                    <div className="flex items-baseline justify-between">
                        <div className="flex items-baseline gap-2">
                            <h2 className="serif m-0 text-2xl leading-7 capitalize">{selected.day} {selected.date}</h2>
                            {selected.isToday && <span className="ital text-[17px]">aujourd’hui</span>}
                        </div>
                        <div className="text-[13px] text-muted">
                            {selected.slots.length
                                ? `${selected.slots.filter((s) => s.status === "done").length}/${selected.slots.length}`
                                : "—"}
                        </div>
                    </div>
                    <div className="-mt-0.5">{legend}</div>
                    <DayItems slots={selected.slots} day={selected.day} seed={planning._id} lunch={lunch}
                              priorityOf={priorityOf} onToggle={toggle} canLock={canLock} onLock={lock} focus={focus}
                              disabled={generating} large/>
                    {selected.slots.length === 0 &&
                        <div className="ital px-0.5 py-2 text-xl text-muted">Journée libre.</div>
                    }
                </div>
                {progress.length > 0 &&
                    <div className="flex flex-col gap-1 pt-1">
                        <h2 className="serif m-0 mb-1.5 text-[22px] leading-[26px]">Où j’en suis</h2>
                        {progressList}
                    </div>
                }
            </div>
        </>
    );
}
