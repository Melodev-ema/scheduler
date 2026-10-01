"use client";

import {useEffect, useRef} from "react";

/**
 * Fenêtre de question du mode focus : un <dialog> natif, en feuille du bas
 * sur mobile, centrée sur bureau. Échap et un clic sur le fond la ferment.
 */
export default function FocusSheet({open, onClose, labelledBy, children}: {
    open: boolean,
    onClose: () => void,
    labelledBy: string,
    children: React.ReactNode,
}) {
    const ref = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog
            ref={ref}
            aria-labelledby={labelledBy}
            onCancel={(e) => {
                e.preventDefault();
                onClose();
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            className="mx-0 mt-auto mb-0 w-full max-w-none rounded-t-[28px] bg-cream p-0 text-ink shadow-[0_8px_24px_rgb(86_65_84/0.12)] md:m-auto md:max-w-[440px] md:rounded-[28px]"
        >
            <div className="flex flex-col gap-3.5 px-5 pt-3 pb-[34px] md:px-8 md:pt-8 md:pb-8">
                <span aria-hidden="true" className="h-1 w-9 self-center rounded-full bg-line md:hidden"/>
                {children}
            </div>
        </dialog>
    );
}
