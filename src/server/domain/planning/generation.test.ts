import {describe, expect, it} from 'vitest';
import {
    assembleSchedule, GenerationInput, prepareGeneration, ReadyGeneration, StoredSlot,
} from '@/server/domain/planning/generation';
import {DEFAULT_LUNCH_BREAK} from '@/server/domain/planning/lunchBreak';
import {ActivityInput} from '@/server/domain/planning/mergeTasks';
import {ScheduleSlot} from '@/server/domain/planning/parseSchedule';

type Task = {_id: string; title: string; minutes?: number};

const THURSDAY = new Date(2026, 9, 22, 10, 20);
const WEEKDAYS_ONLY = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'];
const SPORT: ActivityInput = {name: 'Sport', days: WEEKDAYS_ONLY, timeToSpend: 60, timesPerWeek: null, priority: 2};

function stored(overrides: Partial<StoredSlot> = {}): StoredSlot {
    return {
        day: 'lundi', startTime: '09:00', endTime: '10:00', activity: 'Sport', description: '', status: 'pending',
        ...overrides,
    };
}

function input(overrides: Partial<GenerationInput<Task, StoredSlot>> = {}): GenerationInput<Task, StoredSlot> {
    return {
        week: 'current',
        now: THURSDAY,
        activities: [SPORT],
        tasks: [],
        previous: [],
        currentWeek: null,
        preparedWeek: null,
        lunch: DEFAULT_LUNCH_BREAK,
        ...overrides,
    };
}

function ready(overrides: Partial<GenerationInput<Task, StoredSlot>> = {}): ReadyGeneration<Task, StoredSlot> {
    const generation = prepareGeneration(input(overrides));
    if (generation.kind !== 'ready') {
        throw new Error(`génération attendue prête, reçu ${generation.kind}`);
    }
    return generation;
}

function payloadOf(generation: ReadyGeneration<Task, StoredSlot>) {
    return JSON.parse(generation.payload);
}

describe('prepareGeneration, semaine en cours', () => {
    it('planifie à partir de maintenant, sur toute la semaine pour ce qui est enregistré', () => {
        const generation = ready();

        expect(generation.weekStart).toEqual(new Date(2026, 9, 19));
        expect(generation.dayWindows).toEqual([
            {jour: 'jeudi', heure_debut: '10:20', heure_fin: '18:00'},
            {jour: 'vendredi', heure_debut: '09:00', heure_fin: '18:00'},
        ]);
        expect(generation.weekRequests[0]).toMatchObject({days: WEEKDAYS_ONLY, sessions: 5});
        expect(generation.requests[0]).toMatchObject({days: ['jeudi', 'vendredi'], sessions: 2});
        expect(generation.partial).toBe(false);
    });

    it('envoie la pause et rien d\'occupé quand rien n\'est figé', () => {
        const payload = payloadOf(ready());

        expect(payload.pause).toEqual({debut: '12:30', fin: '14:00'});
        expect(payload).not.toHaveProperty('occupe');
        expect(Object.keys(payload)).toEqual(['jours', 'pause', 'activites']);
    });

    it('n\'envoie pas de pause quand elle est désactivée', () => {
        expect(payloadOf(ready({lunch: null}))).not.toHaveProperty('pause');
    });

    it('garde ce qui est fait ou passé, consomme ses jours et le signale occupé', () => {
        const mondayDone = stored({day: 'lundi', status: 'done'});
        const thursdayStarted = stored({day: 'jeudi', startTime: '09:00', endTime: '10:30'});
        const fridayPending = stored({day: 'vendredi', startTime: '09:00', endTime: '10:00'});
        const generation = ready({previous: [mondayDone, thursdayStarted, fridayPending]});

        expect(generation.frozen).toEqual([mondayDone, thursdayStarted]);
        expect(generation.partial).toBe(true);
        expect(generation.requests[0]).toMatchObject({days: ['vendredi'], sessions: 1});
        expect(generation.busy).toEqual([{day: 'jeudi', startTime: '09:00', endTime: '10:30', activity: 'Sport'}]);
        expect(payloadOf(generation).occupe).toEqual([{jour: 'jeudi', debut: '09:00', fin: '10:30', activite: 'Sport'}]);
    });

    it('ne renvoie pas une tâche déjà placée dans la semaine préparée', () => {
        const tasks = [{_id: 'a', title: 'Appeler'}, {_id: 'b', title: 'Écrire'}];
        const generation = ready({tasks, preparedWeek: [stored({activity: 'Appeler', taskId: 'a'})]});

        expect([...generation.taskIdByRef]).toEqual([['t1', 'b']]);
    });

    it('renvoie une tâche manquée et retire son ancien créneau', () => {
        const missed = stored({day: 'lundi', activity: 'Appeler', taskId: 'a'});
        const generation = ready({tasks: [{_id: 'a', title: 'Appeler'}], previous: [missed]});

        expect(generation.frozen).toEqual([]);
        expect([...generation.taskIdByRef]).toEqual([['t1', 'a']]);
        expect(payloadOf(generation).activites).toContainEqual(expect.objectContaining({name: 'Appeler', ref: 't1'}));
    });

    it('ne renvoie pas une tâche faite, et garde son créneau', () => {
        const done = stored({day: 'lundi', activity: 'Appeler', taskId: 'a', status: 'done'});
        const generation = ready({tasks: [{_id: 'a', title: 'Appeler'}], previous: [done]});

        expect(generation.frozen).toEqual([done]);
        expect(generation.taskIdByRef.size).toBe(0);
    });

    it('numérote les références après avoir écarté les tâches déjà placées', () => {
        const tasks = [{_id: 'a', title: 'Appeler'}, {_id: 'b', title: 'Écrire'}, {_id: 'c', title: 'Ranger'}];
        const upcoming = stored({day: 'vendredi', activity: 'Appeler', taskId: 'a', locked: true});
        const generation = ready({tasks, previous: [upcoming]});

        expect([...generation.taskIdByRef]).toEqual([['t1', 'b'], ['t2', 'c']]);
    });
});

