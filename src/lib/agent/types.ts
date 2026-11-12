import type { z } from "zod";
import type { Db } from "@/db";
import type { IdeaConfig } from "@/lib/config";
import type { Emit } from "./trace";

/**
 * What a tool is given when it runs. Deliberately small: a tool that needs more than
 * this is usually two tools, or wants something that belongs in the config.
 */
export type ToolContext = {
  sessionId: string;
  /** Null for an anonymous visitor — the demo must work signed out. */
  userId: string | null;
  /** Null only in unit tests that exercise a tool's pure logic. */
  db: Db | null;
  config: IdeaConfig;
  emit: Emit;
  /** Set when the run is in mock mode, so tools can degrade deliberately. */
  mock: boolean;
};

/**
 * One tool. The zod schema is the single definition of its input: it validates what the
 * model sent *and* is converted to the JSON Schema the model is shown, so the two can
 * never drift apart.
 */
export type Tool<I extends z.ZodTypeAny = z.ZodTypeAny, O = unknown> = {
  name: string;
  /** Written for the model. Say when to use it, not how it works. */
  description: string;
  inputSchema: I;
  /**
   * True when running this tool reaches outside the system. Such tools do not act: they
   * queue a pending action and return a reference to it.
   */
  external?: boolean;
  run(input: z.infer<I>, ctx: ToolContext): Promise<O>;
};

export type ToolResult = {
  name: string;
  ok: boolean;
  /** JSON-serialisable; what goes back to the model. */
  output: unknown;
  durationMs: number;
  error?: string;
};
