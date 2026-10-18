import type {NextConfig} from "next";

/**
 * En-têtes indépendants de la requête. La CSP n'est pas ici : elle porte un
 * nonce tiré par requête, ce que seul `src/proxy.ts` peut faire.
 */
const securityHeaders = [
    // Interdit au navigateur de deviner un type MIME, donc de traiter en
    // script une réponse qui n'en est pas une.
    {key: 'X-Content-Type-Options', value: 'nosniff'},
    // Aucune URL de l'instance ne part dans un Referer sortant.
    {key: 'Referrer-Policy', value: 'no-referrer'},
    // Doublon assumé de `frame-ancestors` : celui-ci couvre aussi les
    // réponses d'API, que le proxy ne traite pas.
    {key: 'X-Frame-Options', value: 'DENY'},
    // L'application ne demande aucune de ces permissions.
    {key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()'},
];

const nextConfig: NextConfig = {
    // Rien à gagner à annoncer le framework et sa version.
    poweredByHeader: false,

    // `.next/standalone`, que l'image Docker sert seule, sans `node_modules`
    // complet. Réservé au build du Dockerfile, qui pose `NEXT_OUTPUT` :
    // `next start` refuse cette sortie et l'annonce à chaque démarrage.
    output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,

    async headers() {
        return [{source: '/:path*', headers: securityHeaders}];
    },
};

export default nextConfig;
