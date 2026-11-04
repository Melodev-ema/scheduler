"use client";

import {BaseButton} from "@/components/uiComponents/BaseButton";
import Spinner from "@/components/uiComponents/Spinner";
import {SparkIcon} from "@/components/uiComponents/icons/icons";
import {formatLongDate, formatWeekRange} from "@/components/uiComponents/format";
import FocusSheet from "@/components/focus/FocusSheet";
import {parseWeekKey} from "@/server/domain/planning/week";

/**
 * Plus rien à planifier cette semaine : on propose la suivante. Si elle est
 * déjà prête, la même question devient « Regénérer ».
 */
export default function PrepareWeekDialog({nextWeek, prepared, loading, onConfirm, onClose, eyebrow = "Il ne reste rien à planifier cette semaine."}: {
    nextWeek: string,
    prepared: boolean,
    loading?: boolean,
    onConfirm: () => void,
    onClose: () => void,
    eyebrow?: string,
}) {
    const monday = parseWeekKey(nextWeek);
    const title = !monday
        ? "Préparer la semaine suivante ?"
        : prepared
            ? `Regénérer la semaine du lundi ${formatLongDate(monday)} ?`
            : `Préparer la semaine du ${formatWeekRange(monday)} ?`;
    const action = prepared ? "Regénérer la semaine" : "Préparer la semaine";

    return (
        <FocusSheet open onClose={() => {
            if (!loading) onClose();
        }} labelledBy="prepare-week-title">
            <span className="eyebrow">{eyebrow}</span>
            <h2 id="prepare-week-title" className="m-0 text-2xl leading-[29px] font-extrabold">{title}</h2>
            <BaseButton size="large" className="h-14 w-full" onClick={onConfirm} disabled={loading} ariaBusy={loading}>
                {loading ? <Spinner/> : <SparkIcon size={18}/>}
                {loading ? "Génération…" : action}
            </BaseButton>
            <BaseButton theme="secondary" size="large" className="w-full" onClick={onClose} disabled={loading}>
                Plus tard
            </BaseButton>
        </FocusSheet>
    );
}