describe('prepareGeneration, semaine suivante', () => {
    it('ouvre tous les jours de la semaine suivante, comme si on était son lundi 00:00', () => {
        const generation = ready({week: 'next'});

        expect(generation.weekStart).toEqual(new Date(2026, 9, 26));
        expect(generation.dayWindows.map((window) => window.jour)).toEqual(WEEKDAYS_ONLY);
        expect(generation.dayWindows[0].heure_debut).toBe('09:00');
        expect(generation.requests[0]).toMatchObject({sessions: 5});
    });

    it('ne garde de la semaine préparée que les créneaux verrouillés ou faits', () => {
        const locked = stored({day: 'mardi', locked: true});
        const generation = ready({week: 'next', previous: [locked, stored({day: 'mercredi'})]});

        expect(generation.frozen).toEqual([locked]);
    });

    it('écarte une tâche qui a encore un créneau à venir cette semaine, jugée à l\'heure réelle', () => {
        const tasks = [{_id: 'a', title: 'Appeler'}, {_id: 'b', title: 'Écrire'}];
        const currentWeek = [
            stored({day: 'vendredi', activity: 'Appeler', taskId: 'a'}),
            stored({day: 'lundi', activity: 'Écrire', taskId: 'b'}),
        ];
        const generation = ready({week: 'next', tasks, currentWeek});

        expect([...generation.taskIdByRef]).toEqual([['t1', 'b']]);
    });
});

describe('prepareGeneration, rien à faire', () => {
    it('signale qu\'il n\'y a rien à planifier', () => {
        expect(prepareGeneration(input({activities: []}))).toEqual({kind: 'nothing-to-plan'});
    });

    it('signale une semaine finie et donne le lundi suivant', () => {
        const sundayNight = new Date(2026, 9, 25, 23, 55);
        expect(prepareGeneration(input({now: sundayNight}))).toEqual({kind: 'week-over', nextWeek: new Date(2026, 9, 26)});
    });
});

describe('assembleSchedule', () => {
    function fresh(overrides: Partial<ScheduleSlot> = {}): ScheduleSlot {
        return {day: 'vendredi', startTime: '09:00', endTime: '10:00', activity: 'Sport', description: '', ...overrides};
    }

    it('reprend l\'état relu d\'un créneau gardé, coché ou verrouillé pendant l\'appel au modèle', () => {
        const kept = stored({_id: 'x1', day: 'lundi'});
        const current = [stored({_id: 'x1', day: 'lundi', status: 'done', locked: true})];
        const [slot] = assembleSchedule({frozen: [kept], current, replanned: [], lunch: null, taskIdByRef: new Map()});

        expect(slot).toEqual({
            day: 'lundi', startTime: '09:00', endTime: '10:00', activity: 'Sport', description: '', priority: undefined,
            status: 'done', locked: true, part: 1, parts: 1,
        });
    });

    it('relie les nouveaux créneaux à leur tâche, numérote une séance coupée et trie la semaine', () => {
        const schedule = assembleSchedule({
            frozen: [stored({day: 'jeudi', taskId: 'z'})],
            current: [],
            replanned: [
                fresh({day: 'vendredi', startTime: '14:00', endTime: '15:00', activity: 'Appeler', ref: 't1'}),
                fresh({day: 'vendredi', startTime: '11:30', endTime: '12:30', activity: 'Appeler', ref: 't1'}),
                fresh({day: 'mardi', ref: 't9'}),
            ],
            lunch: DEFAULT_LUNCH_BREAK,
            taskIdByRef: new Map([['t1', 'a']]),
        });

        expect(schedule.map((slot) => [slot.day, slot.startTime, slot.part, slot.parts, 'taskId' in slot ? slot.taskId : null]))
            .toEqual([
                ['mardi', '09:00', 1, 1, null],
                ['jeudi', '09:00', 1, 1, 'z'],
                ['vendredi', '11:30', 1, 2, 'a'],
                ['vendredi', '14:00', 2, 2, 'a'],
            ]);
    });
});
