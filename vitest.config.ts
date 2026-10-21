import {defineConfig} from 'vitest/config';

process.env.TZ = 'Europe/Paris';

export default defineConfig({
    // Vite résout nativement les `paths` de tsconfig.json depuis la v7 ; le plugin
    // vite-tsconfig-paths est retiré, il épinglait par ailleurs typescript ^5.
    resolve: {tsconfigPaths: true},
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
});
