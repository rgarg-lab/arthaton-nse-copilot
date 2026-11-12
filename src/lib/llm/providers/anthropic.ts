import Anthropic from "@anthropic-ai/sdk";
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

let cached: Anthropic | null = null;

/** Lazily constructed so builds and tests never need ANTHROPIC_API_KEY. */
function client(): Anthropic {
  cached ??= new Anthropic({ maxRetries: 0 }); // the router owns retries
  return cached;
}

/** Test seam: inject a fake SDK client. */
export function setAnthropicClient(next: Anthropic | null) {
  cached = next;
}

type AnthropicMessage = Anthropic.Messages.MessageParam;

/**
 * Collapse our flat message list into Anthropic's shape. Consecutive `tool` messages
 * belong in a single user turn as `tool_result` blocks, which is the part that is easy
 * to get wrong and shows up as a 400 much later.
 */
function toAnthropic(messages: Message[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const blocks: Anthropic.Messages.ContentBlockParam[] = [];
      if (m.content.trim()) blocks.push({ type: "text", text: m.content });
      for (const call of m.toolCalls ?? []) {
        blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.input ?? {} });
      }
      out.push({ role: "assistant", content: blocks.length > 0 ? blocks : [{ type: "text", text: "" }] });
      continue;
    }
    const block: Anthropic.Messages.ToolResultBlockParam = {
      type: "tool_result",
      tool_use_id: m.toolCallId,
      content: m.content,
    };
    const last = out[out.length - 1];
    if (last?.role === "user" && Array.isArray(last.content)) {
      last.content.push(block);
    } else {
      out.push({ role: "user", content: [block] });
    }
  }
  return out;
}

export const anthropicProvider: Provider = {
  id: "anthropic",
  keyEnv: "ANTHROPIC_API_KEY",
  isConfigured: () => Boolean(env("ANTHROPIC_API_KEY")),
  handles: (model) => model.startsWith("claude-"),

  async generate(model: string, req: ProviderRequest): Promise<ProviderResponse> {
    try {
      const res = await client().messages.create({
        model,
        max_tokens: req.maxTokens,
        // Prompt caching on the system prompt and the tool definitions: both are
        // identical on every turn of a session, and they are the bulk of the input.
        ...(req.system
          ? { system: [{ type: "text" as const, text: req.system, cache_control: { type: "ephemeral" as const } }] }
          : {}),
        ...(req.tools && req.tools.length > 0
          ? {
              tools: req.tools.map((t, i) => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema as Anthropic.Messages.Tool.InputSchema,
                // Only the last definition carries the breakpoint; it caches the whole
                // block above it, and there are only four breakpoints per request.
                ...(i === req.tools!.length - 1
                  ? { cache_control: { type: "ephemeral" as const } }
                  : {}),
              })),
            }
          : {}),
        messages: toAnthropic(req.messages),
      });

      const text = res.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const toolCalls: ToolCall[] = res.content
        .filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, input: b.input }));

      return {
        text,
        toolCalls,
        stopReason:
          res.stop_reason === "tool_use"
            ? "tool_use"
            : res.stop_reason === "max_tokens"
              ? "max_tokens"
              : res.stop_reason === "end_turn"
                ? "end"
                : "other",
        tokens: { input: res.usage.input_tokens, output: res.usage.output_tokens },
      };
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        throw new ProviderError(`anthropic ${err.status}: ${err.message}`, classifyStatus(err.status ?? 0), err.status ?? undefined);
      }
      throw new ProviderError(`anthropic: ${(err as Error).message}`, "unknown");
    }
  },
};
