import { desc, eq } from "drizzle-orm";
import { agentSessions, db, messages } from "@/db";

/**
 * What the pages read from the database.
 *
 * The template's version had a second half: a demo-seed fallback supplying a learner
 * profile and a generated path so a page never rendered empty. Both the learner and the
 * path concepts are retired (§7.1), and the fallback itself is the wrong pattern for this
 * project — `getLatestPath` returned seeded content unconditionally, ignoring its own
 * argument, which is the kind of "always has an answer" behaviour the product is arguing
 * against. Model-backed surfaces here read the ML service and show an explicit
 * `ErrorState` when it is down.
 *
 * What survives is the part that was always real: agent sessions and their messages.
 */

export type SessionRow = {
  id: string;
  title: string;
  createdAt: Date;
};

/** What the chat panel replays on load. `content` is the panel's own message envelope. */
export type ChatMessageRow = {
  id: string;
  role: string;
  content: {
    text?: string;
    toolCalls?: { name: string; status: "start" | "done" | "error" }[];
    degraded?: boolean;
    card?: unknown;
  };
  createdAt: Date;
};

/**
 * Recent agent sessions, newest first.
 *
 * Returns an empty array when there are none, rather than inventing two. An empty list is
 * the truth about a fresh clone, and every caller renders an `EmptyState` for it.
 */
export async function listSessions(limit = 10): Promise<SessionRow[]> {
  try {
    const handle = await db();
    const rows = await handle
      .select({
        id: agentSessions.id,
        title: agentSessions.title,
        createdAt: agentSessions.createdAt,
      })
      .from(agentSessions)
      .orderBy(desc(agentSessions.createdAt))
      .limit(limit);
    return rows.map((row, i) => ({
      id: row.id,
      title: row.title ?? `Session ${i + 1}`,
      createdAt: row.createdAt,
    }));
  } catch {
    // No database yet is survivable; the caller shows an empty state.
    return [];
  }
}

/**
 * The conversation so far. Empty is correct for an unused session, and the chat panel has
 * a first-run state for it.
 */
export async function listChatMessages(sessionId: string): Promise<ChatMessageRow[]> {
  try {
    const handle = await db();
    const rows = await handle
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.createdAt)
      .limit(100);
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: (row.content ?? {}) as ChatMessageRow["content"],
      createdAt: row.createdAt,
    }));
  } catch {
    return [];
  }
}
