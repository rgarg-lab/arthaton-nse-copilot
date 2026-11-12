import { desc, eq } from "drizzle-orm";
import { agentSessions, db, messages } from "@/db";
import { demoSeed } from "@/data/demo-seed";
import type { Path, Profile } from "@/schemas";

/**
 * What the restored pages read.
 *
 * Two sources, in this order: the live database built in phases 2–9 (agent sessions, their
 * messages, memory, approvals), and the demo seed for everything the original engine used to
 * compute. The fallback is the point — a page must never render empty during a demo, so a
 * cold database shows seeded content rather than a blank state.
 *
 * As an idea grows its own tables, the seeded half of this file is what it replaces.
 */

export type LearnerRow = {
  id: string;
  displayName: string;
  avatarSeed: string;
  userId: string | null;
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
 * The profiles shown on the picker. Agent sessions are the real rows; the seed supplies
 * a pair so the page has something to show on a cold start.
 */
export async function listLearners(userId?: string): Promise<LearnerRow[]> {
  const seeded = demoSeed().learners.map((l) => ({
    ...l,
    userId: userId ?? null,
    createdAt: new Date("2026-11-01T09:00:00Z"),
  }));
  try {
    const handle = await db();
    const rows = await handle
      .select({ id: agentSessions.id, title: agentSessions.title, createdAt: agentSessions.createdAt })
      .from(agentSessions)
      .orderBy(desc(agentSessions.createdAt))
      .limit(10);
    const live = rows.map((row, i) => ({
      id: row.id,
      displayName: row.title ?? `Session ${i + 1}`,
      avatarSeed: row.id.slice(0, 8),
      userId: userId ?? null,
      createdAt: row.createdAt,
    }));
    return live.length > 0 ? live : seeded;
  } catch {
    // No database yet: the picker still works off the seed.
    return seeded;
  }
}

/** One profile, by id. Ownership is not enforced on seeded rows — they belong to nobody. */
export async function getOwnedLearner(userId: string, learnerId: string): Promise<LearnerRow | null> {
  const all = await listLearners(userId);
  return all.find((l) => l.id === learnerId) ?? null;
}

/** The current plan. Seeded until an idea writes its own. */
export async function getLatestPath(learnerId: string): Promise<{ version: number; data: Path; diff: null } | null> {
  void learnerId;
  return { version: 1, data: demoSeed().path, diff: null };
}

export async function getProfile(learnerId: string): Promise<Profile> {
  void learnerId;
  return demoSeed().profile;
}

/**
 * The conversation so far, from the new `messages` table. Empty is correct here: an unused
 * session genuinely has no history, and the chat panel has a first-run state for it.
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
