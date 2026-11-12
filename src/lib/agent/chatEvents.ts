import type { Degradation, Path, PathDiff, Profile, ProfileCard, ProfileOp } from "@/schemas";
import type { NovaState } from "@/schemas";
import type { TraceEvent } from "./trace";

/**
 * The event contract between the chat panel and the agent.
 *
 * The restored chat panel was written against a streaming event union, and this keeps that
 * union intact so the component is unchanged. What produces it has changed completely: the
 * events now come out of the agent loop in `src/lib/agent/loop.ts` via `/api/chat`, which
 * means the same panel is now driven by the tool-using agent with its fallback chain, its
 * rules layer and its approvals.
 *
 * `trace` is the one addition — the panel ignores it, and the TracePanel beside it consumes
 * it, so both can read the same stream.
 */
export type UsageTotals = { input: number; output: number };

export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "nova_state"; state: NovaState }
  | { type: "tool_call"; name: string; status: "start" | "done" | "error" }
  | { type: "profile_updated"; profile: Profile; ops: ProfileOp[] }
  | { type: "path_updated"; version: number; path: Path; diff: PathDiff | null }
  | { type: "usage"; usage: UsageTotals; calls: number }
  | { type: "degraded"; degradation: Degradation }
  | { type: "ui_card"; card: ProfileCard }
  /** Added: the raw trace, for the TracePanel. The chat panel ignores unknown types. */
  | { type: "trace"; event: TraceEvent }
  | { type: "done"; text: string };

export type ChatTurnResult = {
  text: string;
  usage: UsageTotals;
  calls: number;
  degradation: Degradation | null;
};

/**
 * Map an agent trace event onto the presence states the orb animates through.
 *
 * The original had a dedicated state machine driven by the model's own signals. The agent
 * loop's trace is a richer signal for the same purpose, so the orb now reflects what the
 * agent is actually doing: thinking while it reasons, listening while a tool runs.
 */
export function novaStateFor(event: TraceEvent): NovaState | null {
  switch (event.type) {
    case "thought":
      return "thinking";
    case "tool_call":
      return "listening";
    case "tool_result":
      return "thinking";
    case "final":
      return "speaking";
    case "approval_needed":
      return "resting";
    case "error":
    case "fallback":
      return "resting";
    default:
      return null;
  }
}
