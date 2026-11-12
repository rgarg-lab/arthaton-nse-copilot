import { z } from "zod";
import { pendingActions } from "@/db";
import type { Tool, ToolContext } from "@/lib/agent/types";

/**
 * Everything that reaches outside the system.
 *
 * None of these tools act. Each one writes a `pending_actions` row with a human-readable
 * preview and returns its id; the action happens only when a person approves it in the
 * tray. The agent is told this in its system prompt, so "I've created the task" is never
 * a thing it can truthfully say before approval — it says "ready for your approval".
 *
 * This is a hard architectural guarantee rather than a prompt instruction: the tools have
 * no connector access at all, so a jailbroken or confused model still cannot send
 * anything. `src/lib/rules` enforces the same thing a second time, and the approval route
 * is the only code path that touches a connector.
 */

async function queue(
  ctx: ToolContext,
  args: { kind: string; connector: string; preview: string; payload: Record<string, unknown> },
) {
  if (!ctx.db) {
    return { queued: false, reason: "no database in this context", ...args };
  }
  const [row] = await ctx.db
    .insert(pendingActions)
    .values({
      sessionId: ctx.sessionId,
      connector: args.connector,
      kind: args.kind,
      preview: args.preview,
      payload: args.payload,
      status: "pending",
    })
    .returning({ id: pendingActions.id });

  await ctx.emit({
    type: "approval_needed",
    label: args.kind,
    data: { actionId: row.id, preview: args.preview, connector: args.connector },
  });

  return {
    queued: true,
    actionId: row.id,
    status: "pending_approval",
    connector: args.connector,
    preview: args.preview,
    /** Say this, not "done". */
    tellTheUser: "This is queued and waiting for your approval — nothing has been sent yet.",
  };
}

/** Which connector a kind of action should go to, given what is configured. */
function connectorFor(kind: "task" | "message" | "reminder"): string {
  if (kind === "task") {
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) return "github-issues";
    if (process.env.NOTION_TOKEN) return "notion";
  }
  if (kind === "message") {
    if (process.env.SLACK_WEBHOOK_URL) return "slack-webhook";
    if (process.env.RESEND_API_KEY) return "email";
  }
  return "mock";
}

const CreateTaskInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(5_000).default(""),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("ISO date. Compute it with `calculate`, do not work it out yourself."),
  labels: z.array(z.string().max(40)).max(10).default([]),
});

export const createTaskTool: Tool<typeof CreateTaskInput> = {
  name: "create_task",
  description:
    "Queue a task or ticket for the user to approve. It is NOT created until they approve it, " +
    "so tell them it is waiting rather than saying it is done.",
  inputSchema: CreateTaskInput,
  external: true,

  run: (input, ctx) =>
    queue(ctx, {
      kind: "create_task",
      connector: connectorFor("task"),
      preview:
        `Task: ${input.title}` +
        (input.dueDate ? `\nDue: ${input.dueDate}` : "") +
        (input.labels.length > 0 ? `\nLabels: ${input.labels.join(", ")}` : "") +
        (input.body ? `\n\n${input.body}` : ""),
      payload: { ...input },
    }),
};

const SendMessageInput = z.object({
  to: z.string().min(1).max(200).describe("Recipient: an email address, a channel, or a name."),
  subject: z.string().max(200).default(""),
  body: z.string().min(1).max(10_000),
});

export const sendMessageTool: Tool<typeof SendMessageInput> = {
  name: "send_message",
  description:
    "Queue a message (email or chat) for the user to approve and send. Nothing is sent until " +
    "they approve it. Write the message as you would want it received — they will see it exactly.",
  inputSchema: SendMessageInput,
  external: true,

  run: (input, ctx) =>
    queue(ctx, {
      kind: "send_message",
      connector: connectorFor("message"),
      preview:
        `To: ${input.to}` + (input.subject ? `\nSubject: ${input.subject}` : "") + `\n\n${input.body}`,
      payload: { ...input },
    }),
};

const ScheduleReminderInput = z.object({
  body: z.string().min(1).max(2_000).describe("What to remind them about."),
  /** Deliberately an absolute instant: "tomorrow" is ambiguous, a timestamp is not. */
  deliverAt: z
    .string()
    .describe("ISO 8601 instant, e.g. 2026-11-14T09:00:00Z. Work it out with `calculate` first."),
});

export const scheduleReminderTool: Tool<typeof ScheduleReminderInput> = {
  name: "schedule_reminder",
  description:
    "Queue a reminder to be delivered at a specific time. Compute the timestamp with " +
    "`calculate` rather than guessing it. The user approves it before it is scheduled.",
  inputSchema: ScheduleReminderInput,
  external: true,

  async run(input, ctx) {
    const when = new Date(input.deliverAt);
    if (Number.isNaN(when.getTime())) throw new Error(`deliverAt is not a valid instant: "${input.deliverAt}"`);
    return queue(ctx, {
      kind: "schedule_reminder",
      connector: connectorFor("reminder"),
      preview: `Reminder at ${when.toISOString()}:\n\n${input.body}`,
      payload: { body: input.body, deliverAt: when.toISOString() },
    });
  },
};
