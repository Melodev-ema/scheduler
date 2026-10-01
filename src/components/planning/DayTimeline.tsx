"use client";

import {ScheduleInterface} from "@/models/Schedule";
import {CheckIcon, LockIcon, PlayIcon} from "@/components/uiComponents/icons/icons";
import {priorityStyle} from "@/components/uiComponents/priority";
import {formatClock} from "@/components/uiComponents/format";
import {parseTimeToMinutes} from "@/server/domain/planning/time";
import {LunchBreak} from "@/server/domain/planning/lunchBreak";
import {timelineOf} from "@/components/planning/timeline";

/** « 7h – 8h » ; un horaire illisible est affiché tel quel. */
export function formatSlotTime(slot: Pick<ScheduleInterface, "startTime" | "endTime">): string {
    try {
        return `${formatClock(parseTimeToMinutes(slot.startTime))} – ${formatClock(parseTimeToMinutes(slot.endTime))}`;
    } catch {
        return `${slot.startTime} – ${slot.endTime}`;
    }
}

/**
 * La pause de midi, en faux créneau : pointillés, pas de fond ni de case à
 * cocher — rien à faire, juste un repère. Le modèle n'y place rien.
 */
export function LunchMarker({lunch, large, onDark}: { lunch: LunchBreak, large?: boolean, onDark?: boolean }) {
    const time = `${formatClock(parseTimeToMinutes(lunch.start))} – ${formatClock(parseTimeToMinutes(lunch.end))}`;
    return (
        <div
            aria-label={`Pause déjeuner, ${time}`}
            className={`flex flex-col gap-px border border-dashed ${onDark ? "border-line text-line" : "border-muted text-muted"} ${large ? "min-h-16 justify-center rounded-[20px] px-4 py-3" : "rounded-2xl px-2.5 py-1.5"}`}
        >
            <span className={`ital ${large ? "text-[17px] leading-[21px]" : "text-[13px] leading-4"}`}>Pause déjeuner</span>
            <span className={large ? "text-[13px] leading-[17px]" : "text-xs leading-4"}>{time}</span>
        </div>
    );
}

/** Un trou d'au moins 30 min entre deux créneaux, avec une idée pour l'occuper. */
function FreeTime({start, end, idea, large, onDark}: {
    start: string, end: string, idea: string, large?: boolean, onDark?: boolean,
}) {
    const time = `${formatClock(parseTimeToMinutes(start))} – ${formatClock(parseTimeToMinutes(end))}`;
    return (
        <div
            aria-label={`Temps libre, ${time} : ${idea}`}
            className={`flex flex-col gap-0.5 border-l-2 ${onDark ? "border-line text-line" : "border-butter text-muted"} ${large ? "px-4 py-2" : "px-2.5 py-1"}`}
        >
            {large ?
                <>
                    <span className={`eyebrow ${onDark ? "text-line" : "text-muted"}`}>Temps libre</span>
                    <span className="text-[13px] leading-[17px]">{time}</span>
                </>
                :
                // Sur bureau, une ligne de moins : l'étiquette et l'horaire côte à côte.
                <span className="text-xs leading-4"><span className="eyebrow">Libre</span> · {time}</span>
            }
            <span className={`ital ${onDark ? "" : "text-ink"} ${large ? "mt-0.5 text-[17px] leading-[21px]" : "line-clamp-2 text-[13px] leading-4"}`}>{idea}</span>
        </div>
    );
}

/**
 * Une journée dans l'ordre des heures : créneaux, pause de midi, et temps
 * libre dans les trous. Rien du tout pour une journée sans créneau.
 */
/** Le focus d'une journée : quels créneaux le permettent, lequel est en cours, et le lancer. */
export interface SlotFocus {
    canFocus: (slot: ScheduleInterface) => boolean,
    isFocused: (slot: ScheduleInterface) => boolean,
    onFocus: (slot: ScheduleInterface) => void,
}

