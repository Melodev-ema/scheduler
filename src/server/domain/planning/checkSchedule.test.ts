import {describe, expect, it} from 'vitest';
import {BusySlot, checkSchedule} from '@/server/domain/planning/checkSchedule';
import {DayWindow} from '@/server/domain/planning/buildDayWindows';
import {ScheduleSlot} from '@/server/domain/planning/parseSchedule';
import {SessionRequest} from '@/server/domain/planning/sessions';
import {DEFAULT_LUNCH_BREAK} from '@/server/domain/planning/lunchBreak';

const WINDOWS: DayWindow[] = [
    {jour: 'lundi', heure_debut: '09:00', heure_fin: '18:00'},
    {jour: 'mardi', heure_debut: '09:00', heure_fin: '18:00'},
];

function request(overrides: Partial<SessionRequest> = {}): SessionRequest {
    return {
        name: 'Sport',
        description: '',
        priority: 2,
        sessions: 1,
        sessionMinutes: 60,
        minSessionMinutes: 30,
        days: ['lundi', 'mardi'],
        startTime: '',
        endTime: '',
        ...overrides,
    };
}

function slot(overrides: Partial<ScheduleSlot> = {}): ScheduleSlot {
    return {
        day: 'lundi',
        startTime: '09:00',
        endTime: '10:00',
        activity: 'Sport',
        description: '',
        ...overrides,
    };
}

function only(pattern: RegExp) {
    return [expect.stringMatching(pattern)];
}

