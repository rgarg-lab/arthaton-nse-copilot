import { z } from "zod";
import { anthropicProvider } from "./providers/anthropic";
import { geminiProvider } from "./providers/gemini";
import { mockProvider } from "./providers/mock";
import { groqProvider } from "./providers/openai-compatible";
import { cacheKey, modelFamily, readCache, writeCache } from "./cache";
import { chargeCall, recordTokens } from "./budget";
import {
  isFatalForModel,
  isProviderError,
  ProviderError,
  type GenerateOptions,
  type GenerateResult,
  type Message,
  type Provider,
  type ProviderResponse,
} from "./types";
import { env } from "@/lib/env";

export type LlmMode = "mock" | "cached" | "live";

const PROVIDERS: Provider[] = [anthropicProvider, geminiProvider, groqProvider];

/** Models never hard-coded: the chain comes from the environment. */
export const DEFAULT_PRIMARY = "claude-sonnet-5";
export const DEFAULT_FALLBACKS = "claude-haiku-4-5-20251001,gemini-2.5-flash,llama-3.3-70b-versatile";

export function primaryModel(): string {
  return env("LLM_PRIMARY") ?? DEFAULT_PRIMARY;
}

/**
 * The fallback chain, where **an explicitly empty value means "no fallbacks"**.
 *
 * This is the one place `env()` is deliberately not used. `env()` collapses absent and
 * blank into `undefined` — the right call almost everywhere, because a blank line in a
 * scaffolded `.env.local` means "not configured" — but here the two have to differ:
 *
 * - `LLM_FALLBACKS` **absent**  → the template's default chain. A fresh clone of the
 *   starter gets sensible fallbacks without having to know they exist.
 * - `LLM_FALLBACKS=` **present and empty** → no fallbacks at all.
 *
 * This build needs the second (§4.1: "LLM_FALLBACKS= — deliberately empty — Gemini only").
 * Without the distinction, setting it to empty silently restored a chain ending in
 * Anthropic and Groq models whose keys are deliberately unset, so every live turn would
 * have attempted two providers it could never reach before falling through to the mock —
 * slow, and a misrepresentation of what this project actually depends on.
 */
export function fallbackModels(): string[] {
  const raw = process.env.LLM_FALLBACKS;
  const source = raw === undefined ? DEFAULT_FALLBACKS : raw;
  return source
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

function providerFor(model: string): Provider | null {
  return PROVIDERS.find((p) => p.handles(model) && p.isConfigured()) ?? null;
}

export function anyProviderConfigured(): boolean {
  return PROVIDERS.some((p) => p.isConfigured());
}

/**
 * What the LLM layer is actually doing, which the UI shows in the demo banner.
 *
 * `LLM_MODE` wins if set. Otherwise: no keys at all means mock — the template's promise
 * is that it runs with nothing configured, and silently failing every call would break
 * that promise far less visibly than declaring mock mode.
 */
export function llmMode(): LlmMode {
  const raw = env("LLM_MODE")?.toLowerCase();
  if (raw === "mock" || raw === "cached" || raw === "live") return raw;
  return anyProviderConfigured() ? "live" : "mock";
}

/** Models that 404'd or rejected the key; never retried for the life of the process. */
const deadModels = new Set<string>();
/** The last model that answered. Tried first, so a degraded run stays on the fast path. */
let lastGood: string | null = null;

export function resetRouter(): void {
  deadModels.clear();
  lastGood = null;
}

/** The chain to attempt, in order, after removing what is known not to work. */
export function modelChain(): string[] {
  const chain = [primaryModel(), ...fallbackModels()];
  if (lastGood && chain.includes(lastGood)) {
    chain.splice(chain.indexOf(lastGood), 1);
    chain.unshift(lastGood);
  }
  return chain.filter((m) => !deadModels.has(m));
}

function jsonSchemaFor(schema: z.ZodTypeAny): Record<string, unknown> {
  return z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
}

/** Models wrap JSON in prose or fences more often than they should. */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[[{]/);
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error("no JSON found in response");
  }
}

export type GenerateMeta = {
  model: string;
  latencyMs: number;
  fromCache: boolean;
  attempts: { model: string; error: string }[];
};

/**
 * One request, against whichever model answers first.
 *
 * Order of events: cache → each model in the chain → mock as the floor. A transient
 * failure (429/503/timeout) moves to the next model immediately rather than backing off,
 * because on demo day latency is the scarce resource, not quota. A 404 or an auth
 * failure retires the model for the process. The model that worked is remembered and
 * tried first next time.
 *
 * With a schema, the response is validated; on failure the model gets exactly one more
 * attempt with the validation error appended, then the call fails loudly.
 */
