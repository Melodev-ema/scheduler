import type {Types} from 'mongoose';
import type {NextRequest} from 'next/server';
import Activity from '@/models/Activity';
import Task from '@/models/Task';
import dbConnect from '@/server/infrastructure/db/connection';
import Planning, {PlanningInterface} from '@/models/Planning';
import {ScheduleInterface} from '@/models/Schedule';
import {generateWeeklyPlanning, LlmRequestError} from '@/services/LlmService';
import {ActivityInput} from '@/server/domain/planning/mergeTasks';
import {TaskInput} from '@/server/domain/planning/tasks';
import {
    InvalidModelResponseError,
    parseNote,
    parseSacrifices,
    parseSchedule,
    Sacrifice,
    ScheduleSlot,
} from '@/server/domain/planning/parseSchedule';
import {checkSchedule} from '@/server/domain/planning/checkSchedule';
import {buildCorrectionRequest, isBetterCorrection} from '@/server/domain/planning/correction';
import Settings, {SettingsInterface} from '@/models/Settings';
import {DEFAULT_LUNCH_BREAK, lunchBreakOf, validateLunchBreak} from '@/server/domain/planning/lunchBreak';
import {isWeekday} from '@/server/domain/planning/days';
import {weekStartOf} from '@/server/domain/planning/partial';
import {assembleSchedule, planTarget, prepareGeneration} from '@/server/domain/planning/generation';
import {nextWeekStart, weekKeyOf} from '@/server/domain/planning/week';
import {createRateLimiter} from '@/server/http/rateLimit';
import {fail, invalidInput, readJsonBody, serverError} from '@/server/http/apiResponse';
import {generateBodySchema, weekQuerySchema} from '@/server/http/schemas/schedule';
import {latestPlanningOf} from '@/server/infrastructure/db/plannings';

/** Nombre d'appels au modèle avant d'abandonner sur une réponse inexploitable. */
const GENERATION_ATTEMPTS = 2;

/**
 * Échéance de toute la génération, reprises et correction comprises. Sans
 * elle, 9 requêtes de 10 minutes chacune pouvaient s'enchaîner. Le client
 * attend un peu plus longtemps (voir useWeek), pour toujours recevoir la
 * réponse du serveur plutôt que d'abandonner avant lui.
 */
const GENERATION_DEADLINE_MS = 2 * 60 * 1000;

/**
 * Cinq générations par quart d'heure : très au-dessus de l'usage réel — on
 * régénère une semaine, pas une minute — et assez bas pour qu'un clic bloqué
 * ou une boucle côté client ne coûte que cinq appels au modèle.
 */
const GENERATION_LIMIT = 5;
const GENERATION_WINDOW_MS = 15 * 60 * 1000;

// Instancié au chargement du module : l'état vit aussi longtemps que le processus.
const generationLimiter = createRateLimiter(GENERATION_LIMIT, GENERATION_WINDOW_MS);

export async function GET(request: NextRequest) {
    try {
        await dbConnect();

        const parsed = weekQuerySchema.safeParse({week: request.nextUrl.searchParams.get('week') ?? undefined});
        if (!parsed.success) {
            return invalidInput(parsed.error);
        }

        const planning = await latestPlanningOf(parsed.data.week ?? weekStartOf(new Date()));
        if (planning) {
            return Response.json(planning);
        }

        return fail(404, 'Planning introuvable');
    } catch (error) {
        return serverError('GET /api/generate_weekly_planning', error);
    }
}

