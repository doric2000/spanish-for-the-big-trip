import { defineConfig } from 'vitest/config';

// Runs against the real development database with the server's local secret key.
// Local only (not in CI); see README "בדיקה מול מסד הפיתוח".
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/integration/**/*.int-spec.ts'],
    // Real network round trips to Supabase.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
