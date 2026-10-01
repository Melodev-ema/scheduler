import {CheckIcon} from "@/components/uiComponents/icons/icons";
import {cycleSteps, FocusState, PhaseKind, pomodoroNumber, StepStatus} from "@/server/domain/focus/cycle";
import CycleDots from "@/components/focus/CycleDots";

export const PHASE_LABEL: Record<PhaseKind, string> = {
    work: "Travail",
    shortBreak: "Pause",
    longBreak: "Pause longue",
};

const STATUS_LABEL: Record<StepStatus, string> = {
    done: "fait",
    skipped: "passé",
    current: "en cours",
    upcoming: "",
};

function Marker({status, work}: { status: StepStatus, work: boolean }) {
    const box = work ? "size-5" : "size-3.5";
    if (status === "done") {
        return (
            <span className={`flex items-center justify-center rounded-full bg-ink text-butter ${box}`}>
                <CheckIcon size={work ? 11 : 7}/>
            </span>
        );
    }
    if (status === "current") {
        return (
            <span className={`flex items-center justify-center rounded-full border-[2.5px] border-ink ${box}`}>
                <span className="size-1.5 rounded-full bg-ink"/>
            </span>
        );
    }
    return <span className={`rounded-full border-[1.5px] border-dashed border-muted ${box}`}/>;
}

/** La colonne « Le cycle » du minuteur sur bureau. */
export default function CycleList({state}: { state: FocusState }) {
    const steps = cycleSteps(state);
    const done = steps.filter((step) => step.kind === "work" && step.status === "done").length;
    const total = state.settings.pomodoros;
    const shown = state.status === "awaiting" || state.status === "finished" ? done : pomodoroNumber(state);

    return (
        <aside aria-label="Le cycle" className="flex flex-col gap-[18px] border-l border-line pl-10">
            <span className="eyebrow">Le cycle</span>
            <div className="flex items-baseline gap-2.5">
                <span className="serif text-[56px] leading-[56px]">{shown} sur {total}</span>
                <span className="ital text-[21px] text-muted">pomodoros</span>
            </div>
            <CycleDots state={state} size={30}/>
            <ol className="m-0 flex list-none flex-col p-0">
                {steps.map((step) => {
                    const current = step.status === "current";
                    return (
                        <li key={step.index}
                            className={`flex h-[42px] items-center gap-3.5 rounded-[14px] px-3 ${current ? "bg-line text-ink" : "text-muted"}`}>
                            <span className="flex w-5 justify-center">
                                <Marker status={step.status} work={step.kind === "work"}/>
                            </span>
                            <span className={`grow text-[15px] ${current ? "font-bold" : "font-medium"}`}>{PHASE_LABEL[step.kind]}</span>
                            <span className="ital text-base">{STATUS_LABEL[step.status]}</span>
                            <span className="w-[52px] text-right text-[13px] text-muted">{step.minutes} min</span>
                        </li>
                    );
                })}
            </ol>
            <p className="m-0 text-[13px] leading-[18px] text-muted">
                Une pause longue de {state.settings.longBreakMinutes} min après le {total}<sup>e</sup> pomodoro.
            </p>
        </aside>
    );
}
