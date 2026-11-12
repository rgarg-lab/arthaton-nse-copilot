import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ProviderError, type ProviderResponse } from "@/lib/llm/types";

/**
 * The router's job is to be boring under failure: try models in order, give up on a
 * model permanently only when it is permanently broken, retry a schema miss exactly once,
 * and never let the caller see an exception just because a vendor had a bad minute.
 *
 * Every test here runs with no API keys.
 */

process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;

type RouterModule = typeof import("@/lib/llm/router");

function reply(over: Partial<ProviderResponse> = {}): ProviderResponse {
  return {
    text: "ok",
    toolCalls: [],
    stopReason: "end",
    tokens: { input: 10, output: 5 },
    ...over,
  };
}

let router: RouterModule;

beforeEach(async () => {
  vi.resetModules();
  process.env.LLM_CACHE = "off";
  delete process.env.LLM_MODE;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LLM_PRIMARY;
  delete process.env.LLM_FALLBACKS;
});

describe("llmMode", () => {
  it("is mock when nothing is configured", async () => {
    router = await import("@/lib/llm/router");
    expect(router.llmMode()).toBe("mock");
    expect(router.anyProviderConfigured()).toBe(false);
  });

  it("is live once a key exists", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    router = await import("@/lib/llm/router");
    expect(router.llmMode()).toBe("live");
  });

  it("obeys an explicit LLM_MODE over key detection", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.LLM_MODE = "mock";
    router = await import("@/lib/llm/router");
    expect(router.llmMode()).toBe("mock");
  });
});

describe("model chain", () => {
  it("reads the chain from the environment, never hard-coded", async () => {
    process.env.LLM_PRIMARY = "claude-opus-5";
    process.env.LLM_FALLBACKS = "gemini-2.5-flash, llama-3.3-70b-versatile ,";
    router = await import("@/lib/llm/router");
    expect(router.modelChain()).toEqual([
      "claude-opus-5",
      "gemini-2.5-flash",
      "llama-3.3-70b-versatile",
    ]);
  });
});

describe("mock mode", () => {
  it("answers with no keys and reports the mock model", async () => {
    router = await import("@/lib/llm/router");
    const res = await router.generate({ messages: [{ role: "user", content: "hello" }] });
    expect(res.model).toBe("mock");
    expect(res.fromCache).toBe(false);
    expect(res.text.length).toBeGreaterThan(0);
  });

  it("satisfies a zod schema", async () => {
    router = await import("@/lib/llm/router");
    const Schema = z.object({
      verdict: z.enum(["supported", "unsupported"]),
      confidence: z.number().min(0).max(1),
      reason: z.string().min(1),
    });
    const res = await router.generate({
      messages: [{ role: "user", content: "is the sky blue" }],
      schema: Schema,
    });
    expect(Schema.safeParse(res.data).success).toBe(true);
    expect(res.data.confidence).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic for the same conversation", async () => {
    router = await import("@/lib/llm/router");
    const once = await router.generate({ messages: [{ role: "user", content: "same input" }] });
    const twice = await router.generate({ messages: [{ role: "user", content: "same input" }] });
    expect(once.text).toBe(twice.text);
  });

  it("emits a tool call when tools are offered, and finishes once they are used", async () => {
    router = await import("@/lib/llm/router");
    const tools = [
      { name: "search_memory", description: "search", inputSchema: { type: "object", properties: {} } },
      { name: "verify", description: "verify", inputSchema: { type: "object", properties: {} } },
    ];
    const first = await router.generate({
      messages: [{ role: "user", content: "do you know my preference" }],
      tools,
    });
    expect(first.stopReason).toBe("tool_use");
    expect(first.toolCalls.length).toBe(1);

    const done = await router.generate({
      messages: [
        { role: "user", content: "do you know my preference" },
        { role: "assistant", content: "", toolCalls: [{ id: "1", name: "search_memory", input: {} }] },
        { role: "tool", toolCallId: "1", name: "search_memory", content: "no results" },
        { role: "assistant", content: "", toolCalls: [{ id: "2", name: "verify", input: {} }] },
        { role: "tool", toolCallId: "2", name: "verify", content: "supported" },
      ],
      tools,
    });
    expect(done.stopReason).toBe("end");
    expect(done.toolCalls.length).toBe(0);
    expect(done.text).toContain("search_memory");
  });
});

