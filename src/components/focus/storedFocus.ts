import {z} from 'zod';
import type {FocusState} from '@/server/domain/focus/cycle';

/** Un focus fini depuis plus longtemps que ça n'est plus rouvert. */
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

const settingsSchema = z.object({
    workMinutes: z.number().positive(),
    shortBreakMinutes: z.number().positive(),
    longBreakMinutes: z.number().positive(),
    pomodoros: z.number().int().min(1).max(12),
});

const targetSchema = z.discriminatedUnion('kind', [
    z.object({kind: z.literal('free'), subject: z.string()}),
    z.object({
        kind: z.literal('slot'),
        planningId: z.string(),
        slotId: z.string(),
        day: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        activity: z.string(),
        priority: z.number(),
    }),
]);

const completedSchema = z.object({
    index: z.number().int().min(0),
    kind: z.enum(['work', 'shortBreak', 'longBreak']),
    minutes: z.number().min(0),
    partial: z.boolean().optional(),
});

const stateSchema = z.object({
    target: targetSchema,
    settings: settingsSchema,
    phaseIndex: z.number().int().min(0),
    status: z.enum(['running', 'paused', 'awaiting', 'finished']),
    startedAt: z.number(),
    phaseStartedAt: z.number(),
    phaseDurationMs: z.number().min(0),
    phaseEndsAt: z.number(),
    pausedRemainingMs: z.number().min(0).optional(),
    completed: z.array(completedSchema),
    finishedAt: z.number().optional(),
    resolved: z.boolean().optional(),
});

/**
 * Relit l'état gardé dans `localStorage`. Tout ce qui n'a pas la forme
 * attendue est ignoré : un état corrompu ne doit jamais casser une page.
 */
export function parseStoredFocus(raw: string | null, now: number): FocusState | null {
    if (!raw) return null;
    let json: unknown;
    try {
        json = JSON.parse(raw);
    } catch {
        return null;
    }
    const parsed = stateSchema.safeParse(json);
    if (!parsed.success) return null;
    const state = parsed.data as FocusState;
    if (state.status === 'finished' && now - (state.finishedAt ?? state.startedAt) > STALE_AFTER_MS) {
        return null;
    }
    return state;
}
