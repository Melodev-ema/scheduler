"use client";

import {useSyncExternalStore} from "react";
import {
    advance, extendBreak, FocusState, FocusTarget, pause, remainingMs, resume, skipBreak, skipPhase, startFocus,
    startNextPhase, stop,
} from "@/server/domain/focus/cycle";
import {parseStoredFocus} from "@/components/focus/storedFocus";
import {playChime, unlockChime} from "@/components/focus/chime";
import {formatClock} from "@/components/uiComponents/format";

/**
 * Le focus en cours, unique. Même principe que `useWeek` : pas de store
 * global ni de contexte, un état au niveau du module, gardé dans
 * `localStorage` et signalé par un événement de fenêtre. Chaque composant qui
 * l'affiche s'y abonne avec `useFocus()`.
 */
const STORAGE_KEY = "scheduler:focus";
const FOCUS_CHANGED = "scheduler:focus";

export interface FocusSnapshot {
    state: FocusState | null;
    /** L'heure du dernier tic : de quoi calculer le temps restant au rendu. */
    now: number;
}

const SERVER_SNAPSHOT: FocusSnapshot = {state: null, now: 0};

let snapshot: FocusSnapshot | null = null;
const listeners = new Set<() => void>();
let clock: ReturnType<typeof setInterval> | null = null;

function read(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function write(state: FocusState | null) {
    try {
        if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Stockage indisponible : le focus tient jusqu'au rechargement.
    }
}

function current(): FocusSnapshot {
    if (!snapshot) {
        const now = Date.now();
        const stored = parseStoredFocus(read(), now);
        // Une phase écoulée pendant que la page était fermée se clôt à la lecture.
        snapshot = {state: stored && advance(stored, now), now};
    }
    return snapshot;
}

function emit() {
    updateTitle();
    syncClock();
    listeners.forEach((listener) => listener());
}

function set(state: FocusState | null) {
    snapshot = {state, now: Date.now()};
    write(state);
    window.dispatchEvent(new Event(FOCUS_CHANGED));
}

function tick() {
    const {state} = current();
    const now = Date.now();
    const next = state && advance(state, now);
    if (next !== state) {
        // Une phase vient de finir : un signal, puis l'écran de transition.
        playChime();
        set(next);
        return;
    }
    snapshot = {state, now};
    emit();
}

/** Une seule horloge, et seulement quand un focus tourne et qu'on l'affiche. */
function syncClock() {
    const running = current().state?.status === "running" && listeners.size > 0;
    if (running && !clock) clock = setInterval(tick, 1000);
    if (!running && clock) {
        clearInterval(clock);
        clock = null;
    }
}

let originalTitle: string | null = null;

/** « 18:42 · Portfolio » dans l'onglet, tant qu'un focus tourne ou attend. */
function updateTitle() {
    const {state, now} = current();
    const active = state && state.status !== "finished";
    if (active) {
        if (originalTitle === null) originalTitle = document.title;
        const name = focusName(state);
        const head = state.status === "awaiting" ? "Phase finie" : formatTimer(remainingMs(state, now));
        document.title = `${state.status === "paused" ? "⏸ " : ""}${head}${name ? ` · ${name}` : ""}`;
    } else if (originalTitle !== null) {
        document.title = originalTitle;
        originalTitle = null;
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) {
        window.addEventListener(FOCUS_CHANGED, emit);
    }
    syncClock();
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            window.removeEventListener(FOCUS_CHANGED, emit);
        }
        syncClock();
    };
}

export function useFocus(): FocusSnapshot {
    return useSyncExternalStore(subscribe, current, () => SERVER_SNAPSHOT);
}

/** « 25:00 » ; au-delà d'une heure, « 1:05:00 ». */
export function formatTimer(ms: number): string {
    const total = Math.ceil(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** « 18 minutes 42 secondes restantes », pour les lecteurs d'écran. */
export function describeTimer(ms: number): string {
    const total = Math.ceil(ms / 1000);
    return `${Math.floor(total / 60)} minutes ${total % 60} secondes restantes`;
}

/** 10:03 → « 10h03 ». */
export function clockOf(timestamp: number): string {
    const date = new Date(timestamp);
    return formatClock(date.getHours() * 60 + date.getMinutes());
}

/** Ce sur quoi porte le focus : le créneau, ou le sujet s'il y en a un. */
export function focusName(state: FocusState): string {
    return state.target.kind === "slot" ? state.target.activity : state.target.subject.trim();
}

/** Un focus actif ne s'écrase jamais : la bascule passe par `replaceFocus`. */
export function launchFocus(target: FocusTarget): "started" | "conflict" {
    const {state} = current();
    if (state && state.status !== "finished") return "conflict";
    unlockChime();
    set(startFocus(target, Date.now()));
    return "started";
}

export function replaceFocus(target: FocusTarget) {
    unlockChime();
    set(startFocus(target, Date.now()));
}

function update(change: (state: FocusState, now: number) => FocusState) {
    const {state} = current();
    if (!state) return;
    set(change(state, Date.now()));
}

export const pauseFocus = () => update(pause);
export const resumeFocus = () => update(resume);
export const stopFocus = () => update(stop);
export const nextPhase = () => update(startNextPhase);
export const skipFocusBreak = () => update(skipBreak);
export const skipFocusPhase = () => update(skipPhase);
export const extendFocusBreak = () => update((state, now) => extendBreak(state, now));

/** La question de fin a eu sa réponse : on ne la repose plus. */
export const resolveFocus = () => update((state) => ({...state, resolved: true}));

export function clearFocus() {
    set(null);
}

/**
 * La dernière page visitée hors de `/focus`, où « Réduire » ramène. Gardée
 * pour l'onglet (`sessionStorage`) : elle survit à un rechargement du minuteur.
 */
const LAST_PATH_KEY = "scheduler:focus-from";

export function rememberPath(pathname: string) {
    if (pathname === "/focus") return;
    try {
        sessionStorage.setItem(LAST_PATH_KEY, pathname);
    } catch {
        // Stockage indisponible : « Réduire » ramènera à la semaine.
    }
}

export function pathBeforeFocus(): string {
    try {
        return sessionStorage.getItem(LAST_PATH_KEY) ?? "/";
    } catch {
        return "/";
    }
}