export async function POST(request: NextRequest) {
    try {
        await dbConnect();

        // Un corps absent reste une génération de la semaine en cours.
        const parsed = generateBodySchema.safeParse((await readJsonBody(request)) ?? {});
        if (!parsed.success) {
            return invalidInput(parsed.error);
        }
        const {week} = parsed.data;
        const now = new Date();
        const {weekStart} = planTarget(week, now);

        const [activities, allTasks, settings, latest, currentWeek, preparedWeek] = await Promise.all([
            Activity.find({}).lean<ActivityInput[]>(),
            Task.find({done: false}).lean<Array<TaskInput & {_id: Types.ObjectId}>>(),
            Settings.findOne().lean<SettingsInterface>(),
            latestPlanningOf(weekStart).lean<PlanningInterface>(),
            // Pour la semaine suivante : la semaine en cours, où une tâche peut encore avoir un créneau à venir.
            week === 'next' ? latestPlanningOf(weekStartOf(now)).lean<PlanningInterface>() : null,
            // Pour la semaine en cours : la semaine suivante déjà préparée, dont les tâches ne se replacent pas ici.
            week === 'current'
                ? latestPlanningOf(nextWeekStart(now)).select('schedule').lean<Pick<PlanningInterface, 'schedule'>>()
                : null,
        ]);

        // Un réglage invalide (édité à la main en base) ne doit jamais faire échouer une génération.
        let lunch = lunchBreakOf(settings ?? {});
        if (lunch && validateLunchBreak(lunch).length > 0) {
            console.warn(`Génération : pause réglée invalide (${lunch.start}–${lunch.end}), pause par défaut utilisée`);
            lunch = DEFAULT_LUNCH_BREAK;
        }

        const previous: ScheduleInterface[] = latest?.schedule ?? [];
        const unknownDays = previous.filter((slot) => !isWeekday(slot.day)).length;
        if (unknownDays > 0) {
            console.warn(`Génération : ${unknownDays} créneau(x) au jour inconnu ignoré(s)`);
        }

        const generation = prepareGeneration({
            week,
            now,
            activities,
            tasks: allTasks,
            previous,
            currentWeek: currentWeek?.schedule ?? null,
            preparedWeek: preparedWeek?.schedule ?? null,
            lunch,
        });
        if (generation.kind === 'nothing-to-plan') {
            return fail(409, 'Aucune activité ni tâche à planifier');
        }
        if (generation.kind === 'week-over') {
            const prepared = await latestPlanningOf(generation.nextWeek).select('_id').lean();
            return fail(409, 'Il ne reste rien à planifier cette semaine', undefined, {
                nextWeek: weekKeyOf(generation.nextWeek),
                nextWeekPrepared: prepared !== null,
            });
        }
        const {weekWindows, weekRequests, dayWindows, requests, busy, frozen, partial, taskIdByRef, payload} = generation;

        const weekEndDate = new Date(weekStart);
        weekEndDate.setDate(weekEndDate.getDate() + 6);
        const dates = `${weekStart.toLocaleDateString('fr')} - ${weekEndDate.toLocaleDateString('fr')}`;

        async function save(replanned: ScheduleSlot[], violations: string[], sacrifices: Sacrifice[], note: string) {
            // Le modèle a pu prendre deux minutes : une coche ou un verrou posé entre-temps
            // sur un créneau gardé est relu ici, pour ne pas l'écraser avec l'ancien état.
            const current = latest !== null && frozen.length > 0
                ? await Planning.findById(latest._id).lean<PlanningInterface>()
                : null;
            const schedule = assembleSchedule({frozen, current: current?.schedule ?? [], replanned, lunch, taskIdByRef});

            await new Planning({
                name: `Planning du ${dates}`,
                weekStart,
                days: weekWindows.map((window) => window.jour),
                activities: weekRequests,
                schedule,
                violations,
                sacrifices,
                note,
                lunchBreak: lunch,
            }).save();

            return Response.json({schedule, violations, sacrifices, note, partial, week: weekKeyOf(weekStart)});
        }

        // Tout ce qui restait est déjà en place : pas d'appel au modèle. La note et
        // les sacrifices du planning précédent décrivent encore cette semaine.
        if (requests.length === 0) {
            return save([], [], latest?.sacrifices ?? [], latest?.note ?? '');
        }

        // Compté seulement ici, juste avant le premier appel au modèle : un 409 ou
        // une semaine déjà toute en place ne coûtent rien et n'entament pas le quota.
        const decision = generationLimiter();
        if (!decision.allowed) {
            return fail(
                429,
                'Trop de générations demandées. Réessayez dans quelques minutes.',
                {'Retry-After': String(decision.retryAfterSeconds)},
            );
        }

        let slots: ScheduleSlot[] | null = null;
        let sacrifices: Sacrifice[] = [];
        let note = '';
        let lastRejection = '';
        let accepted = '';
        const deadline = AbortSignal.timeout(GENERATION_DEADLINE_MS);

        // Un modèle ouvert échoue plus souvent à respecter le contrat de sortie
        // qu'un modèle propriétaire ; une seconde tentative suffit en pratique.
        for (let attempt = 1; attempt <= GENERATION_ATTEMPTS && slots === null && !deadline.aborted; attempt++) {
            let raw: string | null;
            try {
                raw = await generateWeeklyPlanning(payload, {signal: deadline});
            } catch (error) {
                // 401/403 : la clé est absente ou refusée. Retenter ne changera
                // rien, et ce n'est pas le modèle qui est en faute — on sort.
                if (error instanceof LlmRequestError && (error.status === 401 || error.status === 403)) {
                    return serverError('Génération : authentification refusée par le fournisseur', error);
                }

                // Panne réseau, quota, réponse illisible : un échec d'appel se
                // traite comme une réponse inexploitable, pas comme un bug du serveur.
                lastRejection = error instanceof Error ? error.message : 'appel au modèle échoué';
                console.error(`Génération, tentative ${attempt}/${GENERATION_ATTEMPTS} : ${lastRejection}`);
                continue;
            }

            if (!raw) {
                lastRejection = 'réponse vide';
                console.error(`Génération, tentative ${attempt}/${GENERATION_ATTEMPTS} : ${lastRejection}`);
                continue;
            }

            try {
                slots = parseSchedule(raw);
                sacrifices = parseSacrifices(raw);
                note = parseNote(raw);
                accepted = raw;
            } catch (error) {
                if (!(error instanceof InvalidModelResponseError)) {
                    throw error;
                }
                lastRejection = error.message;
                console.error(`Génération, tentative ${attempt}/${GENERATION_ATTEMPTS} : ${lastRejection}`);
            }
        }

        if (slots === null) {
            console.error(deadline.aborted
                ? `Génération abandonnée : échéance de ${GENERATION_DEADLINE_MS / 1000} s dépassée`
                : `Génération abandonnée après ${GENERATION_ATTEMPTS} tentatives. Dernier rejet : ${lastRejection}`);
            return fail(502, 'Le modèle a renvoyé un planning invalide');
        }

        let violations = checkSchedule(slots, requests, dayWindows, lunch, busy);

        // Retry ciblé : une seule tentative, où le modèle corrige sa propre
        // réponse à partir des violations. On ne garde la correction que si
        // elle fait mieux ; un échec ici ne coûte jamais le premier planning.
        if (violations.length > 0 && !deadline.aborted) {
            try {
                const corrected = await generateWeeklyPlanning(payload, {
                    correction: {previous: accepted, request: buildCorrectionRequest(violations)},
                    signal: deadline,
                });
                if (corrected) {
                    const correctedSlots = parseSchedule(corrected);
                    const correctedViolations = checkSchedule(correctedSlots, requests, dayWindows, lunch, busy);
                    console.warn(`Génération, correction : ${violations.length} → ${correctedViolations.length} violation(s)`);
                    if (isBetterCorrection(violations, correctedViolations)) {
                        slots = correctedSlots;
                        sacrifices = parseSacrifices(corrected);
                        note = parseNote(corrected);
                        violations = correctedViolations;
                    }
                }
            } catch (error) {
                console.error('Génération, correction abandonnée :', error instanceof Error ? error.message : error);
            }
        }

        // Un planning qui viole encore des règles est gardé et affiché avec ses
        // violations : c'est à l'utilisatrice de décider si elle relance.
        if (violations.length > 0) {
            console.warn(`Génération : ${violations.length} règle(s) non respectée(s)`);
        }

        return save(slots, violations, sacrifices, note);
    } catch (error) {
        return serverError('POST /api/generate_weekly_planning', error);
    }
}
