import {describe, expect, it} from 'vitest';
import {advance, MINUTE_MS, startFocus, startNextPhase, stop} from '@/server/domain/focus/cycle';
import {parseStoredFocus} from '@/components/focus/storedFocus';

const T0 = new Date(2026, 9, 1, 10, 0).getTime();
const FREE = {kind: 'free' as const, subject: ''};

describe('parseStoredFocus', () => {
    it('relit un état valide', () => {
        const state = startFocus(FREE, T0);
        expect(parseStoredFocus(JSON.stringify(state), T0)).toEqual(state);
    });

    it('relit un focus en pause courte, ou en attente entre deux phases', () => {
        const awaiting = advance(startFocus(FREE, T0), T0 + 25 * MINUTE_MS);
        expect(parseStoredFocus(JSON.stringify(awaiting), T0)).toEqual(awaiting);
        const onBreak = startNextPhase(awaiting, T0 + 25 * MINUTE_MS);
        expect(parseStoredFocus(JSON.stringify(onBreak), T0)).toEqual(onBreak);
    });

    it('ignore une valeur absente, vide ou cassée', () => {
        expect(parseStoredFocus(null, T0)).toBeNull();
        expect(parseStoredFocus('', T0)).toBeNull();
        expect(parseStoredFocus('{pas du json', T0)).toBeNull();
    });

    it('ignore un état auquel il manque un champ', () => {
        const partial: Record<string, unknown> = {...startFocus(FREE, T0)};
        delete partial.phaseEndsAt;
        expect(parseStoredFocus(JSON.stringify(partial), T0)).toBeNull();
    });

    it('oublie un focus fini depuis plus de 12 h', () => {
        const finished = stop(startFocus(FREE, T0), T0 + MINUTE_MS);
        expect(parseStoredFocus(JSON.stringify(finished), T0 + 11 * 60 * MINUTE_MS)).not.toBeNull();
        expect(parseStoredFocus(JSON.stringify(finished), T0 + 13 * 60 * MINUTE_MS)).toBeNull();
    });
});