export async function generate<S extends z.ZodTypeAny | undefined = undefined>(
  options: GenerateOptions<S>,
): Promise<GenerateResult<S extends z.ZodTypeAny ? z.infer<S> : string>> {
  type Out = S extends z.ZodTypeAny ? z.infer<S> : string;

  const started = Date.now();
  const mode = llmMode();
  const schema = options.schema as z.ZodTypeAny | undefined;
  const jsonSchema = schema ? jsonSchemaFor(schema) : undefined;
  const maxTokens = options.maxTokens ?? 2048;
  const sessionId = options.sessionId;
  const attempts: { model: string; error: string }[] = [];

  const request = {
    messages: options.messages,
    system: options.system,
    tools: options.tools,
    maxTokens,
    jsonSchema,
  };

  const finish = (response: ProviderResponse, model: string, fromCache: boolean): GenerateResult<Out> => {
    if (sessionId) recordTokens(sessionId, response.tokens.input + response.tokens.output);
    let data: unknown = response.text;
    if (schema) {
      const parsed = schema.safeParse(extractJson(response.text));
      if (!parsed.success) throw new SchemaValidationError(parsed.error, response.text, model);
      data = parsed.data;
    }
    return {
      data: data as Out,
      text: response.text,
      toolCalls: response.toolCalls,
      stopReason: response.stopReason,
      model,
      latencyMs: Date.now() - started,
      tokens: response.tokens,
      fromCache,
    };
  };

  // ── cache ────────────────────────────────────────────────────────────────────
  // Keyed by family, so the key is stable across a fallback within one vendor.
  const key = options.cacheKey
    ? cacheKey({
        family: modelFamily(mode === "mock" ? "mock" : primaryModel()),
        cacheKey: options.cacheKey,
        system: options.system,
        schema: jsonSchema,
      })
    : null;

  if (key) {
    const hit = await readCache(key);
    if (hit) return finish(hit, "cache", true);
  }

  if (sessionId) chargeCall(sessionId);

  // ── mock ─────────────────────────────────────────────────────────────────────
  if (mode === "mock") {
    const response = await mockProvider.generate("mock", request);
    if (key) await writeCache(key, "mock", response);
    return finish(response, "mock", false);
  }

  // ── live chain ───────────────────────────────────────────────────────────────
  for (const model of modelChain()) {
    const provider = providerFor(model);
    if (!provider) {
      attempts.push({ model, error: "no configured provider handles this model" });
      continue;
    }
    try {
      let response = await provider.generate(model, request);

      // One repair attempt, with the validation error, before giving up on the model.
      if (schema) {
        const parsed = schema.safeParse(safeExtract(response.text));
        if (!parsed.success) {
          const repair: Message[] = [
            ...options.messages,
            { role: "assistant", content: response.text },
            {
              role: "user",
              content:
                `That did not match the required schema. Fix it and return JSON only.\n\n` +
                `Validation errors:\n${JSON.stringify(z.treeifyError(parsed.error), null, 2)}`,
            },
          ];
          response = await provider.generate(model, { ...request, messages: repair });
        }
      }

      lastGood = model;
      if (key) await writeCache(key, modelFamily(model), response);
      return finish(response, model, false);
    } catch (err) {
      if (err instanceof SchemaValidationError) throw err;
      const pe = isProviderError(err)
        ? err
        : new ProviderError((err as Error).message, "unknown");
      attempts.push({ model, error: pe.message });
      if (isFatalForModel(pe)) deadModels.add(model);
      // Anything else: next model, no backoff — on demo day latency is the scarce thing.
    }
  }

  // ── floor ────────────────────────────────────────────────────────────────────
  // Every model failed. Answering with the mock beats showing a stack trace to a judge;
  // the trace records that it happened so the demo is not dishonest about it.
  console.warn("all models failed, falling back to mock:", attempts);
  const response = await mockProvider.generate("mock", request);
  return { ...finish(response, "mock-fallback", false), latencyMs: Date.now() - started };
}

function safeExtract(text: string): unknown {
  try {
    return extractJson(text);
  } catch {
    return null;
  }
}

export class SchemaValidationError extends Error {
  constructor(
    readonly zodError: z.ZodError,
    readonly raw: string,
    readonly model: string,
  ) {
    super(`model ${model} returned data that does not match the schema after one retry`);
    this.name = "SchemaValidationError";
  }
}

/** Convenience for the common "give me a validated object" call. */
export async function generateObject<S extends z.ZodTypeAny>(
  options: GenerateOptions<S> & { schema: S },
): Promise<GenerateResult<z.infer<S>>> {
  return generate(options) as Promise<GenerateResult<z.infer<S>>>;
}
