import { z } from "zod";
import type { Tool, ToolSpecLike } from "./registry-types";
import { calculateTool } from "./calculate";
import { cleanInputTool } from "./clean_input";
import { extractStructuredTool } from "./extract_structured";
import { verifyTool } from "./verify";
import { compareWithMemoryTool, saveMemoryTool, searchMemoryTool } from "./memory";
import { fetchUrlTool, ragLookupTool, webSearchTool } from "./retrieval";
import { createTaskTool, scheduleReminderTool, sendMessageTool } from "./actions";
import { findSimilarDaysTool, getModelMetricsTool, getSignalTool } from "./finance";

export type { Tool };

/**
 * Every tool in the registry.
 *
 * The first block is the template's domain-agnostic set — each one a *capability*
 * ("verify a claim", "remember this") rather than a step in anyone's workflow. The second
 * is this project's finance tools, which are thin typed clients over the ML service and
 * compute nothing themselves.
 *
 * Adding one means a new file here plus an entry in this list plus a name in
 * `idea.config.ts`.
 *
 * The template's generic `ml_predict` tool was **removed** rather than left unregistered.
 * It was a placeholder that POSTed an arbitrary feature record to `ML_ENDPOINT` and, with
 * no endpoint set, returned a deterministic fake label and score from the length of its own
 * input. The three finance tools below replace it with typed, purpose-built calls, so
 * keeping it would have left a second path to the model — one that invents a plausible
 * number when it cannot reach the service. That is precisely the pattern §4.1 exists to
 * eliminate.
 */
export const ALL_TOOLS: Tool[] = [
  cleanInputTool,
  extractStructuredTool,
  verifyTool,
  calculateTool,
  searchMemoryTool,
  saveMemoryTool,
  compareWithMemoryTool,
  ragLookupTool,
  webSearchTool,
  fetchUrlTool,
  createTaskTool,
  sendMessageTool,
  scheduleReminderTool,
  // ── finance (this project) ──
  getSignalTool,
  getModelMetricsTool,
  findSimilarDaysTool,
];

const BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]));

export function toolByName(name: string): Tool | undefined {
  return BY_NAME.get(name);
}

export function allToolNames(): string[] {
  return ALL_TOOLS.map((t) => t.name);
}

/**
 * Catch a typo in `idea.config.ts` at startup rather than as a silently missing
 * capability halfway through a demo. Called by the agent route and by a test.
 */
export function assertToolsExist(names: string[]): void {
  const missing = names.filter((n) => !BY_NAME.has(n));
  if (missing.length > 0) {
    throw new Error(
      `idea.config.ts enables unknown tool(s): ${missing.join(", ")}. ` +
        `Available: ${allToolNames().join(", ")}`,
    );
  }
}

/** Only the tools this idea turned on, in registry order. */
export function enabledTools(names: string[]): Tool[] {
  const wanted = new Set(names);
  return ALL_TOOLS.filter((t) => wanted.has(t.name));
}

/**
 * Convert to the provider-neutral tool spec.
 *
 * The JSON Schema is generated from the same zod schema that validates the model's input,
 * so the description the model sees and the contract it is held to cannot drift apart.
 */
export function toToolSpecs(tools: Tool[]): ToolSpecLike[] {
  return tools.map((tool) => {
    const generated = z.toJSONSchema(tool.inputSchema, { io: "input" }) as Record<string, unknown>;
    // `$schema` and `$id` are JSON Schema metadata. No provider needs them and Gemini
    // rejects the whole request over them, so they never leave this function.
    const { $schema: _schema, $id: _id, ...schema } = generated;
    // Providers reject a schema without an object root; zod emits one for z.object, but a
    // tool could legitimately use a union, so normalise.
    const inputSchema =
      schema.type === "object" ? schema : { type: "object", properties: { value: schema }, required: ["value"] };
    return { name: tool.name, description: tool.description, inputSchema };
  });
}
