import {describe, expect, it} from 'vitest';
import {
    busySlotsOf, compareSlots, excludePlacedTasks, excludeTasksIn, excludeUpcomingTasks, withoutResentTasks, frozenSlots, isCurrentWeek, isFrozen, PlacedSlot,
    remainingRequests, remainingWindows, sessionPartsOf, weekStartOf,
} from '@/server/domain/planning/partial';
import {DayWindow} from '@/server/domain/planning/buildDayWindows';
import {SessionRequest} from '@/server/domain/planning/sessions';
import {Weekday} from '@/server/domain/planning/days';

function placed(overrides: Partial<PlacedSlot> = {}): PlacedSlot {
    return {day: 'jeudi', startTime: '15:00', endTime: '16:00', activity: 'Sport', status: 'pending', ...overrides};
}

function request(overrides: Partial<SessionRequest> = {}): SessionRequest {
    return {
        name: 'Sport', description: '', priority: 2, sessions: 3, sessionMinutes: 60, minSessionMinutes: 30,
        days: ['lundi', 'mercredi', 'jeudi', 'vendredi'], startTime: '', endTime: '', ...overrides,
    };
}

function window(jour: Weekday, heure_debut = '09:00', heure_fin = '18:00'): DayWindow {
    return {jour, heure_debut, heure_fin};
}

/** Jeudi 10:20. */
const TODAY: Weekday = 'jeudi';
const NOW = 10 * 60 + 20;

describe('weekStartOf', () => {
    it('ramène un mercredi au lundi de sa semaine, à minuit', () => {
        expect(weekStartOf(new Date(2026, 8, 30, 15, 42))).toEqual(new Date(2026, 8, 28));
    });

    it('garde un lundi à minuit tel quel', () => {
        expect(weekStartOf(new Date(2026, 8, 28))).toEqual(new Date(2026, 8, 28));
    });

    it('range le dimanche dans sa propre semaine', () => {
        expect(weekStartOf(new Date(2026, 9, 4, 20))).toEqual(new Date(2026, 8, 28));
    });
});

describe('isCurrentWeek', () => {
    it('reconnaît un planning de la semaine en cours', () => {
        expect(isCurrentWeek(new Date(2026, 8, 28, 8), new Date(2026, 9, 4, 22))).toBe(true);
    });

    it('écarte un planning de la semaine précédente', () => {
        expect(isCurrentWeek(new Date(2026, 8, 27, 22), new Date(2026, 8, 28, 8))).toBe(false);
    });

    it('accepte un horodatage en chaîne, comme le renvoie l’API', () => {
        expect(isCurrentWeek(new Date(2026, 8, 29).toISOString(), new Date(2026, 8, 30))).toBe(true);
    });
});

describe('isFrozen', () => {
    it('fige un créneau fait', () => {
        expect(isFrozen(placed({day: 'vendredi', status: 'done'}), TODAY, NOW)).toBe(true);
    });

    it('fige un créneau verrouillé', () => {
        expect(isFrozen(placed({day: 'vendredi', locked: true}), TODAY, NOW)).toBe(true);
    });

    it('fige un créneau d’un jour passé, même non fait', () => {
        expect(isFrozen(placed({day: 'mardi'}), TODAY, NOW)).toBe(true);
    });

    it('fige un créneau du jour déjà commencé', () => {
        expect(isFrozen(placed({startTime: '10:00', endTime: '11:00'}), TODAY, NOW)).toBe(true);
        expect(isFrozen(placed({startTime: '10:20', endTime: '11:00'}), TODAY, NOW)).toBe(true);
    });

    it('replanifie un créneau du jour encore à venir', () => {
        expect(isFrozen(placed({startTime: '10:30', endTime: '11:00'}), TODAY, NOW)).toBe(false);
    });

    it('replanifie un créneau d’un jour suivant', () => {
        expect(isFrozen(placed({day: 'vendredi', startTime: '08:00'}), TODAY, NOW)).toBe(false);
    });
});

