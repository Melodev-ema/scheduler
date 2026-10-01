import {CheckIcon} from "@/components/uiComponents/icons/icons";
import {cycleSteps, FocusState} from "@/server/domain/focus/cycle";

/**
 * Une pastille par pomodoro : pleine et cochée quand il est fait, cerclée
 * quand il tourne, en pointillés quand il est à venir (ou a été passé).
 */
export default function CycleDots({state, size = 26}: { state: FocusState, size?: 20 | 26 | 30 | 34 }) {
    const pomodoros = cycleSteps(state).filter((step) => step.kind === "work");
    const box = {20: "size-5", 26: "size-[26px]", 30: "size-[30px]", 34: "size-[34px]"}[size];
    const done = pomodoros.filter((step) => step.status === "done").length;

    return (
        <span role="img" aria-label={`${done} pomodoro${done > 1 ? "s" : ""} faits sur ${pomodoros.length}`}
              className="inline-flex items-center gap-2.5">
            {pomodoros.map((step) => {
                if (step.status === "done") {
                    return (
                        <span key={step.index} className={`flex items-center justify-center rounded-full bg-ink text-butter ${box}`}>
                            <CheckIcon size={Math.round(size * 0.42)}/>
                        </span>
                    );
                }
                if (step.status === "current") {
                    return (
                        <span key={step.index} className={`flex items-center justify-center rounded-full border-[2.5px] border-ink ${box}`}>
                            <span className="size-2 rounded-full bg-ink"/>
                        </span>
                    );
                }
                return <span key={step.index} className={`rounded-full border-[1.5px] border-dashed border-current opacity-70 ${box}`}/>;
            })}
        </span>
    );
}