describe("fallback behaviour", () => {
  it("moves past a rate-limited model to the next one", async () => {
    const providers = await import("@/lib/llm/providers/anthropic");
    const gemini = await import("@/lib/llm/providers/gemini");
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.GEMINI_API_KEY = "g-test";
    process.env.LLM_PRIMARY = "claude-sonnet-5";
    process.env.LLM_FALLBACKS = "gemini-2.5-flash";

    vi.spyOn(providers.anthropicProvider, "generate").mockRejectedValue(
      new ProviderError("anthropic 429", "rate_limit", 429),
    );
    const geminiSpy = vi
      .spyOn(gemini.geminiProvider, "generate")
      .mockResolvedValue(reply({ text: "from gemini" }));

    router = await import("@/lib/llm/router");
    router.resetRouter();
    const res = await router.generate({ messages: [{ role: "user", content: "hi" }] });
    expect(res.text).toBe("from gemini");
    expect(res.model).toBe("gemini-2.5-flash");
    expect(geminiSpy).toHaveBeenCalledOnce();
  });

  it("retires a 404 model for the process but keeps a 429 model in rotation", async () => {
    const anthropic = await import("@/lib/llm/providers/anthropic");
    const gemini = await import("@/lib/llm/providers/gemini");
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.GEMINI_API_KEY = "g-test";
    process.env.LLM_PRIMARY = "claude-does-not-exist";
    process.env.LLM_FALLBACKS = "gemini-2.5-flash";

    vi.spyOn(anthropic.anthropicProvider, "generate").mockRejectedValue(
      new ProviderError("anthropic 404", "not_found", 404),
    );
    vi.spyOn(gemini.geminiProvider, "generate").mockResolvedValue(reply());

    router = await import("@/lib/llm/router");
    router.resetRouter();
    await router.generate({ messages: [{ role: "user", content: "hi" }] });
    expect(router.modelChain()).not.toContain("claude-does-not-exist");
  });

  it("prefers the model that last worked", async () => {
    const anthropic = await import("@/lib/llm/providers/anthropic");
    const gemini = await import("@/lib/llm/providers/gemini");
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.GEMINI_API_KEY = "g-test";
    process.env.LLM_PRIMARY = "claude-sonnet-5";
    process.env.LLM_FALLBACKS = "gemini-2.5-flash";

    vi.spyOn(anthropic.anthropicProvider, "generate").mockRejectedValue(
      new ProviderError("anthropic 503", "unavailable", 503),
    );
    vi.spyOn(gemini.geminiProvider, "generate").mockResolvedValue(reply());

    router = await import("@/lib/llm/router");
    router.resetRouter();
    await router.generate({ messages: [{ role: "user", content: "hi" }] });
    expect(router.modelChain()[0]).toBe("gemini-2.5-flash");
  });

  it("falls back to the mock rather than throwing when every model fails", async () => {
    const anthropic = await import("@/lib/llm/providers/anthropic");
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.LLM_PRIMARY = "claude-sonnet-5";
    process.env.LLM_FALLBACKS = "";

    vi.spyOn(anthropic.anthropicProvider, "generate").mockRejectedValue(
      new ProviderError("anthropic 500", "unavailable", 500),
    );

    router = await import("@/lib/llm/router");
    router.resetRouter();
    const res = await router.generate({ messages: [{ role: "user", content: "hi" }] });
    expect(res.model).toBe("mock-fallback");
    expect(res.text.length).toBeGreaterThan(0);
  });
});

describe("structured output", () => {
  const Schema = z.object({ answer: z.string().min(1), score: z.number().int() });

  it("retries once with the validation error and accepts the repair", async () => {
    const anthropic = await import("@/lib/llm/providers/anthropic");
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.LLM_PRIMARY = "claude-sonnet-5";
    process.env.LLM_FALLBACKS = "";

    const spy = vi
      .spyOn(anthropic.anthropicProvider, "generate")
      .mockResolvedValueOnce(reply({ text: `{"answer": 42}` }))
      .mockResolvedValueOnce(reply({ text: `{"answer": "forty two", "score": 42}` }));

    router = await import("@/lib/llm/router");
    router.resetRouter();
    const res = await router.generate({
      messages: [{ role: "user", content: "give me an answer" }],
      schema: Schema,
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(res.data).toEqual({ answer: "forty two", score: 42 });
    // The repair turn must carry the validation error, or the model is guessing twice.
    const secondCall = spy.mock.calls[1][1];
    const lastMessage = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMessage.content).toContain("did not match the required schema");
  });

  it("throws clearly when the repair also fails", async () => {
    const anthropic = await import("@/lib/llm/providers/anthropic");
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.LLM_PRIMARY = "claude-sonnet-5";
    process.env.LLM_FALLBACKS = "";

    vi.spyOn(anthropic.anthropicProvider, "generate").mockResolvedValue(reply({ text: `{"nope": true}` }));

    router = await import("@/lib/llm/router");
    router.resetRouter();
    await expect(
      router.generate({ messages: [{ role: "user", content: "x" }], schema: Schema }),
    ).rejects.toThrow(/does not match the schema after one retry/);
  });

  it("tolerates JSON wrapped in prose and code fences", async () => {
    const anthropic = await import("@/lib/llm/providers/anthropic");
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.LLM_PRIMARY = "claude-sonnet-5";
    process.env.LLM_FALLBACKS = "";

    vi.spyOn(anthropic.anthropicProvider, "generate").mockResolvedValue(
      reply({ text: "Sure!\n```json\n{\"answer\":\"ok\",\"score\":1}\n```\nHope that helps." }),
    );

    router = await import("@/lib/llm/router");
    router.resetRouter();
    const res = await router.generate({
      messages: [{ role: "user", content: "x" }],
      schema: Schema,
    });
    expect(res.data).toEqual({ answer: "ok", score: 1 });
  });
});
