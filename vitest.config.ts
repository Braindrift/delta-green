/**
 * Vitest configuration.
 *
 * - `environment: 'jsdom'` so React Testing Library has a DOM to render into.
 * - `globals: true` so tests can use `describe`/`it`/`expect` without imports,
 *   matching the convention most React testing examples assume.
 * - The same `@` path alias is resolved via the Vite config — Vitest reads
 *   `vite.config.ts` automatically.
 * - `setupFiles` runs `src/test-setup.ts` before every test file, which wires
 *   `@testing-library/jest-dom`'s custom matchers into Vitest's `expect`.
 *
 * The `import.meta.env` shim is needed because `@/lib/supabase` reads
 * `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at module load. Tests
 * that import the real Supabase client will see these mock values; tests
 * that mock `@/lib/supabase` (the common case) never hit this code path.
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