describe('sessionPartsOf', () => {
    it('renvoie le créneau seul quand la séance n’est pas coupée', () => {
        const alone = placed();
        expect(sessionPartsOf([alone, placed({startTime: '17:00'})], alone)).toEqual([alone]);
    });

    it('renvoie les deux parties d’une séance coupée', () => {
        const first = placed({startTime: '11:30', endTime: '12:30', parts: 2});
        const second = placed({startTime: '14:00', endTime: '14:30', parts: 2});
        expect(sessionPartsOf([first, placed({day: 'vendredi', parts: 2}), second], second)).toEqual([first, second]);
    });

    it('ne mêle pas une tâche à une activité du même nom', () => {
        const activity = placed({startTime: '11:30', endTime: '12:30', parts: 2});
        const task = placed({startTime: '14:00', endTime: '14:30', parts: 2, taskId: 'abc'});
        expect(sessionPartsOf([activity, task], activity)).toEqual([activity]);
    });
});

describe('frozenSlots', () => {
    it('garde seulement les créneaux figés, dans l’ordre du planning', () => {
        const done = placed({day: 'vendredi', status: 'done'});
        const past = placed({day: 'lundi'});
        const upcoming = placed({day: 'samedi'});
        expect(frozenSlots([done, upcoming, past], TODAY, NOW)).toEqual([done, past]);
    });

    it('fige la seconde partie quand la première est faite', () => {
        const first = placed({day: 'vendredi', startTime: '11:30', endTime: '12:30', parts: 2, status: 'done'});
        const second = placed({day: 'vendredi', startTime: '14:00', endTime: '14:30', parts: 2});
        expect(frozenSlots([first, second], TODAY, NOW)).toEqual([first, second]);
    });

    it('fige la première partie quand la seconde est verrouillée', () => {
        const first = placed({day: 'vendredi', startTime: '11:30', endTime: '12:30', parts: 2});
        const second = placed({day: 'vendredi', startTime: '14:00', endTime: '14:30', parts: 2, locked: true});
        expect(frozenSlots([first, second], TODAY, NOW)).toEqual([first, second]);
    });

    it('ignore un créneau au jour inconnu', () => {
        expect(frozenSlots([placed({day: 'jeudy', status: 'done'})], TODAY, NOW)).toEqual([]);
    });
});

describe('remainingWindows', () => {
    it('retire les jours passés', () => {
        expect(remainingWindows([window('lundi'), window('vendredi')], TODAY, NOW)).toEqual([window('vendredi')]);
    });

    it('fait commencer aujourd’hui maintenant, à la minute', () => {
        expect(remainingWindows([window('jeudi')], TODAY, NOW)).toEqual([window('jeudi', '10:20')]);
    });

    it('garde le début de la journée quand elle n’a pas commencé', () => {
        expect(remainingWindows([window('jeudi')], TODAY, 7 * 60)).toEqual([window('jeudi')]);
    });

    it('garde aujourd’hui tant qu’il en reste un quart d’heure', () => {
        expect(remainingWindows([window('jeudi')], TODAY, 17 * 60 + 45)).toEqual([window('jeudi', '17:45')]);
    });

    it('retire aujourd’hui quand il est trop tard', () => {
        expect(remainingWindows([window('jeudi'), window('vendredi')], TODAY, 17 * 60 + 50))
            .toEqual([window('vendredi')]);
    });

    it('garde une fin de journée élargie par un bloc fixe', () => {
        expect(remainingWindows([window('jeudi', '09:00', '21:00')], TODAY, 18 * 60 + 5))
            .toEqual([window('jeudi', '18:05', '21:00')]);
    });
});

