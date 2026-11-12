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
 * Any endpoint that speaks OpenAI's /chat/completions. Groq is the one wired up by
 * default — it is free-tier friendly and fast, which is what a fallback is for — but the
 * same factory serves Together, Fireworks, OpenRouter or OpenAI itself by changing two
 * env vars.
 *
 * Called over fetch rather than through the OpenAI SDK: the template should not carry a
 * dependency for a slot most ideas never fill, and the request shape here is three keys.
 */

type ChatToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

type ChatChoice = {
  message: { content: string | null; tool_calls?: ChatToolCall[] };
  finish_reason: string;
};

type ChatResponse = {
  choices: ChatChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number };
};

function toChatMessages(messages: Message[], system?: string) {
  const out: Record<string, unknown>[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content || null,
        ...(m.toolCalls && m.toolCalls.length > 0
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
              })),
            }
          : {}),
      });
    } else {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
    }
  }
  return out;
}

export function openAiCompatibleProvider(opts: {
  id: string;
  keyEnv: string;
  baseUrlEnv: string;
  defaultBaseUrl: string;
  handles: (model: string) => boolean;
}): Provider {
  return {
    id: opts.id,
    keyEnv: opts.keyEnv,
    isConfigured: () => Boolean(env(opts.keyEnv)),
    handles: opts.handles,

    async generate(model, req: ProviderRequest): Promise<ProviderResponse> {
      const base = env(opts.baseUrlEnv) ?? opts.defaultBaseUrl;
      let res: Response;
      try {
        res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${env(opts.keyEnv) ?? ""}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: req.maxTokens,
            messages: toChatMessages(req.messages, req.system),
            ...(req.tools && req.tools.length > 0
              ? {
                  tools: req.tools.map((t) => ({
                    type: "function",
                    function: { name: t.name, description: t.description, parameters: t.inputSchema },
                  })),
                }
              : {}),
            ...(req.jsonSchema ? { response_format: { type: "json_object" } } : {}),
          }),
        });
      } catch (err) {
        throw new ProviderError(`${opts.id}: ${(err as Error).message}`, "timeout");
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new ProviderError(
          `${opts.id} ${res.status}: ${body.slice(0, 300)}`,
          classifyStatus(res.status),
          res.status,
        );
      }

      const json = (await res.json()) as ChatResponse;
      const choice = json.choices?.[0];
      if (!choice) throw new ProviderError(`${opts.id}: empty choices`, "unknown");

      const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.function.name,
        input: safeJson(c.function.arguments),
      }));

      return {
        text: choice.message.content ?? "",
        toolCalls,
        stopReason:
          choice.finish_reason === "tool_calls"
            ? "tool_use"
            : choice.finish_reason === "length"
              ? "max_tokens"
              : choice.finish_reason === "stop"
                ? "end"
                : "other",
        tokens: {
          input: json.usage?.prompt_tokens ?? 0,
          output: json.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export const groqProvider = openAiCompatibleProvider({
  id: "groq",
  keyEnv: "GROQ_API_KEY",
  baseUrlEnv: "GROQ_BASE_URL",
  defaultBaseUrl: "https://api.groq.com/openai/v1",
  // Groq serves open-weight models; match on the families rather than a fixed list, so a
  // new model id in LLM_FALLBACKS works without a code change.
  handles: (model) => /^(llama|mixtral|gemma|qwen|deepseek|kimi|moonshot|openai\/)/i.test(model),
});