export function DayItems({slots, day, seed, lunch, priorityOf, onToggle, canLock, onLock, focus, disabled, large, onDark}: {
    slots: ScheduleInterface[],
    day: string,
    /** Le planning : le tirage des idées en dépend, pour varier d'une semaine à l'autre. */
    seed: string,
    /** La pause du planning affiché, pas le réglage actuel. */
    lunch: LunchBreak | null,
    priorityOf: (activity: string) => number,
    onToggle: (slot: ScheduleInterface) => void,
    /** Vrai si le créneau peut être (dé)verrouillé : semaine en cours, en attente, pas encore commencé. */
    canLock: (slot: ScheduleInterface) => boolean,
    onLock: (slot: ScheduleInterface) => void,
    focus?: SlotFocus,
    /** Vrai pendant une génération : rien ne se coche ni ne se verrouille. */
    disabled?: boolean,
    large?: boolean,
    onDark?: boolean,
}) {
    return timelineOf(slots, day, seed, lunch).map((item) => {
        if (item.kind === "slot") {
            const focused = focus?.isFocused(item.slot) ?? false;
            return <SlotRow key={item.slot._id} slot={item.slot} day={day} priority={priorityOf(item.slot.activity)}
                            onToggle={onToggle} canLock={canLock(item.slot)} onLock={onLock} disabled={disabled}
                            canFocus={focused || (focus?.canFocus(item.slot) ?? false)} focused={focused}
                            onFocus={focus?.onFocus} large={large}/>;
        }
        if (item.kind === "lunch") {
            return lunch && <LunchMarker key="lunch" lunch={lunch} large={large} onDark={onDark}/>;
        }
        return <FreeTime key={`free-${item.start}`} start={item.start} end={item.end} idea={item.idea}
                         large={large} onDark={onDark}/>;
    });
}

/**
 * Hauteur minimale d'un créneau sur bureau, par paliers de durée : la forme de
 * la journée se lit d'un coup d'œil, sans qu'une séance de 15 min devienne
 * illisible. Classes écrites en entier pour que Tailwind les détecte.
 */
function heightFor(slot: ScheduleInterface): string {
    let length: number;
    try {
        length = parseTimeToMinutes(slot.endTime) - parseTimeToMinutes(slot.startTime);
    } catch {
        return "";
    }
    if (length > 150) return "min-h-24";
    if (length > 90) return "min-h-[4.5rem]";
    if (length > 45) return "min-h-14";
    return "";
}

/**
 * Un créneau, son cadenas et son ▶ de focus. `SlotButton` est déjà un
 * <button> : les deux autres sont ses voisins, posés sur la carte, jamais ses
 * enfants. Leur zone de clic dépasse l'icône, pour qu'on ne les rate pas,
 * surtout au doigt. Sur bureau, le cadenas en haut et le ▶ en bas ; sur
 * mobile, côte à côte.
 */
