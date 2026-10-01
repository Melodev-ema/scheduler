"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {CalendarIcon, CircleCheckIcon, ListIcon} from "@/components/uiComponents/icons/icons";
import {isCurrent, NAV_ITEMS} from "@/components/layout/AppHeader";

const ICONS = {"/": CalendarIcon, "/activity": ListIcon, "/task": CircleCheckIcon} as const;

/** Barre d'onglets du bas, mobile uniquement. */
export default function MobileTabBar() {
    const pathname = usePathname();
    // Le minuteur occupe tout l'écran sur mobile.
    if (pathname === "/focus") return null;

    return (
        <nav aria-label="Pages"
             className="fixed inset-x-0 bottom-0 z-30 grid h-20 grid-cols-3 gap-1.5 border-t border-line bg-cream px-4 pt-2 pb-[18px] md:hidden">
            {NAV_ITEMS.map((item) => {
                const current = isCurrent(pathname, item.href);
                const Icon = ICONS[item.href];
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={current ? "page" : undefined}
                        className={`flex flex-col items-center justify-center gap-[3px] rounded-[18px] text-xs font-bold ${current ? "bg-ink text-butter" : "text-ink"}`}
                    >
                        <Icon size={20}/>
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}
