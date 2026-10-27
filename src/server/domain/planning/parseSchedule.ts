import {isWeekday, Weekday} from './days';
import {isValidTime} from './time';

export class InvalidModelResponseError extends Error {
    constructor(message: string, readonly cause?: unknown) {
        super(message);
        this.name = 'InvalidModelResponseError';
    }
}

export interface ScheduleSlot {
    day: Weekday;
    startTime: string;
    endTime: string;
    activity: string;
    description: string;
    /** Référence de tâche ponctuelle recopiée par le modèle ; absente pour une activité. */
    ref?: string;
}

function asRecord(value: unknown, position: number): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new InvalidModelResponseError(`Créneau ${position} : objet attendu`);
    }
    return value as Record<string, unknown>;
}

function readTime(
    slot: Record<string, unknown>,
    key: string,
    position: number,
): string {
    const value = slot[key];
    if (typeof value !== 'string' || !isValidTime(value)) {
        throw new InvalidModelResponseError(
            `Créneau ${position} : heure invalide pour "${key}" (${String(value)})`,
        );
    }
    return value;
}

function toSlot(value: unknown, index: number): ScheduleSlot {
    const position = index + 1;
    const slot = asRecord(value, position);

    const day = slot.day;
    if (typeof day !== 'string' || !isWeekday(day)) {
        throw new InvalidModelResponseError(
            `Créneau ${position} : jour inconnu (${String(day)})`,
        );
    }

    const activity = slot.activity;
    if (typeof activity !== 'string' || activity.trim() === '') {
        throw new InvalidModelResponseError(
            `Créneau ${position} : nom d'activité manquant`,
        );
    }

    // Facultatif : une référence manquante ou mal formée laisse le créneau
    // sans lien vers sa tâche, elle ne justifie pas de rejeter la réponse.
    const ref = typeof slot.ref === 'string' ? slot.ref.trim() : '';

    return {
        day,
        startTime: readTime(slot, 'start_time', position),
        endTime: readTime(slot, 'end_time', position),
        activity: activity.trim(),
        description: typeof slot.description === 'string' ? slot.description : '',
        ...(ref !== '' ? {ref} : {}),
    };
}

export function parseSchedule(raw: string): ScheduleSlot[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (cause) {
        throw new InvalidModelResponseError(
            'Réponse du modèle illisible : JSON invalide',
            cause,
        );
    }

    const schedule = (parsed as {schedule?: unknown} | null)?.schedule;
    if (!Array.isArray(schedule)) {
        throw new InvalidModelResponseError(
            'Réponse du modèle invalide : champ "schedule" absent ou non tableau',
        );
    }

    return schedule.map(toSlot);
}

export type SacrificeType = 'supprimée' | 'raccourcie' | 'écartée';

/** Séance que le modèle déclare avoir supprimée ou raccourcie. Purement informatif. */
export interface Sacrifice {
    activity: string;
    /** Vide quand le modèle ne précise pas le jour. */
    day: string;
    type: SacrificeType;
    detail: string;
}

function sacrificeType(value: unknown): SacrificeType | null {
    if (typeof value !== 'string') {
        return null;
    }
    const normalized = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (normalized.startsWith('supprim')) {
        return 'supprimée';
    }
    if (normalized.startsWith('raccourc')) {
        return 'raccourcie';
    }
    return null;
}

/**
 * Ne lève jamais, contrairement à parseSchedule : les sacrifices ne servent
 * qu'à l'affichage, une entrée mal formée est simplement écartée.
 */
export function parseSacrifices(raw: string): Sacrifice[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }

    const list = (parsed as {sacrifices?: unknown} | null)?.sacrifices;
    if (!Array.isArray(list)) {
        return [];
    }

    return list.flatMap((entry): Sacrifice[] => {
        if (typeof entry !== 'object' || entry === null) {
            return [];
        }
        const {activity, day, type, detail} = entry as Record<string, unknown>;
        const kind = sacrificeType(type);
        if (typeof activity !== 'string' || activity.trim() === '' || kind === null) {
            return [];
        }
        return [{
            activity: activity.trim(),
            day: typeof day === 'string' ? day : '',
            type: kind,
            detail: typeof detail === 'string' ? detail : '',
        }];
    });
}

/** Plafond de la note affichée : quelques phrases, pas un rapport. */
export const MAX_NOTE_LENGTH = 600;

/**
 * Lit la note où le modèle explique ses choix. Comme parseSacrifices, ne lève
 * jamais : une note absente ou mal formée n'invalide pas le planning.
 */
export function parseNote(raw: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return '';
    }

    const note = (parsed as {note?: unknown} | null)?.note;
    return typeof note === 'string' ? note.trim().slice(0, MAX_NOTE_LENGTH) : '';
}