function SlotRow({slot, day, priority, onToggle, canLock, onLock, canFocus, focused, onFocus, disabled, large}: {
    slot: ScheduleInterface,
    day: string,
    priority: number,
    onToggle: (slot: ScheduleInterface) => void,
    /** Faux pour un créneau fait ou commencé : il est déjà gardé, pas de cadenas à poser. */
    canLock: boolean,
    onLock: (slot: ScheduleInterface) => void,
    /** Créneau d'aujourd'hui, à faire et pas encore fini, ou déjà sous focus. */
    canFocus?: boolean,
    focused?: boolean,
    onFocus?: (slot: ScheduleInterface) => void,
    disabled?: boolean,
    large?: boolean,
}) {
    const locked = slot.locked === true;
    const withFocus = canFocus === true && onFocus !== undefined;
    return (
        <div className="relative">
            <SlotButton slot={slot} day={day} priority={priority} onToggle={onToggle} large={large}
                        locked={locked} reserveCorner={canLock || locked} reserveFocus={withFocus}
                        focused={focused} disabled={disabled}/>
            {canLock &&
                <button
                    type="button"
                    aria-pressed={locked}
                    // Libellé fixe : l'état passe par aria-pressed, sans être annoncé deux fois.
                    aria-label={`Verrouiller ${slot.activity}, ${day} ${formatSlotTime(slot)}`}
                    title={locked ? "Verrouillé : une regénération le garde. Clique pour déverrouiller." : "Verrouiller : une regénération le gardera"}
                    onClick={() => onLock(slot)}
                    disabled={disabled}
                    className={`absolute flex items-center justify-center rounded-full text-ink transition-opacity hover:bg-ink/10 hover:opacity-100 focus-visible:opacity-100 ${locked ? "cursor-unlock opacity-100" : "cursor-lock opacity-40"} ${large ? `top-1/2 -mt-[22px] size-11 ${withFocus ? "right-14" : "right-2"}` : "top-1 right-1 size-7"}`}
                >
                    <LockIcon open={!locked} size={large ? 16 : 13}/>
                </button>
            }
            {withFocus &&
                <button
                    type="button"
                    aria-label={focused ? `Ouvrir le focus sur ${slot.activity}` : `Lancer un focus sur ${slot.activity}`}
                    title={focused ? "Focus en cours" : "Lancer un focus"}
                    onClick={() => onFocus(slot)}
                    disabled={disabled}
                    className={`absolute flex items-center justify-center rounded-full ${large ? "top-1/2 right-2 -mt-[22px] size-11" : "right-1 bottom-1 size-7 bg-ink text-butter transition-transform hover:scale-110"}`}
                >
                    <span className={large ? "flex size-9 items-center justify-center rounded-full bg-ink text-butter" : "contents"}>
                        <PlayIcon size={large ? 14 : 12}/>
                    </span>
                </button>
            }
            {/* Verrouillé mais déjà passé : le cadenas reste affiché, sans rien à cliquer. */}
            {!canLock && locked &&
                <span aria-hidden="true"
                      className={`pointer-events-none absolute text-ink ${large ? `top-1/2 -mt-2 ${withFocus ? "right-[70px]" : "right-5"}` : "top-2 right-2"}`}>
                    <LockIcon size={large ? 16 : 13}/>
                </span>
            }
        </div>
    );
}

/** Marge à droite pour les boutons posés sur la carte. Classes écrites en entier pour Tailwind. */
function reserveSpace(large?: boolean, corner?: boolean, focus?: boolean): string {
    if (large) {
        if (corner && focus) return "pr-[104px]";
        return corner || focus ? "pr-14" : "";
    }
    return corner || focus ? "pr-7" : "";
}

/**
 * Un créneau. Fond = couleur soutenue de la priorité, toujours ; fait = une
 * coche, rien d'autre ; contour = couleur vive. Un clic bascule fait / à faire.
 */
