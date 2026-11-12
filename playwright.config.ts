import { loadEnvConfig } from "@next/env";
import { defineConfig } from "@playwright/test";

// The spec talks to the database directly, and the test runner is not Next, so .env.local
// has to be loaded explicitly — same as drizzle.config.ts. @next/env leaves variables that
// are already set alone, so CI's values still win.
loadEnvConfig(process.cwd());

/**
 * The browser smoke test (tests/e2e/).
 *
 * Runs in mock mode with no keys and no DATABASE_URL, against the embedded database. That
 * is not a compromise — it is the configuration a fresh clone gets, and the one the demo
 * falls back to if a provider is down mid-presentation. If the journey works here, it
 * works on the worst day.
 *
 * On its own port, deliberately. `reuseExistingServer` is on locally so repeat runs are
 * fast, but it only checks whether *something* answers — so a dev or demo server already
 * on 3000 gets adopted, keys and all, and the `env` below (which is what makes this a
 * no-keys run) never applies. That failed confusingly: the suite reused a server holding a
 * real Gemini key, the model asked a clarifying question instead of queuing an action, and
 * the mock-mode assertion failed as though the app were broken. 3100 is the smoke test's.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  // A cold checkout compiles the routes on first hit; 30s was too tight.
  expect: { timeout: 60_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
  },
  webServer: {
    /**
     * A production build, not `next dev`, for two reasons found the hard way:
     *
     *  - `next dev` compiles each route on first hit, and the workspace route (which boots
     *    the embedded database and migrates it) took over 60s, timing the journey out.
     *  - Reusing a `.next` directory that a `next build` wrote makes `next dev` serve 404
     *    for every route handler. Building here keeps the two from sharing state.
     *
     * It also means the smoke test exercises the artefact that actually gets deployed.
     */
    // Port comes from the PORT env below, not a CLI flag: `npm start -- --port` has to
    // survive npm argument forwarding through cmd.exe on Windows, and `next start` reads
    // PORT directly, so the env is both shorter and portable.
    command: "npm run build && npm start",
    /**
     * A database-backed route, not `/api/health`.
     *
     * The embedded Postgres boots and migrates itself on first connection, and
     * `instrumentation.ts` deliberately does not await that — a server whose database is
     * slow should still serve pages. `/api/health` therefore answers 200 long before the
     * database exists: on a cold `.pglite-test` that is a ~38s window in which this suite
     * would start and the first DB-backed call would die with ECONNRESET. Waiting on a
     * route that needs a query closes the window, and costs nothing when the directory is
     * already warm. Cold starts are the normal case in CI.
     *
     * `/api/outbox` rather than `/api/learners`: the learner routes are retired (§7.1), and
     * waiting on a route that no longer exists is a ten-minute silent timeout with
     * "Timed out waiting from config.webServer" as the only clue. `/api/outbox` selects
     * from the outbox table, so it still closes the migration window.
     */
    url: `${BASE}/api/outbox`,
    reuseExistingServer: !process.env.CI,
    // A cold build (no .next) is 2-3 minutes on its own before the server even starts.
    timeout: 600_000,
    env: {
      ...process.env,
      // No provider keys, and mock mode asserted rather than inferred.
      LLM_MODE: "mock",
      LLM_CACHE: "on",
      // Gemini only (§4.1). Empty means *no* fallbacks — see fallbackModels() in
      // src/lib/llm/router.ts, which is the one reader that distinguishes an absent
      // variable from an explicitly empty one.
      LLM_FALLBACKS: "",
      // A separate data directory so a smoke run never disturbs local demo data.
      PGLITE_DIR: ".pglite-test",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-secret-not-for-production",
      // Blank out every provider key the parent shell may export, so a filled-in
      // .env.local cannot quietly turn this into a live run.
      ANTHROPIC_API_KEY: "",
      GEMINI_API_KEY: "",
      GROQ_API_KEY: "",
      OPENAI_API_KEY: "",
      VOYAGE_API_KEY: "",
      TAVILY_API_KEY: "",
      PORT: String(PORT),
    },
  },
});
