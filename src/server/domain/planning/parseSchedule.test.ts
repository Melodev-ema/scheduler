import {describe, expect, it} from 'vitest';
import {
    InvalidModelResponseError,
    parseSchedule,
    parseSacrifices,
    parseNote,
    MAX_NOTE_LENGTH,
} from '@/server/domain/planning/parseSchedule';
import fixture from '@/server/domain/planning/__fixtures__/openai-response.json';

function response(slots: unknown[]): string {
    return JSON.stringify({schedule: slots});
}

const VALID_SLOT = {
    day: 'jeudi',
    start_time: '09:30',
    end_time: '10:30',
    activity: 'Sport',
    description: 'Séance de cardio',
};

describe('parseSchedule', () => {
    it('convertit les clés snake_case en camelCase', () => {
        expect(parseSchedule(response([VALID_SLOT]))).toEqual([
            {
                day: 'jeudi',
                startTime: '09:30',
                endTime: '10:30',
                activity: 'Sport',
                description: 'Séance de cardio',
            },
        ]);
    });

    it('accepte un planning vide', () => {
        expect(parseSchedule(response([]))).toEqual([]);
    });

    it('remplace une description absente par une chaîne vide', () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- on retire la clé par déstructuration
        const {description, ...withoutDescription} = VALID_SLOT;
        expect(parseSchedule(response([withoutDescription]))[0].description).toBe('');
    });

    it('analyse la réponse réelle du modèle conservée en fixture', () => {
        const slots = parseSchedule(JSON.stringify(fixture));
        expect(slots).toHaveLength(14);
        expect(new Set(slots.map((s) => s.day))).toEqual(new Set(['jeudi', 'vendredi']));
    });

    it('rejette un JSON malformé', () => {
        expect(() => parseSchedule('{ pas du json')).toThrow(InvalidModelResponseError);
    });

    it('rejette une réponse sans champ schedule', () => {
        expect(() => parseSchedule('{"autre": []}')).toThrow(InvalidModelResponseError);
    });

    it('rejette un champ schedule qui n\'est pas un tableau', () => {
        expect(() => parseSchedule('{"schedule": "rien"}')).toThrow(InvalidModelResponseError);
    });

    it('rejette un jour inconnu', () => {
        expect(() => parseSchedule(response([{...VALID_SLOT, day: 'funday'}])))
            .toThrow(/jour inconnu/i);
    });

    it('rejette une heure mal formée', () => {
        expect(() => parseSchedule(response([{...VALID_SLOT, start_time: '9h30'}])))
            .toThrow(/heure invalide/i);
    });

    it('rejette une heure hors bornes', () => {
        expect(() => parseSchedule(response([{...VALID_SLOT, end_time: '25:00'}])))
            .toThrow(/heure invalide/i);
    });

    it('rejette un nom d\'activité vide', () => {
        expect(() => parseSchedule(response([{...VALID_SLOT, activity: '   '}])))
            .toThrow(/activité/i);
    });

    it('indique le rang du créneau fautif', () => {
        expect(() => parseSchedule(response([VALID_SLOT, {...VALID_SLOT, day: 'funday'}])))
            .toThrow(/créneau 2/i);
    });

    it('lit la référence d\'une tâche', () => {
        const [slot] = parseSchedule(response([{...VALID_SLOT, ref: ' t1 '}]));
        expect(slot.ref).toBe('t1');
    });

    it('ignore une référence absente, nulle, vide ou non textuelle sans lever', () => {
        const slots = parseSchedule(response([
            VALID_SLOT,
            {...VALID_SLOT, ref: null},
            {...VALID_SLOT, ref: ''},
            {...VALID_SLOT, ref: 42},
        ]));
        expect(slots.every((slot) => !('ref' in slot))).toBe(true);
    });
});

describe('parseSacrifices', () => {
    function withSacrifices(sacrifices: unknown): string {
        return JSON.stringify({schedule: [], sacrifices});
    }

    it('lit les sacrifices déclarés par le modèle', () => {
        expect(parseSacrifices(withSacrifices([
            {activity: ' Lecture ', day: 'mercredi', type: 'supprimée', detail: 'plus de place'},
            {activity: 'Anglais', day: 'lundi', type: 'raccourcie', detail: '60 → 40 min'},
        ]))).toEqual([
            {activity: 'Lecture', day: 'mercredi', type: 'supprimée', detail: 'plus de place'},
            {activity: 'Anglais', day: 'lundi', type: 'raccourcie', detail: '60 → 40 min'},
        ]);
    });

    it('accepte un type sans accent ni casse', () => {
        expect(parseSacrifices(withSacrifices([{activity: 'A', type: 'SUPPRIMEE'}]))[0])
            .toEqual({activity: 'A', day: '', type: 'supprimée', detail: ''});
    });

    it('rend une liste vide quand le champ est absent', () => {
        expect(parseSacrifices(JSON.stringify({schedule: []}))).toEqual([]);
    });

    it('rend une liste vide sur un JSON illisible, sans lever', () => {
        expect(parseSacrifices('{ pas du json')).toEqual([]);
    });

    it('ignore les entrées mal formées', () => {
        expect(parseSacrifices(withSacrifices([
            null,
            'texte',
            {day: 'lundi', type: 'supprimée'},
            {activity: 'A', type: 'déplacée'},
            {activity: 'B', type: 'raccourcie'},
        ]))).toEqual([{activity: 'B', day: '', type: 'raccourcie', detail: ''}]);
    });

    it('ne trouve aucun sacrifice dans la fixture, antérieure au champ', () => {
        expect(parseSacrifices(JSON.stringify(fixture))).toEqual([]);
    });
});

describe('parseNote', () => {
    it('lit la note du modèle, sans les espaces autour', () => {
        expect(parseNote(JSON.stringify({schedule: [], note: '  Sport du lundi au jeudi.  '})))
            .toBe('Sport du lundi au jeudi.');
    });

    it('rend une chaîne vide quand le champ est absent ou pas une chaîne', () => {
        expect(parseNote(JSON.stringify({schedule: []}))).toBe('');
        expect(parseNote(JSON.stringify({schedule: [], note: 42}))).toBe('');
    });

    it('rend une chaîne vide sur un JSON illisible, sans lever', () => {
        expect(parseNote('{ pas du json')).toBe('');
    });

    it('tronque une note trop longue', () => {
        const note = parseNote(JSON.stringify({schedule: [], note: 'a'.repeat(MAX_NOTE_LENGTH + 50)}));
        expect(note).toHaveLength(MAX_NOTE_LENGTH);
    });
});
