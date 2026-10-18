import type {ZodError} from 'zod';

/**
 * Forme unique des erreurs de l'API : {error: "…"}, plus d'éventuels champs `extra`
 * qu'un client lit pour décider de la suite. Le détail d'une exception
 * — message Mongo, réponse d'un service tiers, trace — reste côté serveur : il renseigne
 * un attaquant bien plus qu'il n'aide l'utilisatrice.
 *
 * Différence avec l'ancien `respond.ts` (supprimé en phase 7) : ces fonctions
 * *rendent* une réponse au lieu d'écrire dans une `NextApiResponse`. C'est le
 * contrat des Route Handlers, et accessoirement ce qui les rend testables
 * sans serveur.
 */
export function fail(
    status: number,
    message: string,
    headers?: HeadersInit,
    extra?: Record<string, unknown>,
): Response {
    // `extra` précise l'erreur pour le client ; il ne remplace jamais son message.
    return Response.json({...extra, error: message}, {status, headers});
}

/**
 * 400 sur échec de validation. Les chemins et messages Zod décrivent *notre*
 * contrat d'entrée, pas l'état interne du serveur : les renvoyer aide au
 * débogage sans rien divulguer. C'est la seule exception assumée à la règle
 * du message générique.
 */
export function invalidInput(error: ZodError): Response {
    const details = error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path} : ${issue.message}` : issue.message;
    });

    return Response.json({error: 'Requête invalide', details}, {status: 400});
}

/**
 * 500 : journalise le détail, ne renvoie qu'un message générique. `context`
 * situe l'erreur dans les logs, seul endroit où elle sera lisible.
 */
export function serverError(context: string, error: unknown): Response {
    console.error(`${context} :`, error);
    return fail(500, 'Erreur interne du serveur');
}

/**
 * Corps JSON d'une requête, ou `undefined` s'il est absent ou illisible.
 *
 * `request.json()` **lève** sur un corps vide, là où `req.body` du Pages Router
 * valait simplement `undefined`. Sans ce rattrapage, une requête sans corps
 * remonterait en 500 au lieu du 400 que rend le schéma Zod sur `undefined`.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        return undefined;
    }
}
