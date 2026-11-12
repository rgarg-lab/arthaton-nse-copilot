import type { z } from "zod";

/**
 * One wire format for every provider. The agent loop and the tools only ever see these
 * types; each provider translates to and from its own shape. That is what makes the
 * fallback chain possible — a request can be retried against a different vendor without
 * anything upstream knowing.
 */

export type ToolSpec = {
  name: string;
  description: string;
  /** JSON Schema, converted from the tool's zod schema by the registry. */
  inputSchema: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type StopReason = "end" | "tool_use" | "max_tokens" | "other";

export type Usage = { input: number; output: number };

export type ProviderResponse = {
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  tokens: Usage;
};

export type GenerateOptions<T extends z.ZodTypeAny | undefined = undefined> = {
  messages: Message[];
  system?: string;
  /** When present, the model is asked for JSON and the result is validated against it. */
  schema?: T;
  tools?: ToolSpec[];
  /**
   * Opt into the response cache under this key. Omit for anything whose answer should
   * not be reused — the cache is keyed by prompt, not by intent.
   */
  cacheKey?: string;
  maxTokens?: number;
  /** Per-session guard; the router records usage against it. */
  sessionId?: string;
};

export type GenerateResult<T = string> = {
  /** The validated object when a schema was given, otherwise the raw text. */
  data: T;
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  model: string;
  latencyMs: number;
  tokens: Usage;
  fromCache: boolean;
};

/**
 * A provider is a named thing that can answer one request with one model. It knows
 * nothing about fallbacks, caching or budgets — the router owns all three.
 */
export type Provider = {
  id: string;
  /** Which env var must be present for this provider to be usable. */
  keyEnv: string;
  isConfigured(): boolean;
  /** True when this provider serves the given model id. */
  handles(model: string): boolean;
  generate(model: string, options: ProviderRequest): Promise<ProviderResponse>;
};

export type ProviderRequest = {
  messages: Message[];
  system?: string;
  tools?: ToolSpec[];
  maxTokens: number;
  /** Set when the caller wants JSON back; providers add their own nudge for it. */
  jsonSchema?: Record<string, unknown>;
};

/** Why a model was abandoned, which decides whether the router ever tries it again. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "rate_limit" | "unavailable" | "timeout" | "not_found" | "auth" | "bad_request" | "unknown",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  /** Transient: move to the next model, but keep this one in the rotation. */
  get retriable(): boolean {
    return this.kind === "rate_limit" || this.kind === "unavailable" || this.kind === "timeout";
  }

  /** Permanent for this process: stop offering the model at all. */
  get fatalForModel(): boolean {
    return this.kind === "not_found" || this.kind === "auth";
  }
}

/**
 * Duck-typed rather than `instanceof`. A bundler, a test runner resetting modules, or a
 * server/client boundary can all leave two copies of this module in one process, and
 * `instanceof` across them silently reports false — which would downgrade a 404 to an
 * unknown error and keep retrying a model that does not exist.
 */
export function isProviderError(err: unknown): err is ProviderError {
  return (
    err instanceof ProviderError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { name?: string }).name === "ProviderError" &&
      typeof (err as { kind?: string }).kind === "string")
  );
}

/** Same classification as the getters, usable on a cross-instance error object. */
export function isFatalForModel(err: ProviderError): boolean {
  return err.kind === "not_found" || err.kind === "auth";
}

export function classifyStatus(status: number): ProviderError["kind"] {
  if (status === 429) return "rate_limit";
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "auth";
  if (status === 400 || status === 422) return "bad_request";
  if (status >= 500) return "unavailable";
  return "unknown";
}
