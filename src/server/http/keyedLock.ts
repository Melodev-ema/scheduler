export function createKeyedLock() {
    const held = new Set<string>();

    return {
        tryAcquire(key: string): (() => void) | null {
            if (held.has(key)) {
                return null;
            }
            held.add(key);
            let released = false;
            return () => {
                if (!released) {
                    released = true;
                    held.delete(key);
                }
            };
        },
    };
}
