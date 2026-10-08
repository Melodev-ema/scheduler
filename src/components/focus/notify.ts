"use client";

import {useSyncExternalStore} from "react";
import type {FocusNotice} from "@/server/domain/focus/notice";

/**
 * Notifications du navigateur à la fin d'une phase. L'API `Notification`
 * seule, sans service worker : elle marche tant qu'un onglet de l'app est
 * ouvert, même en arrière-plan. La permission ne se demande que sur un geste
 * (`enableNotifications`, au clic sur la cloche) ; le choix est gardé dans
 * `localStorage`, à part de la permission, pour pouvoir couper sans passer
 * par les réglages du navigateur.
 */
const STORAGE_KEY = "scheduler:focus-notify";
const NOTIFY_CHANGED = "scheduler:focus-notify";
/** Une seule notification à la fois : deux onglets ouverts se remplacent au lieu de s'empiler. */
const TAG = "scheduler:focus";

export type NotifyStatus = "unsupported" | "blocked" | "off" | "on";

/** `new Notification` a levé (Chrome sur Android exige un service worker) : inutile de reproposer. */
let broken = false;
let shown: Notification | null = null;

function wanted(): boolean {
    try {
        return localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
        return false;
    }
}

function remember(on: boolean) {
    try {
        localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
        // Stockage indisponible : le choix ne survivra pas au rechargement.
    }
    window.dispatchEvent(new Event(NOTIFY_CHANGED));
}

export function notifyStatus(): NotifyStatus {
    if (broken || typeof Notification === "undefined") return "unsupported";
    if (Notification.permission === "denied") return "blocked";
    return Notification.permission === "granted" && wanted() ? "on" : "off";
}

function display(notice: FocusNotice): boolean {
    try {
        shown?.close();
        const notification = new Notification(notice.title, {body: notice.body, tag: TAG, lang: "fr"});
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
        shown = notification;
        return true;
    } catch {
        broken = true;
        return false;
    }
}

/** À appeler depuis un clic : le navigateur refuse de demander la permission autrement. */
export async function enableNotifications(): Promise<NotifyStatus> {
    if (notifyStatus() === "unsupported") return "unsupported";
    try {
        const permission = Notification.permission === "default"
            ? await Notification.requestPermission()
            : Notification.permission;
        // Une première notification tout de suite : elle confirme que ça marche, ou révèle que non.
        const works = permission === "granted"
            && display({title: "Notifications activées", body: "On te prévient à la fin de chaque phase."});
        remember(works);
    } catch {
        remember(false);
    }
    return notifyStatus();
}

export function disableNotifications() {
    shown?.close();
    shown = null;
    remember(false);
}

/**
 * Prévient qu'une phase est finie, seulement si l'on regarde ailleurs : une
 * fenêtre au premier plan montre déjà l'écran de transition et joue le bip.
 */
export function notifyPhaseEnd(notice: FocusNotice) {
    if (notifyStatus() !== "on" || document.hasFocus()) return;
    if (!display(notice)) return;
    // De retour sur l'app : la notification a fait son travail.
    window.addEventListener("focus", () => shown?.close(), {once: true});
}

function subscribe(listener: () => void) {
    window.addEventListener(NOTIFY_CHANGED, listener);
    window.addEventListener("storage", listener);
    return () => {
        window.removeEventListener(NOTIFY_CHANGED, listener);
        window.removeEventListener("storage", listener);
    };
}

/** Côté serveur, rien à proposer : le bouton n'apparaît qu'une fois dans le navigateur. */
export function useNotifyStatus(): NotifyStatus {
    return useSyncExternalStore(subscribe, notifyStatus, () => "unsupported");
}
