"use client";

/**
 * Deux notes courtes à la fin d'une phase. Un oscillateur Web Audio : aucun
 * fichier à charger, donc rien à ouvrir dans la CSP. Le navigateur n'autorise
 * le son qu'après un geste : `unlockChime` est appelé au clic qui lance le focus.
 */
let context: AudioContext | null = null;

export function unlockChime() {
    try {
        context ??= new AudioContext();
        if (context.state === "suspended") void context.resume();
    } catch {
        context = null;
    }
}

export function playChime() {
    if (!context || context.state !== "running") return;
    const start = context.currentTime;
    [660, 880].forEach((frequency, i) => {
        const oscillator = context!.createOscillator();
        const gain = context!.createGain();
        const at = start + i * 0.22;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
        oscillator.connect(gain).connect(context!.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.4);
    });
}
