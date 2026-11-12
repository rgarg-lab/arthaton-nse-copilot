import {
  classifyStatus,
  ProviderError,
  type Message,
  type Provider,
  type ProviderRequest,
  type ProviderResponse,
  type ToolCall,
} from "../types";
import { env } from "@/lib/env";

/**
 * Google Gemini over the REST API. Same reasoning as the OpenAI-compatible provider:
 * three keys of request shape is not worth a dependency, and the fallback chain only
 * needs the wire format.
 *
 * Gemini's shape differs from the other two in ways worth noting: the system prompt is
 * its own top-level field, the assistant role is called "model", and tool results are
 * `functionResponse` parts rather than a distinct role.
 */

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type GeminiCandidate = {
  content?: { parts?: GeminiPart[] };
  finishReason?: string;
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

function toContents(messages: Message[]) {
  const out: { role: "user" | "model"; parts: GeminiPart[] }[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", parts: [{ text: m.content }] });
      continue;
    }
    if (m.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (m.content.trim()) parts.push({ text: m.content });
      for (const call of m.toolCalls ?? []) {
        parts.push({
          functionCall: { name: call.name, args: (call.input ?? {}) as Record<string, unknown> },
        });
      }
      out.push({ role: "model", parts: parts.length > 0 ? parts : [{ text: "" }] });
      continue;
    }
    // A tool result is a user turn carrying a functionResponse part; consecutive results
    // merge into one turn, as with Anthropic's tool_result blocks.
    const part: GeminiPart = {
      functionResponse: { name: m.name, response: { content: m.content } },
    };
    const last = out[out.length - 1];
    if (last?.role === "user" && last.parts.some((p) => "functionResponse" in p)) {
      last.parts.push(part);
    } else {
      out.push({ role: "user", parts: [part] });
    }
  }
  return out;
}

/**
 * Reduce a JSON Schema to the subset Gemini's `functionDeclarations.parameters` accepts.
 *
 * Gemini takes a narrow slice of OpenAPI 3.0, not JSON Schema, and it rejects the whole
 * request — 400, no partial success — on the first key it does not recognise. zod emits
 * several of those (`$schema`, `additionalProperties`, `const`, `$defs`, format values
 * like `uri`), so passing a generated schema through unfiltered made *every* tool-using
 * call fail against Gemini while the other providers were perfectly happy. The failure
 * surfaced only as a silent fall back to the mock, which is a miserable thing to debug.
 *
 * Whitelisting rather than blacklisting: a new zod version emitting a new keyword should
 * degrade to a slightly looser schema, never to a 400.
 */
const GEMINI_STRING_FORMATS = new Set(["date-time", "enum"]);
const GEMINI_NUMBER_FORMATS = new Set(["float", "double", "int32", "int64"]);

export function toGeminiSchema(node: unknown): Record<string, unknown> | undefined {
  if (!node || typeof node !== "object") return undefined;
  const input = node as Record<string, unknown>;

  // `const` has no equivalent; the single-value enum says the same thing.
  if (input.const !== undefined) {
    return { type: typeof input.const === "number" ? "number" : "string", enum: [String(input.const)] };
  }

  const out: Record<string, unknown> = {};
  const type = Array.isArray(input.type) ? input.type.find((t) => t !== "null") : input.type;
  if (typeof type === "string") out.type = type;
  if (typeof input.description === "string") out.description = input.description;
  if (Array.isArray(input.enum)) out.enum = input.enum.map(String);
  if (typeof input.nullable === "boolean") out.nullable = input.nullable;

  // Only the formats Gemini knows; an unrecognised one is a 400 by itself.
  if (typeof input.format === "string") {
    const allowed = type === "string" ? GEMINI_STRING_FORMATS : GEMINI_NUMBER_FORMATS;
    if (allowed.has(input.format)) out.format = input.format;
  }

  if (type === "object") {
    const props = (input.properties ?? {}) as Record<string, unknown>;
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      const child = toGeminiSchema(value);
      if (child) mapped[key] = child;
    }
    out.properties = mapped;
    const required = (input.required as string[] | undefined)?.filter((k) => k in mapped);
    if (required && required.length > 0) out.required = required;
  }

  if (type === "array") {
    out.items = toGeminiSchema(input.items) ?? { type: "string" };
    if (typeof input.minItems === "number") out.minItems = input.minItems;
    if (typeof input.maxItems === "number") out.maxItems = input.maxItems;
  }

  // A union with no declared type: take the first usable branch rather than send nothing.
  if (!out.type) {
    const branches = (input.anyOf ?? input.oneOf) as unknown[] | undefined;
    const first = branches?.map(toGeminiSchema).find((b) => b?.type);
    if (first) return first;
    out.type = "string";
  }

  return out;
}

export const geminiProvider: Provider = {
  id: "gemini",
  keyEnv: "GEMINI_API_KEY",
  isConfigured: () => Boolean(env("GEMINI_API_KEY")),
  handles: (model) => model.startsWith("gemini-"),

  async generate(model, req: ProviderRequest): Promise<ProviderResponse> {
    const base = env("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta";
    let res: Response;
    try {
      res = await fetch(`${base}/models/${model}:generateContent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": env("GEMINI_API_KEY") ?? "",
        },
        body: JSON.stringify({
          contents: toContents(req.messages),
          ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
          ...(req.tools && req.tools.length > 0
            ? {
                tools: [
                  {
                    functionDeclarations: req.tools.map((t) => ({
                      name: t.name,
                      description: t.description,
                      parameters: toGeminiSchema(t.inputSchema) ?? { type: "object", properties: {} },
                    })),
                  },
                ],
              }
            : {}),
          generationConfig: {
            maxOutputTokens: req.maxTokens,
            ...(req.jsonSchema ? { responseMimeType: "application/json" } : {}),
          },
        }),
      });
    } catch (err) {
      throw new ProviderError(`gemini: ${(err as Error).message}`, "timeout");
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderError(
        `gemini ${res.status}: ${body.slice(0, 300)}`,
        classifyStatus(res.status),
        res.status,
      );
    }

    const json = (await res.json()) as GeminiResponse;
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p): p is { text: string } => "text" in p)
      .map((p) => p.text)
      .join("");
    const toolCalls: ToolCall[] = parts
      .filter((p): p is { functionCall: { name: string; args: Record<string, unknown> } } => "functionCall" in p)
      .map((p, i) => ({ id: `gemini-${i}-${p.functionCall.name}`, name: p.functionCall.name, input: p.functionCall.args }));

    const finish = json.candidates?.[0]?.finishReason;
    return {
      text,
      toolCalls,
      stopReason:
        toolCalls.length > 0
          ? "tool_use"
          : finish === "MAX_TOKENS"
            ? "max_tokens"
            : finish === "STOP"
              ? "end"
              : "other",
      tokens: {
        input: json.usageMetadata?.promptTokenCount ?? 0,
        output: json.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  },
};
