"use client";

import {toast} from "react-toastify";
import {BellIcon} from "@/components/uiComponents/icons/icons";
import {disableNotifications, enableNotifications, useNotifyStatus} from "@/components/focus/notify";

const BLOCKED = "Notifications bloquées : autorise-les pour ce site dans les réglages du navigateur.";

/**
 * La cloche du minuteur : être prévenu par une notification du navigateur à
 * la fin de chaque phase. `compact` : bouton-icône de 44 px (barre du haut sur
 * mobile), qui garde sa place même quand il n'y a rien à proposer.
 */
export default function NotifyToggle({compact, className = ""}: { compact?: boolean, className?: string }) {
    const status = useNotifyStatus();
    if (status === "unsupported") return compact ? <span className="w-11"/> : null;

    const on = status === "on";
    const blocked = status === "blocked";
    const toggle = async () => {
        if (on) return disableNotifications();
        if (blocked) {
            toast.info(BLOCKED);
            return;
        }
        const result = await enableNotifications();
        if (result === "blocked") toast.info(BLOCKED);
        if (result === "unsupported") toast.info("Ce navigateur ne sait pas afficher de notification ici.");
    };

    if (compact) {
        return (
            <button
                type="button" role="switch" aria-checked={on} onClick={toggle}
                aria-label="Me prévenir à la fin de chaque phase"
                className={`flex size-11 items-center justify-center rounded-full border ${on ? "border-ink bg-ink text-butter" : `text-ink ${className || "border-line"}`}`}
            >
                <BellIcon size={20} off={!on}/>
            </button>
        );
    }
    return (
        <button
            type="button" role="switch" aria-checked={on} onClick={toggle}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold hover:bg-line ${on ? "text-ink" : "text-muted"} ${className}`}
        >
            <BellIcon size={16} off={!on}/>
            {on ? "Notifications activées" : blocked ? "Notifications bloquées" : "Me prévenir à la fin de chaque phase"}
        </button>
    );
}
