import type {Metadata} from "next";
import localFont from "next/font/local";
import {connection} from "next/server";
import "./globals.css";
import AppHeader from "@/components/layout/AppHeader";
import MobileTabBar from "@/components/layout/MobileTabBar";
import MiniPlayerBar from "@/components/focus/MiniPlayer";
// L'entrée `unstyled` n'injecte pas de <style> à l'exécution : un tel élément
// n'a pas le nonce de la CSP et serait bloqué. La feuille importée ici passe
// par le pipeline CSS de Next et devient une ressource `'self'`.
import {ToastContainer} from "react-toastify/unstyled";
import "react-toastify/ReactToastify.css";

// Polices embarquées (licence OFL, fichiers dans ./fonts) plutôt que
// next/font/google : le build ne dépend pas du réseau, et rien n'est chargé
// depuis un domaine tiers, ce que la CSP refuserait de toute façon.
const bricolage = localFont({
    src: "./fonts/BricolageGrotesque.woff2",
    variable: "--font-bricolage",
    weight: "200 800",
    display: "swap",
});

const gloock = localFont({
    src: "./fonts/Gloock.woff2",
    variable: "--font-gloock",
    weight: "400",
    display: "swap",
});

const instrument = localFont({
    src: "./fonts/InstrumentSerif-Italic.woff2",
    variable: "--font-instrument",
    weight: "400",
    style: "italic",
    display: "swap",
});

export const metadata: Metadata = {
    title: "Schedula",
    description: "Ta semaine, rangée selon ce qui compte pour toi",
};

export default async function RootLayout({children,}: Readonly<{
    children: React.ReactNode;
}>) {
    // Un nonce est tiré par requête : sans cette attente, la page est rendue
    // au build, quand il n'existe ni requête ni en-tête où le lire.
    await connection();

    return (
        <html lang="fr" className={`${bricolage.variable} ${gloock.variable} ${instrument.variable}`}>
        <body className="min-h-screen antialiased">
        <AppHeader/>
        <main className="mx-auto w-full max-w-[1600px] px-5 pb-32 md:px-10 md:pb-8">
            {children}
            <MiniPlayerBar/>
        </main>
        <MobileTabBar/>
        <ToastContainer icon={false} position="bottom-right"/>
        </body>
        </html>
    );
}
