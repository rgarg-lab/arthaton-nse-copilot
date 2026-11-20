import { defineConfig } from "vitest/config";

/**
 * The video's own test config, so it never picks up the app's.
 *
 * `root: __dirname` matters: without it vitest walks up and finds the app's
 * `vitest.config.mts`, whose `include` is `tests/**` and which boots PGlite.
 */
export default defineConfig({
  root: __dirname,
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