export function SlotButton({slot, day, priority, onToggle, large, locked, reserveCorner, reserveFocus, focused, disabled}: {
    slot: ScheduleInterface,
    day: string,
    priority: number,
    onToggle: (slot: ScheduleInterface) => void,
    large?: boolean,
    locked?: boolean,
    /** Laisse la place du cadenas dans l'angle, pour que le titre ne passe pas dessous. */
    reserveCorner?: boolean,
    /** Laisse la place du ▶ de focus : en bas sur bureau, à côté du cadenas sur mobile. */
    reserveFocus?: boolean,
    /** Un focus tourne sur ce créneau. */
    focused?: boolean,
    disabled?: boolean,
}) {
    const style = priorityStyle(priority);
    const done = slot.status === "done";
    const time = formatSlotTime(slot);
    // Moitié d'une séance coupée par la pause de midi.
    const part = (slot.parts ?? 1) > 1 ? `${slot.part}/${slot.parts}` : "";

    return (
        <button
            type="button"
            aria-pressed={done}
            aria-label={`${slot.activity}${part ? `, partie ${part}` : ""}, priorité ${style.label.toLowerCase()}, ${day} ${time}, ${done ? "fait" : "à faire"}${locked ? ", verrouillé" : ""}${focused ? ", focus en cours" : ""}`}
            title={slot.description || undefined}
            onClick={() => onToggle(slot)}
            disabled={disabled}
            className={`group flex w-full border text-left text-ink transition-[transform,box-shadow,opacity] duration-100 hover:-translate-y-px hover:shadow-[0_0_0_3px_var(--color-line)] disabled:hover:translate-y-0 disabled:hover:shadow-none ${style.softBg} ${style.dotBorder} ${done ? "opacity-60" : ""} ${focused ? "ring-2 ring-coral ring-offset-2 ring-offset-transparent" : ""} ${reserveSpace(large, reserveCorner, reserveFocus)} ${large ? "min-h-16 items-center gap-3.5 rounded-[20px] px-4 py-3" : `items-start gap-2 rounded-2xl px-2.5 py-2 ${reserveFocus ? "min-h-16" : heightFor(slot)}`}`}
        >
            <span
                className={`flex shrink-0 items-center justify-center rounded-full border-[1.5px] border-ink ${large ? "size-[26px]" : "mt-px size-4"} ${done ? "bg-ink text-butter" : "bg-transparent"}`}>
                {/* Au survol, une coche en filigrane : on voit qu'un clic la pose. */}
                <span className={done ? "" : "opacity-0 transition-opacity group-hover:opacity-40"}>
                    <CheckIcon size={large ? 13 : 10}/>
                </span>
            </span>
            <span className="flex min-w-0 flex-col gap-px">
                <span className={`font-bold break-words hyphens-auto ${done ? "line-through" : ""} ${large ? "text-[17px] leading-[21px]" : "text-sm leading-[18px]"}`}>
                    {slot.activity}{part && <span className="font-normal"> · {part}</span>}
                </span>
                <span className={large ? "text-[13px] leading-[17px]" : "text-xs leading-4"}>{time}</span>
            </span>
        </button>
    );
}

/** Colonne d'un jour, sur bureau. Le jour même est prune. */
export default function DayTimeline({day, label, date, isToday, slots, seed, lunch, priorityOf, onToggle, canLock, onLock, focus, disabled}: {
    day: string,
    label: string,
    date: string,
    isToday: boolean,
    slots: ScheduleInterface[],
    seed: string,
    lunch: LunchBreak | null,
    priorityOf: (activity: string) => number,
    onToggle: (slot: ScheduleInterface) => void,
    canLock: (slot: ScheduleInterface) => boolean,
    onLock: (slot: ScheduleInterface) => void,
    focus?: SlotFocus,
    disabled?: boolean,
}) {
    return (
        <section
            aria-label={`${day} ${date}`}
            className={`flex min-w-0 flex-col gap-2 rounded-[20px] border px-2.5 pt-3 pb-2.5 ${isToday ? "border-ink bg-ink text-butter" : "border-line bg-cream text-ink"}`}
        >
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 px-1">
                <div className="flex items-baseline gap-1.5">
                    <div className={`eyebrow ${isToday ? "text-butter" : "text-ink"}`}>{label}</div>
                    <div className="serif text-[30px] leading-8">{date}</div>
                </div>
                {isToday && <div className="ital text-base">aujourd’hui</div>}
            </div>
            <DayItems slots={slots} day={day} seed={seed} lunch={lunch} priorityOf={priorityOf} onToggle={onToggle}
                      canLock={canLock} onLock={onLock} focus={focus} disabled={disabled} onDark={isToday}/>
            {slots.length === 0 &&
                <div className={`ital px-1 text-[15px] ${isToday ? "text-line" : "text-muted"}`}>Journée libre.</div>
            }
        </section>
    );
}
