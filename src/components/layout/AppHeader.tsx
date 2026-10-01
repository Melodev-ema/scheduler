"use client";

import {useEffect} from "react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import GenerateButton from "@/components/planning/GenerateButton";
import {useWeek} from "@/components/planning/useWeek";
import {rememberPath} from "@/components/focus/focusStore";
import {TimerIcon} from "@/components/uiComponents/icons/icons";

export const NAV_ITEMS = [
    {href: "/", label: "Ma semaine"},
    {href: "/activity", label: "Activités"},
    {href: "/task", label: "Tâches"},
] as const;

export function isCurrent(pathname: string, href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Le bouton « Focus » : une pilule sur bureau, une icône sur mobile. Il mène à
 * `/focus`, qui lance un focus libre ou rouvre celui qui tourne.
 */
function FocusLink({compact, current}: { compact?: boolean, current: boolean }) {
    return (
        <Link
            href="/focus"
            aria-current={current ? "page" : undefined}
            aria-label={compact ? "Focus" : undefined}
            className={`inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-bold text-butter transition-[transform,box-shadow] duration-100 hover:shadow-[0_0_0_4px_var(--color-line)] active:scale-[.97] ${compact ? "size-11" : "h-12 gap-2.5 px-5 text-[15px]"}`}
        >
            <TimerIcon size={compact ? 20 : 18}/>
            {!compact && "Focus"}
        </Link>
    );
}

/** Logo, onglets (bureau), « Focus » et « Générer ». Sur mobile, les onglets passent dans `MobileTabBar`. */
export default function AppHeader() {
    const pathname = usePathname();
    const {stale} = useWeek();
    const onFocus = pathname === "/focus";

    useEffect(() => rememberPath(pathname), [pathname]);

    return (
        <header
            // Sur mobile, le minuteur occupe tout l'écran : pas d'en-tête.
            className={`${onFocus ? "hidden md:flex" : "flex"} mx-auto w-full max-w-[1600px] items-center gap-3 px-5 pt-[22px] pb-3 md:h-[94px] md:gap-7 md:px-10 md:pt-[30px] md:pb-4`}>
            <Link href="/" className="flex grow items-baseline gap-[3px] md:grow-0 md:gap-1" aria-label="Schedula, ma semaine">
                <span className="text-[28px] leading-[30px] font-extrabold tracking-[-1.2px] md:text-[44px] md:leading-[46px] md:tracking-[-2px]">
                    Schedula
                </span>
                <span className="size-2 rounded-full bg-coral md:size-3" aria-hidden="true"/>
            </Link>

            <nav aria-label="Pages" className="hidden gap-1 rounded-[26px] bg-line p-1 md:flex">
                {NAV_ITEMS.map((item) => {
                    const current = isCurrent(pathname, item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-current={current ? "page" : undefined}
                            className={`flex h-10 items-center rounded-[20px] px-5 text-[15px] font-bold transition-[transform,background-color] duration-100 active:scale-95 ${current ? "bg-ink text-butter" : "text-ink hover:bg-cream"}`}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            <div className="hidden grow md:block"/>

            <div className="flex items-center gap-2 md:hidden">
                <FocusLink compact current={onFocus}/>
                <GenerateButton stale={stale} compact/>
            </div>
            <div className="hidden items-center gap-3 md:flex">
                <FocusLink current={onFocus}/>
                <GenerateButton stale={stale}/>
            </div>
        </header>
    );
}
