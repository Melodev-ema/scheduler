import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';
import {guardRequest} from '@/server/http/requestGuard';

/**
 * Point de passage par requête. Next 16 a renommé `middleware.ts` en
 * `proxy.ts` : même mécanique, autre nom de fichier et d'export.
 */
export function proxy(request: NextRequest) {
    const refusal = guardRequest(request);
    if (refusal) {
        return refusal;
    }

    if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.next();
    }

    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

    // React utilise `eval` en développement pour reconstruire les piles
    // d'erreur serveur dans le navigateur. Ni React ni Next n'en font usage
    // en production.
    const isDev = process.env.NODE_ENV === 'development';

    // L'overlay de développement de Next injecte ses `<style>` sans nonce.
    // `'unsafe-inline'` est ignoré dès qu'un nonce figure dans la directive :
    // en développement, il remplace donc le nonce au lieu de s'y ajouter.
    // Conséquence : un style injecté par l'app (l'entrée par défaut de
    // `react-toastify`, par exemple) n'est plus signalé qu'en production.
    const styleSrc = isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`;

    // `upgrade-insecure-requests` est délibérément absent : l'instance est
    // servie en http sur localhost, et cette directive réécrirait ses propres
    // requêtes en https. À rajouter le jour du déploiement en HTTPS.
    const csp = `
        default-src 'self';
        script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
        style-src 'self' ${styleSrc};
        img-src 'self' blob: data:;
        font-src 'self';
        connect-src 'self';
        object-src 'none';
        base-uri 'self';
        form-action 'self';
        frame-ancestors 'none';
    `.replace(/\s{2,}/g, ' ').trim();

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);

    const response = NextResponse.next({request: {headers: requestHeaders}});
    response.headers.set('Content-Security-Policy', csp);

    return response;
}

export const config = {
    matcher: [
        // Les routes d'API n'ont pas de document à protéger, et les fichiers
        // statiques n'ont pas besoin d'un nonce par requête. Les préchargements
        // de `next/link` sont exclus pour ne pas consommer un nonce qui ne
        // servira jamais.
        {
            source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
            missing: [
                {type: 'header', key: 'next-router-prefetch'},
                {type: 'header', key: 'purpose', value: 'prefetch'},
            ],
        },
        '/api/:path*',
    ],
};
