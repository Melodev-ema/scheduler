import {getEnv} from "@/server/config/env";
import {isRetryableStatus, retryDelayMs} from "@/services/llmRetry";
import {WEEKDAYS} from "@/server/domain/planning/days";
import {TIME_PATTERN} from "@/server/domain/planning/time";

export const REASONING_EFFORT = "medium";

const TIME = {type: "string", pattern: TIME_PATTERN.source};

export const SCHEDULE_SCHEMA = {
    type: "object",
    properties: {
        schedule: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    day: {type: "string", enum: [...WEEKDAYS]},
                    start_time: TIME,
                    end_time: TIME,
                    activity: {type: "string"},
                    description: {type: "string"},
                    ref: {type: ["string", "null"]},
                },
                required: ["day", "start_time", "end_time", "activity", "description", "ref"],
                additionalProperties: false,
            },
        },
        sacrifices: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    activity: {type: "string"},
                    day: {type: "string"},
                    type: {type: "string", enum: ["supprimée", "raccourcie"]},
                    detail: {type: "string"},
                },
                required: ["activity", "day", "type", "detail"],
                additionalProperties: false,
            },
        },
        note: {type: "string"},
    },
    required: ["schedule", "sacrifices", "note"],
    additionalProperties: false,
};

/** Le SDK openai posait dix minutes ; on garde la même borne. */
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
/** Un appel plus deux reprises : le `maxRetries` par défaut du SDK retiré. */
const MAX_ATTEMPTS = 3;

/** Échec HTTP du fournisseur, après épuisement des reprises. */
export class LlmRequestError extends Error {
    constructor(readonly status: number, readonly body: string) {
        super(`Le fournisseur a répondu ${status}`);
        this.name = 'LlmRequestError';
    }
}

export class LlmTruncatedError extends Error {
    constructor(readonly maxTokens: number) {
        super(`Réponse tronquée à ${maxTokens} tokens`);
        this.name = 'LlmTruncatedError';
    }
}

interface ChatUsage {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: {reasoning_tokens?: number};
}

interface ChatCompletion {
    choices?: Array<{message?: {content?: string | null}; finish_reason?: string}>;
    usage?: ChatUsage;
}

function describeUsage(finishReason: string | undefined, usage: ChatUsage | undefined, elapsedMs: number): string {
    const reasoning = usage?.completion_tokens_details?.reasoning_tokens;
    return [
        `fin ${finishReason ?? '?'}`,
        `entrée ${usage?.prompt_tokens ?? '?'}`,
        `sortie ${usage?.completion_tokens ?? '?'}`,
        ...(reasoning !== undefined ? [`raisonnement ${reasoning}`] : []),
        `${(elapsedMs / 1000).toFixed(1)} s`,
    ].join(', ');
}

/** Attente de reprise, interrompue par l'échéance de la génération. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason);
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(signal.reason);
        }, {once: true});
    });
}

/**
 * Le contrat de sortie est validé par parseSchedule ; ce module ne fait
 * qu'appeler le modèle. Températures basses : la tâche est contrainte
 * (blocs fixes, jours autorisés, pas de chevauchement), pas créative.
 */
const TEMPERATURE = 0.3;

/**
 * La sortie porte désormais "sacrifices" en plus de "schedule", avec une séance
 * par jour coché plutôt qu'un seul créneau global : ~80 tokens par créneau,
 * jusqu'à une cinquantaine de créneaux (10 activités × 5 jours) plus les sacrifices.
 */
const MAX_TOKENS = 8192;

