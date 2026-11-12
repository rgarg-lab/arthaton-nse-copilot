import { afterEach, describe, expect, it } from "vitest";
import { env, envFlag, envInt } from "@/lib/env";

/**
 * A blank line in `.env.local` must mean "not configured".
 *
 * This is the whole point of the helper, and the bugs it prevents were not cosmetic:
 * `process.env.X ?? default` keeps an empty *string* in preference to the default, so a
 * scaffolded env file with `NEXT_PUBLIC_SITE_URL=` threw from `new URL("")` and took the
 * layout down, and `LLM_MAX_TOOL_STEPS=` became `Number("") === 0`, which blocked every
 * tool call and sent each turn silently down the fallback path.
 *
 * Leaving a key blank is the most natural thing to do with a scaffolded file, so the
 * behaviour is pinned here.
 */

const KEYS = ["TEST_ENV_A", "TEST_ENV_B"];

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe("env", () => {
  it("treats absent, empty and whitespace-only as unset", () => {
    expect(env("TEST_ENV_A")).toBeUndefined();
    process.env.TEST_ENV_A = "";
    expect(env("TEST_ENV_A")).toBeUndefined();
    process.env.TEST_ENV_A = "   ";
    expect(env("TEST_ENV_A")).toBeUndefined();
  });

  it("returns a trimmed value when set", () => {
    process.env.TEST_ENV_A = "  sk-ant-example  ";
    expect(env("TEST_ENV_A")).toBe("sk-ant-example");
  });
});

describe("envInt", () => {
  it("falls back for blank and non-numeric values, not just missing ones", () => {
    expect(envInt("TEST_ENV_B", 60)).toBe(60);
    process.env.TEST_ENV_B = "";
    expect(envInt("TEST_ENV_B", 60)).toBe(60);
    process.env.TEST_ENV_B = "not a number";
    expect(envInt("TEST_ENV_B", 60)).toBe(60);
  });

  it("reads a real number", () => {
    process.env.TEST_ENV_B = "12";
    expect(envInt("TEST_ENV_B", 60)).toBe(12);
  });
});

describe("envFlag", () => {
  it("keeps the default for blank values", () => {
    expect(envFlag("TEST_ENV_A", true)).toBe(true);
    process.env.TEST_ENV_A = "";
    expect(envFlag("TEST_ENV_A", true)).toBe(true);
  });

  it("understands the usual spellings", () => {
    for (const off of ["off", "false", "0", "no", "OFF"]) {
      process.env.TEST_ENV_A = off;
      expect(envFlag("TEST_ENV_A", true), off).toBe(false);
    }
    for (const on of ["on", "true", "1", "yes"]) {
      process.env.TEST_ENV_A = on;
      expect(envFlag("TEST_ENV_A", false), on).toBe(true);
    }
  });
});

describe("the consequences it guards", () => {
  it("a blank site URL does not reach new URL()", () => {
    process.env.TEST_ENV_A = "";
    expect(() => new URL(env("TEST_ENV_A") ?? "http://localhost:3000")).not.toThrow();
  });

  it("a blank budget does not become zero", async () => {
    process.env.LLM_MAX_TOOL_STEPS = "";
    const { budgetFromEnv } = await import("@/lib/llm/budget");
    expect(budgetFromEnv().maxToolSteps).toBeGreaterThan(0);
    delete process.env.LLM_MAX_TOOL_STEPS;
  });

  /**
   * **This assertion is inverted from the template's, deliberately.**
   *
   * The template asserted that a blank `LLM_FALLBACKS` still yields a non-empty chain,
   * which follows from `env()`'s doctrine that blank means "unconfigured" and unconfigured
   * means "use the default". That is right for a domain-agnostic starter.
   *
   * This project needs the opposite, and §4.1 is explicit about it: one LLM provider,
   * `LLM_FALLBACKS=` "deliberately empty — Gemini only". Under the old behaviour, setting
   * it empty silently restored a chain ending in Anthropic and Groq models whose keys are
   * deliberately unset, so every live turn attempted two unreachable providers before
   * falling through to the mock.
   *
   * So `fallbackModels()` is now the one reader that distinguishes *absent* from *present
   * and empty*: absent keeps the default chain (a fresh clone of the starter still works),
   * empty means none. The reasoning is in `src/lib/llm/router.ts`, and
   * `tests/honesty.test.ts` covers both branches.
   */
  it("a blank fallback list means no fallbacks, while an absent one keeps the default", async () => {
    const { fallbackModels, DEFAULT_FALLBACKS } = await import("@/lib/llm/router");

    process.env.LLM_FALLBACKS = "";
    expect(fallbackModels(), "an explicit empty value must mean none").toEqual([]);

    delete process.env.LLM_FALLBACKS;
    expect(fallbackModels().length, "an absent value must keep the default chain").toBe(
      DEFAULT_FALLBACKS.split(",").length,
    );
  });

  it("a blank provider key reads as unconfigured", async () => {
    process.env.ANTHROPIC_API_KEY = "";
    const { anthropicProvider } = await import("@/lib/llm/providers/anthropic");
    expect(anthropicProvider.isConfigured()).toBe(false);
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("a blank DATABASE_URL still selects the embedded driver", async () => {
    process.env.DATABASE_URL = "";
    const { driverFor } = await import("@/db");
    expect(driverFor()).toBe("pglite");
    delete process.env.DATABASE_URL;
  });
});
