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

  it("a blank fallback list does not empty the model chain", async () => {
    process.env.LLM_FALLBACKS = "";
    const { fallbackModels } = await import("@/lib/llm/router");
    expect(fallbackModels().length).toBeGreaterThan(0);
    delete process.env.LLM_FALLBACKS;
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