const SYSTEM_PROMPT = `Tu construis un emploi du temps hebdomadaire. Réponds uniquement avec un objet JSON brut, sans texte autour.

## Entrée
- "jours" : les jours à planifier, chacun avec "jour", "heure_debut" et "heure_fin". Ne place jamais rien en dehors de ces horaires.
- "pause" : la pause de midi, de "debut" à "fin", la même chaque jour. Absente : il n'y a pas de pause.
- "occupe" : des créneaux déjà en place cette semaine, chacun avec "jour", "debut", "fin" et "activite". Tu ne les renvoies pas. Absente : rien n'est déjà en place.
- "activites" : pour chaque activité :
  - "name", "description"
  - "priority" : 1 = indispensable, 2 = important, 3 = accessoire
  - "sessions" : nombre de séances à placer dans la semaine
  - "sessionMinutes" : durée d'une séance, en minutes
  - "minSessionMinutes" : durée sous laquelle une séance ne descend jamais
  - "days" : les seuls jours où l'activité peut avoir lieu
  - "startTime" et "endTime" : quand les deux sont renseignés, c'est un bloc fixe
  - "ref" : présent seulement sur une tâche ponctuelle, un identifiant court

## Règles
1. Place exactement "sessions" séances de chaque activité, ni plus ni moins, chacune un jour différent pris dans "days" : jamais deux séances de la même activité le même jour (une séance coupée par la pause compte pour une seule, voir règle 6).
2. "days" liste les jours possibles, pas les jours imposés. Quand "days" compte plus de jours que "sessions", choisis-en seulement "sessions" : aucune séance de cette activité les autres jours, blocs fixes compris.
3. Chaque séance dure "sessionMinutes".
4. Un bloc fixe se place exactement de "startTime" à "endTime", les seuls jours choisis : ni déplacé, ni raccourci.
5. Si "pause" est présente, ne place rien pendant la pause de midi, entre "debut" et "fin". Seul un bloc fixe qui tombe sur la pause y reste.
6. Si "pause" est présente, une séance libre qui ne tient pas avant la pause peut être coupée en deux parties le même jour : la première finit juste avant la pause, la seconde reprend juste après. Chaque partie dure au moins 30 min et leur total fait la durée de la séance. Écris chaque partie comme un créneau de "schedule", avec le même "activity". Ne coupe jamais une séance ailleurs qu'autour de la pause, ni un bloc fixe. Sans "pause", ne coupe aucune séance.
7. Aucun chevauchement, ni entre tes créneaux, ni avec ceux de "occupe" quand elle est présente. Laisse une courte pause entre deux séances qui ne sont pas des blocs fixes.
8. Étale les séances d'une même activité sur la semaine plutôt que sur des jours consécutifs.
9. Le temps qui reste libre reste libre : ne rallonge aucune séance.

## Bon sens
Une fois les règles respectées, organise la semaine comme le ferait une personne sensée, en t'appuyant sur le nom et la description de chaque activité. Ces consignes ne passent jamais avant les règles.
- Place chaque activité à un moment naturel : le travail exigeant plutôt le matin, les loisirs plutôt en fin de journée.
- Équilibre les journées : pas une journée surchargée à côté d'une journée creuse, pas deux gros blocs de concentration d'affilée sans pause.

## Quand tout ne tient pas
Applique ces étapes dans l'ordre, et seulement autant que nécessaire :
1. supprime des séances de priorité 3, les séances libres avant les blocs fixes ;
2. raccourcis des séances de priorité 2 qui ne sont pas des blocs fixes, sans descendre sous "minSessionMinutes" ;
3. supprime des séances de priorité 2, les séances libres avant les blocs fixes.
Ne supprime et ne raccourcis jamais une séance de priorité 1.

## Sortie
{
  "schedule": [
    {"day": "lundi", "start_time": "09:00", "end_time": "10:00", "activity": "Sport", "description": "Séance de cardio", "ref": null}
  ],
  "sacrifices": [
    {"activity": "Lecture", "day": "mercredi", "type": "supprimée", "detail": "plus de place après le travail"},
    {"activity": "Anglais", "day": "lundi", "type": "raccourcie", "detail": "60 → 40 min"}
  ],
  "note": "Sport du lundi au jeudi pour garder le vendredi matin libre ; l'apprentissage le matin, quand on est le plus frais."
}
- "activity" reprend exactement le "name" de l'activité.
- Quand l'activité a un "ref", chaque créneau qui la concerne porte "ref" avec exactement la même valeur ; sinon, "ref" vaut null.
- "sacrifices" liste chaque séance supprimée ou raccourcie ; tableau vide si rien n'a été sacrifié.
- "note" explique en deux ou trois phrases, en tutoyant, les choix principaux de la semaine : pourquoi ces jours, ces horaires, ce qui a dû céder. Quand "occupe" est présente, elle parle du reste de la semaine.
`;

/**
 * Appelle un point d'entrée chat-completions compatible OpenAI. Le contrat de
 * sortie est validé par parseSchedule ; ici on ne gère que le transport et sa
 * reprise — c'est le seul service que rendait le SDK retiré.
 */
export async function generateWeeklyPlanning(
    userJson: string,
    {correction, signal}: {
        correction?: {previous: string; request: string};
        /** Échéance globale de la génération : aucune reprise ne la dépasse. */
        signal?: AbortSignal;
    } = {},
): Promise<string | null> {
    const env = getEnv();
    const body = JSON.stringify({
        model: env.llmModel,
        messages: [
            {role: "system", content: SYSTEM_PROMPT},
            {role: "user", content: userJson},
            // Retry ciblé : le modèle relit sa réponse et les violations relevées.
            ...(correction
                ? [
                    {role: "assistant", content: correction.previous},
                    {role: "user", content: correction.request},
                ]
                : []),
        ],
        response_format: {type: "json_schema", json_schema: {name: "planning", strict: true, schema: SCHEDULE_SCHEMA}},
        reasoning_effort: REASONING_EFFORT,
        include_reasoning: false,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        top_p: 1,
    });

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const isLastAttempt = attempt === MAX_ATTEMPTS;
        const startedAt = Date.now();
        let response: Response;

        try {
            response = await fetch(`${env.llmBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${env.llmApiKey}`,
                },
                body,
                signal: signal
                    ? AbortSignal.any([AbortSignal.timeout(REQUEST_TIMEOUT_MS), signal])
                    : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            // Panne réseau ou délai dépassé : le SDK retentait aussi. Pas après
            // l'échéance globale : elle est là précisément pour arrêter.
            if (isLastAttempt || signal?.aborted) {
                throw error;
            }
            await sleep(retryDelayMs(attempt), signal);
            continue;
        }

        if (response.ok) {
            const completion = await response.json() as ChatCompletion;
            const choice = completion.choices?.[0];
            console.info(`Modèle : ${describeUsage(choice?.finish_reason, completion.usage, Date.now() - startedAt)}`);
            if (choice?.finish_reason === 'length') {
                throw new LlmTruncatedError(MAX_TOKENS);
            }
            return choice?.message?.content ?? null;
        }

        const errorBody = await response.text();
        if (isLastAttempt || !isRetryableStatus(response.status)) {
            throw new LlmRequestError(response.status, errorBody);
        }

        console.warn(`Modèle : réponse ${response.status}, reprise ${attempt}/${MAX_ATTEMPTS - 1}`);
        await sleep(retryDelayMs(attempt, response.headers), signal);
    }

    // Inatteignable : la dernière tentative retourne ou lève.
    throw new Error('Génération : boucle de reprise épuisée');
}
