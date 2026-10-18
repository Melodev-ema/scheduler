"use client";

import {useState} from "react";
import {usePathname, useRouter} from "next/navigation";
import {BaseButton} from "@/components/uiComponents/BaseButton";
import Spinner from "@/components/uiComponents/Spinner";
import {SparkIcon} from "@/components/uiComponents/icons/icons";
import {generateWeek, GenerationOutcome} from "@/components/planning/useWeek";
import PrepareWeekDialog from "@/components/planning/PrepareWeekDialog";

/**
 * « Générer ma semaine », dans l'en-tête de toutes les pages. Corail quand les
 * activités ont changé depuis la dernière génération. Pas de confirmation : une
 * génération garde les séances cochées. Après une génération lancée ailleurs,
 * on revient sur la semaine.
 */
export default function GenerateButton({stale, compact, label, theme, week = "current"}: {
    stale?: boolean,
    compact?: boolean,
    label?: string,
    theme?: "primary" | "secondary",
    week?: "current" | "next",
}) {
    const [loading, setLoading] = useState(false);
    const [prepare, setPrepare] = useState<{ nextWeek: string, prepared: boolean } | null>(null);
    const pathname = usePathname();
    const router = useRouter();

    async function onClick() {
        if (loading) return;
        setLoading(true);
        await finish(await generateWeek(week));
    }

    async function onConfirmPrepare() {
        if (loading) return;
        setLoading(true);
        await finish(await generateWeek("next"));
    }

    /** Rien à planifier cette semaine : la fenêtre propose la suivante. */
    async function finish(outcome: GenerationOutcome) {
        setLoading(false);
        if (outcome.kind === "nothing-left") {
            setPrepare({nextWeek: outcome.nextWeek, prepared: outcome.prepared});
            return;
        }
        setPrepare(null);
        if (outcome.kind === "done" && pathname !== "/") router.push("/");
    }

    const text = label ?? (compact ? "Générer" : "Générer ma semaine");

    return (
        <>
        <BaseButton
            theme={theme ?? (stale ? "alert" : "primary")}
            size={compact ? "small" : "base"}
            onClick={onClick}
            disabled={loading}
            ariaBusy={loading}
            className={compact ? "pl-3" : "pl-[18px] pr-[22px]"}
        >
            {loading ? <Spinner/> : <SparkIcon size={compact ? 16 : 18}/>}
            {loading ? "Génération…" : text}
        </BaseButton>
        {prepare &&
            <PrepareWeekDialog
                nextWeek={prepare.nextWeek}
                prepared={prepare.prepared}
                loading={loading}
                onConfirm={onConfirmPrepare}
                onClose={() => setPrepare(null)}
            />
        }
        </>
    );
}
