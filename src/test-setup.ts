/**
 * Test setup — runs before every test file via `vitest.config.ts`.
 *
 * Wires `@testing-library/jest-dom`'s custom matchers (`toBeInTheDocument`,
 * `toHaveTextContent`, etc.) into Vitest's `expect`. After this import, any
 * `expect(...).toBeInTheDocument()` call type-checks and runs.
 *
 * Also runs `cleanup()` after every test — React Testing Library doesn't
 * auto-cleanup under Vitest the way it does under Jest, so a forgotten
 * unmount between tests can leak DOM between cases. The `afterEach` hook
 * here is the supported pattern.
 */

import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