describe('checkSchedule', () => {
    it('ne signale rien sur un planning conforme', () => {
        expect(checkSchedule([slot()], [request()], WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual([]);
    });

    it('accepte une priorité 2 raccourcie jusqu\'à son plancher', () => {
        expect(checkSchedule([slot({endTime: '09:30'})], [request()], WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual([]);
    });

    it('accepte qu\'une priorité 3 ait perdu des séances', () => {
        expect(checkSchedule([slot()], [request({priority: 3, sessions: 2, minSessionMinutes: 60})], WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual([]);
    });

    it('signale une fin avant le début', () => {
        expect(checkSchedule([slot({startTime: '10:00', endTime: '09:00'})], [request()], WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual(only(/fin avant le début/));
    });

    it('signale un jour hors de la semaine planifiée', () => {
        const requests = [request({days: ['lundi', 'mardi', 'mercredi']})];
        expect(checkSchedule([slot({day: 'mercredi'})], requests, WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual(only(/hors de la semaine/));
    });

    it('signale un créneau hors des horaires du jour', () => {
        expect(checkSchedule([slot({startTime: '08:00', endTime: '09:00'})], [request()], WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual(only(/hors des horaires/));
    });

    it('signale une activité inconnue', () => {
        expect(checkSchedule([slot({activity: 'Yoga'})], [request()], WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual(only(/activité inconnue/));
    });

    it('signale un jour non autorisé pour l\'activité', () => {
        expect(checkSchedule([slot()], [request({days: ['mardi']})], WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual(only(/jour non autorisé/));
    });

    it('signale une séance sous son plancher', () => {
        expect(checkSchedule([slot({endTime: '09:20'})], [request()], WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual(only(/trop courte/));
    });

    it('signale un bloc fixe déplacé', () => {
        const fixed = request({startTime: '09:00', endTime: '10:00', minSessionMinutes: 60});
        expect(checkSchedule([slot({startTime: '10:00', endTime: '11:00'})], [fixed], WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual(only(/bloc fixe/));
    });

    it('signale deux créneaux qui se chevauchent', () => {
        const requests = [request({name: 'A'}), request({name: 'B'})];
        const slots = [
            slot({activity: 'A'}),
            slot({activity: 'B', startTime: '09:30', endTime: '10:30'}),
        ];
        expect(checkSchedule(slots, requests, WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual(only(/se chevauchent/));
    });

    it('détecte un chevauchement avec un créneau non voisin', () => {
        const requests = [
            request({name: 'A', sessionMinutes: 180, minSessionMinutes: 180}),
            request({name: 'B'}),
            request({name: 'C'}),
        ];
        const slots = [
            slot({activity: 'A', startTime: '09:00', endTime: '12:00'}),
            slot({activity: 'B', startTime: '10:00', endTime: '10:30'}),
            slot({activity: 'C', startTime: '11:00', endTime: '11:30'}),
        ];
        expect(checkSchedule(slots, requests, WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual([
            expect.stringMatching(/A et B se chevauchent/),
            expect.stringMatching(/A et C se chevauchent/),
        ]);
    });

    it('signale deux séances de la même activité le même jour', () => {
        const slots = [slot(), slot({startTime: '11:00', endTime: '12:00'})];
        expect(checkSchedule(slots, [request({sessions: 2})], WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual(only(/plusieurs séances/));
    });

    it('signale plus de séances que demandé', () => {
        const slots = [slot(), slot({day: 'mardi'})];
        expect(checkSchedule(slots, [request({sessions: 1})], WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual(only(/2 séances pour 1 demandée/));
    });

    it('signale un créneau libre pendant la pause de midi', () => {
        expect(checkSchedule([slot({startTime: '12:00', endTime: '13:00'})], [request()], WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual(only(/pause de midi/));
    });

    it('tolère un bloc fixe posé pendant la pause', () => {
        const fixed = request({startTime: '12:00', endTime: '13:00', minSessionMinutes: 60});
        expect(checkSchedule([slot({startTime: '12:00', endTime: '13:00'})], [fixed], WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual([]);
    });

    it('cite les heures de la pause réglée', () => {
        expect(checkSchedule([slot({startTime: '13:00', endTime: '13:30'})], [request()], WINDOWS, {start: '13:00', end: '14:00'}))
            .toEqual(only(/pause de midi \(13:00–14:00\)/));
    });

    it('ne signale rien pendant midi quand la pause est désactivée', () => {
        expect(checkSchedule([slot({startTime: '12:00', endTime: '13:00'})], [request()], WINDOWS, null)).toEqual([]);
    });

    it('sans pause, deux créneaux de la même activité le même jour sont deux séances', () => {
        const long = request({sessionMinutes: 180, minSessionMinutes: 180});
        const slots = [slot({startTime: '11:00', endTime: '12:30'}), slot({startTime: '14:00', endTime: '15:30'})];
        expect(checkSchedule(slots, [long], WINDOWS, null)).toEqual(only(/plusieurs séances/));
    });

    describe('séance coupée par la pause', () => {
        const long = request({sessionMinutes: 180, minSessionMinutes: 180});

        it('accepte deux parties de part et d’autre de la pause, comptées pour une séance', () => {
            const slots = [slot({startTime: '11:00', endTime: '12:30'}), slot({startTime: '14:00', endTime: '15:30'})];
            expect(checkSchedule(slots, [long], WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual([]);
        });

        it('juge la durée sur le total des deux parties', () => {
            const slots = [slot({startTime: '11:30', endTime: '12:30'}), slot({startTime: '14:00', endTime: '15:00'})];
            expect(checkSchedule(slots, [long], WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual(only(/trop courte/));
        });

        it('signale une partie de moins de 30 min', () => {
            const slots = [slot({startTime: '12:10', endTime: '12:30'}), slot({startTime: '14:00', endTime: '16:40'})];
            expect(checkSchedule(slots, [long], WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual(only(/partie trop courte/));
        });

        it('signale plus de deux parties', () => {
            const slots = [
                slot({startTime: '10:00', endTime: '11:00'}),
                slot({startTime: '11:30', endTime: '12:30'}),
                slot({startTime: '14:00', endTime: '15:00'}),
            ];
            expect(checkSchedule(slots, [long], WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual(only(/plus de deux parties/));
        });

        it('signale deux parties qui ne sont pas de part et d’autre de la pause', () => {
            const slots = [slot({startTime: '09:00', endTime: '10:30'}), slot({startTime: '15:00', endTime: '16:30'})];
            expect(checkSchedule(slots, [long], WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual(only(/plusieurs séances/));
        });
    });

    it('signale une séance de priorité 1 manquante', () => {
        const essential = request({priority: 1, sessions: 2, minSessionMinutes: 60});
        expect(checkSchedule([slot()], [essential], WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual(only(/priorité 1/));
    });
});

describe('checkSchedule, références de tâche', () => {
    it('accepte un créneau dont la référence est connue', () => {
        expect(checkSchedule([slot({ref: 't1'})], [request({ref: 't1'})], WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual([]);
    });

    it('signale une référence inconnue', () => {
        expect(checkSchedule([slot({ref: 't9'})], [request({ref: 't1'})], WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual(only(/référence inconnue \(t9\)/));
    });

    it('ne confond pas une activité et une tâche de même nom', () => {
        const requests = [
            request({name: 'Sport'}),
            request({name: 'Sport', ref: 't1', days: ['mardi']}),
        ];
        const slots = [
            slot({activity: 'Sport', day: 'lundi'}),
            slot({activity: 'Sport', day: 'mardi', ref: 't1'}),
        ];
        expect(checkSchedule(slots, requests, WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual([]);
    });

    it('ne confond pas deux tâches de même nom', () => {
        const requests = [
            request({name: 'Appeler', ref: 't1'}),
            request({name: 'Appeler', ref: 't2', days: ['mardi']}),
        ];
        const slots = [
            slot({activity: 'Appeler', day: 'lundi', ref: 't1'}),
            slot({activity: 'Appeler', day: 'mardi', ref: 't2'}),
        ];
        expect(checkSchedule(slots, requests, WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual([]);
    });

    it('accepte deux tâches de même titre le même jour', () => {
        const requests = [request({name: 'Appeler', ref: 't1'}), request({name: 'Appeler', ref: 't2'})];
        const slots = [
            slot({activity: 'Appeler', startTime: '09:00', endTime: '10:00', ref: 't1'}),
            slot({activity: 'Appeler', startTime: '15:00', endTime: '16:00', ref: 't2'}),
        ];
        expect(checkSchedule(slots, requests, WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual([]);
    });

    it('accepte une activité et une tâche de même nom le même jour', () => {
        const requests = [request({name: 'Sport'}), request({name: 'Sport', ref: 't1'})];
        const slots = [
            slot({activity: 'Sport', startTime: '09:00', endTime: '10:00'}),
            slot({activity: 'Sport', startTime: '15:00', endTime: '16:00', ref: 't1'}),
        ];
        expect(checkSchedule(slots, requests, WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual([]);
    });

    it('signale toujours deux séances d\'une même tâche le même jour', () => {
        const slots = [
            slot({activity: 'Appeler', startTime: '09:00', endTime: '10:00', ref: 't1'}),
            slot({activity: 'Appeler', startTime: '15:00', endTime: '16:00', ref: 't1'}),
        ];
        expect(checkSchedule(slots, [request({name: 'Appeler', ref: 't1'})], WINDOWS, DEFAULT_LUNCH_BREAK))
            .toEqual(expect.arrayContaining([expect.stringMatching(/plusieurs séances/)]));
    });
});

describe('checkSchedule, créneaux déjà en place', () => {
    const busy: BusySlot[] = [{day: 'lundi', startTime: '09:30', endTime: '11:00', activity: 'Course'}];

    it('signale un créneau qui chevauche un créneau en place', () => {
        expect(checkSchedule([slot()], [request()], WINDOWS, DEFAULT_LUNCH_BREAK, busy))
            .toEqual(only(/Créneau 1 \(Sport, lundi 09:00–10:00\) : chevauche un créneau déjà en place \(Course, 09:30–11:00\)/));
    });

    it('accepte un créneau qui le touche sans le chevaucher', () => {
        expect(checkSchedule([slot({startTime: '11:00', endTime: '12:00'})], [request()], WINDOWS, DEFAULT_LUNCH_BREAK, busy))
            .toEqual([]);
    });

    it('ignore un créneau en place d’un autre jour', () => {
        expect(checkSchedule([slot({day: 'mardi'})], [request()], WINDOWS, DEFAULT_LUNCH_BREAK, busy)).toEqual([]);
    });

    it('ne change rien quand aucun créneau n’est en place', () => {
        expect(checkSchedule([slot()], [request()], WINDOWS, DEFAULT_LUNCH_BREAK)).toEqual([]);
    });
});
