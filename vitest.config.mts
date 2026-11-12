import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["tests/**/*.test.ts"],
    /**
     * Timeouts are generous because several test files boot their own PGlite instance —
     * Postgres compiled to WASM — and the first import is charged to whichever test
     * reaches it first. A cold, loaded machine blew the old 30s limit and failed a
     * different test each run, which is the worst kind of test suite to own at 2am.
     */
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Capped rather than one-per-core: WASM database instances are memory-hungry and
    // starting a dozen at once is what caused the flakiness, not any single test.
    maxWorkers: 3,
  },
});