describe('remainingRequests', () => {
    const REMAINING = (['jeudi', 'vendredi', 'samedi', 'dimanche'] as Weekday[]).map((day) => window(day));

    it('déduit les jours déjà occupés par l’activité', () => {
        const frozen = [placed({day: 'lundi', status: 'done'}), placed({day: 'mercredi'})];
        expect(remainingRequests([request()], frozen, REMAINING))
            .toEqual([request({sessions: 1, days: ['jeudi', 'vendredi']})]);
    });

    it('ne rattrape pas une séance manquée', () => {
        const frozen = [placed({day: 'lundi'}), placed({day: 'mercredi'})];
        expect(remainingRequests([request({sessions: 4})], frozen, REMAINING))
            .toEqual([request({sessions: 2, days: ['jeudi', 'vendredi']})]);
    });

    it('retire un jour restant déjà occupé', () => {
        const frozen = [placed({day: 'vendredi', locked: true})];
        expect(remainingRequests([request({sessions: 2})], frozen, REMAINING))
            .toEqual([request({sessions: 1, days: ['jeudi']})]);
    });

    it('borne les séances aux jours restants', () => {
        expect(remainingRequests([request({sessions: 4})], [], REMAINING))
            .toEqual([request({sessions: 2, days: ['jeudi', 'vendredi']})]);
    });

    it('n’envoie pas une activité déjà satisfaite', () => {
        const frozen = [placed({day: 'lundi', status: 'done'})];
        expect(remainingRequests([request({sessions: 1})], frozen, REMAINING)).toEqual([]);
    });

    it('ne compte pas pour une activité le créneau d’une tâche du même nom', () => {
        const frozen = [placed({day: 'lundi', status: 'done', taskId: 'abc'})];
        expect(remainingRequests([request({sessions: 1})], frozen, REMAINING))
            .toEqual([request({sessions: 1, days: ['jeudi', 'vendredi']})]);
    });

    it('ne demande pas aujourd’hui un bloc fixe dont l’heure est passée', () => {
        const gym = request({priority: 1, sessions: 5, days: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'],
            startTime: '08:00', endTime: '09:00'});
        // Comme buildDayWindows, les fenêtres s'ouvrent à 08:00 pour le bloc.
        expect(remainingRequests([gym], [], [window('jeudi', '10:20'), window('vendredi', '08:00')]))
            .toEqual([{...gym, sessions: 1, days: ['vendredi']}]);
    });

    it('garde aujourd’hui un bloc fixe qui n’a pas encore commencé', () => {
        const call = request({sessions: 1, days: ['jeudi'], startTime: '10:30', endTime: '11:00'});
        expect(remainingRequests([call], [], [window('jeudi', '10:20')])).toEqual([call]);
    });

    it('ne déduit rien d’une tâche : excludePlacedTasks s’en charge', () => {
        const task = request({name: 'Impôts', ref: 't1', sessions: 1, days: ['jeudi', 'vendredi']});
        const frozen = [placed({day: 'lundi', activity: 'Impôts', taskId: 'abc'})];
        expect(remainingRequests([task], frozen, REMAINING)).toEqual([task]);
    });
});

describe('excludePlacedTasks', () => {
    const tasks = [{_id: 'a'}, {_id: 'b'}, {_id: 'c'}];

    it('retire une tâche dont le créneau est verrouillé ou fait', () => {
        const frozen = [placed({taskId: 'a', locked: true}), placed({taskId: 'b', status: 'done'})];
        expect(excludePlacedTasks(tasks, frozen, TODAY, NOW)).toEqual([{_id: 'c'}]);
    });

    it('renvoie une tâche dont le créneau est passé sans être fait', () => {
        expect(excludePlacedTasks(tasks, [placed({day: 'lundi', taskId: 'a'})], TODAY, NOW)).toEqual(tasks);
        expect(excludePlacedTasks(tasks, [placed({startTime: '09:00', endTime: '10:00', taskId: 'a'})], TODAY, NOW))
            .toEqual(tasks);
    });

    it('ne renvoie pas une tâche en cours', () => {
        const started = placed({startTime: '10:00', endTime: '11:00', taskId: 'a'});
        expect(excludePlacedTasks(tasks, [started], TODAY, NOW)).toEqual([{_id: 'b'}, {_id: 'c'}]);
    });

    it('ne renvoie pas une tâche coupée dont la seconde moitié est à venir', () => {
        const halves = [
            placed({startTime: '09:00', endTime: '10:00', parts: 2, taskId: 'a'}),
            placed({startTime: '14:00', endTime: '15:00', parts: 2, taskId: 'a'}),
        ];
        expect(excludePlacedTasks(tasks, frozenSlots(halves, TODAY, NOW), TODAY, NOW)).toEqual([{_id: 'b'}, {_id: 'c'}]);
    });

    it('compare les identifiants par leur texte', () => {
        const id = {toString: () => 'a'};
        expect(excludePlacedTasks([{_id: id}], [placed({taskId: 'a', locked: true})], TODAY, NOW)).toEqual([]);
    });
});

