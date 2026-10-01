/** Icônes au trait, reprises du design. Elles héritent de `currentColor`. */

type IconProps = { size?: number, strokeWidth?: number, className?: string };

function Svg({size = 16, strokeWidth = 2, className, children}: IconProps & { children: React.ReactNode }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
             className={className} aria-hidden="true">
            {children}
        </svg>
    );
}

export function PlusIcon(props: IconProps) {
    return <Svg strokeWidth={2.5} {...props}><path d="M5 12h14"/><path d="M12 5v14"/></Svg>;
}

export function MinusIcon(props: IconProps) {
    return <Svg strokeWidth={2.5} {...props}><path d="M5 12h14"/></Svg>;
}

export function CloseIcon(props: IconProps) {
    return <Svg {...props}><path d="M6 6l12 12"/><path d="M18 6L6 18"/></Svg>;
}

export function TrashIcon(props: IconProps) {
    return <Svg {...props}><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></Svg>;
}

export function CheckIcon(props: IconProps) {
    return <Svg strokeWidth={4} {...props}><path d="M5 12l5 5L20 7"/></Svg>;
}

/** Cadenas fermé, ou ouvert avec `open`. */
export function LockIcon({open, ...props}: IconProps & { open?: boolean }) {
    return (
        <Svg {...props}>
            <rect x="5" y="11" width="14" height="10" rx="2"/>
            <path d={open ? "M8 11V7a4 4 0 0 1 7.6-1.7" : "M8 11V7a4 4 0 0 1 8 0v4"}/>
        </Svg>
    );
}

export function SparkIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/>
            <path d="M6 6l2.5 2.5"/><path d="M15.5 15.5L18 18"/><path d="M18 6l-2.5 2.5"/><path d="M8.5 15.5L6 18"/>
        </Svg>
    );
}

export function AlertIcon(props: IconProps) {
    return <Svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5v.01"/></Svg>;
}

export function CalendarIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/>
        </Svg>
    );
}

export function ListIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/>
            <circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>
        </Svg>
    );
}

/** Onglet « Tâches » et état vide de la page. */
export function CircleCheckIcon(props: IconProps) {
    return <Svg {...props}><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></Svg>;
}

/** Bouton « Focus » de l'en-tête. */
export function TimerIcon(props: IconProps) {
    return <Svg {...props}><circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.2 1.6"/><path d="M9.5 2.5h5"/></Svg>;
}

export function PlayIcon(props: IconProps) {
    return <Svg {...props}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></Svg>;
}

export function PauseIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor"/>
            <rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor"/>
        </Svg>
    );
}

export function StopIcon(props: IconProps) {
    return <Svg {...props}><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></Svg>;
}

/** « Passer » : aller à la phase suivante. */
export function SkipIcon(props: IconProps) {
    return <Svg {...props}><path d="M6 6l9 6-9 6z" fill="currentColor"/><path d="M18.5 6v12"/></Svg>;
}

/** La pause du minuteur. */
export function CupIcon(props: IconProps) {
    return (
        <Svg {...props}>
            <path d="M5 9h11v4.5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16"/>
            <path d="M8.5 3.5v2.5"/><path d="M12.5 3.5v2.5"/>
        </Svg>
    );
}

export function ChevronDownIcon(props: IconProps) {
    return <Svg {...props}><path d="M6 9l6 6 6-6"/></Svg>;
}
