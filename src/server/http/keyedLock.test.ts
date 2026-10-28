import {describe, expect, it} from 'vitest';
import {createKeyedLock} from './keyedLock';

describe('createKeyedLock', () => {
    it('refuse une seconde prise de la même clé tant que la première n\'est pas rendue', () => {
        const lock = createKeyedLock();

        const release = lock.tryAcquire('2026-10-26');

        expect(release).toBeTypeOf('function');
        expect(lock.tryAcquire('2026-10-26')).toBeNull();
    });

    it('rend la clé une fois libérée', () => {
        const lock = createKeyedLock();

        lock.tryAcquire('2026-10-26')!();

        expect(lock.tryAcquire('2026-10-26')).toBeTypeOf('function');
    });

    it('laisse deux clés différentes se prendre en même temps', () => {
        const lock = createKeyedLock();

        lock.tryAcquire('2026-10-26');

        expect(lock.tryAcquire('2026-11-02')).toBeTypeOf('function');
    });

    it('ignore une seconde libération, qui ne doit pas rendre la clé d\'un autre', () => {
        const lock = createKeyedLock();
        const first = lock.tryAcquire('2026-10-26')!;
        first();
        lock.tryAcquire('2026-10-26');

        first();

        expect(lock.tryAcquire('2026-10-26')).toBeNull();
    });
});