describe('excludeUpcomingTasks', () => {
    const tasks = [{_id: 'a'}, {_id: 'b'}, {_id: 'c'}];
    // Dimanche 15:47.
    const SUNDAY: Weekday = 'dimanche';
    const SUNDAY_NOW = 15 * 60 + 47;

    it('retire une tâche dont le créneau est encore à venir', () => {
        const upcoming = placed({day: 'dimanche', startTime: '17:00', endTime: '18:00', taskId: 'a'});
        expect(excludeUpcomingTasks(tasks, [upcoming], SUNDAY, SUNDAY_NOW)).toEqual([{_id: 'b'}, {_id: 'c'}]);
    });

    it('retire une tâche en cours', () => {
        const running = placed({day: 'dimanche', startTime: '15:30', endTime: '16:30', taskId: 'a'});
        expect(excludeUpcomingTasks(tasks, [running], SUNDAY, SUNDAY_NOW)).toEqual([{_id: 'b'}, {_id: 'c'}]);
    });

    it('garde une tâche dont le créneau verrouillé est fini sans être fait', () => {
        const missed = placed({day: 'samedi', taskId: 'a', locked: true});
        expect(excludeUpcomingTasks(tasks, [missed], SUNDAY, SUNDAY_NOW)).toEqual(tasks);
    });

    it('garde une tâche dont le créneau est fait', () => {
        const done = placed({day: 'dimanche', startTime: '17:00', endTime: '18:00', taskId: 'a', status: 'done'});
        expect(excludeUpcomingTasks(tasks, [done], SUNDAY, SUNDAY_NOW)).toEqual(tasks);
    });

    it('ne retire aucune tâche sans créneau', () => {
        expect(excludeUpcomingTasks(tasks, [placed({day: 'dimanche', startTime: '17:00', endTime: '18:00'})], SUNDAY, SUNDAY_NOW))
            .toEqual(tasks);
    });
});

describe('excludeTasksIn', () => {
    const tasks = [{_id: 'a'}, {_id: 'b'}];

    it('retire une tâche qui a un créneau non fait dans la semaine donnée', () => {
        expect(excludeTasksIn(tasks, [placed({taskId: 'a'})])).toEqual([{_id: 'b'}]);
    });

    it('garde une tâche dont le créneau est fait, ou sans créneau', () => {
        expect(excludeTasksIn(tasks, [placed({taskId: 'a', status: 'done'}), placed()])).toEqual(tasks);
    });
});

describe('withoutResentTasks', () => {
    it('retire l’ancien créneau d’une tâche manquée qu’on replanifie', () => {
        const missed = placed({day: 'lundi', taskId: 'a', activity: 'Impôts'});
        const done = placed({day: 'mardi', status: 'done'});
        expect(withoutResentTasks([missed, done], [{_id: 'a'}])).toEqual([done]);
    });

    it('garde le créneau d’une tâche qu’on ne renvoie pas', () => {
        const locked = placed({taskId: 'b', locked: true});
        expect(withoutResentTasks([locked], [{_id: 'a'}])).toEqual([locked]);
    });
});

describe('busySlotsOf', () => {
    it('garde les créneaux figés des jours restants, avec leurs horaires', () => {
        const frozen = [placed({day: 'lundi', status: 'done'}), placed({day: 'vendredi', locked: true, activity: 'Course'})];
        expect(busySlotsOf(frozen, ['jeudi', 'vendredi']))
            .toEqual([{day: 'vendredi', startTime: '15:00', endTime: '16:00', activity: 'Course'}]);
    });

    it('écarte un créneau aux horaires illisibles', () => {
        expect(busySlotsOf([placed({startTime: '9:00'})], ['jeudi'])).toEqual([]);
    });
});

describe('compareSlots', () => {
    it('trie par jour de la semaine puis par heure', () => {
        const slots = [
            {day: 'vendredi', startTime: '09:00'},
            {day: 'jeudi', startTime: '14:00'},
            {day: 'jeudi', startTime: '09:30'},
        ];
        expect([...slots].sort(compareSlots)).toEqual([slots[2], slots[1], slots[0]]);
    });
});
