import { z } from "zod";
import { currentUserOrDemo } from "@/auth";
import { agentSessions, db } from "@/db";
import { jsonError, parseBody } from "@/lib/api";
import { llmMode } from "@/lib/llm/router";
import { listLearners } from "@/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ displayName: z.string().min(1).max(60) });

/** GET — the profiles the picker shows. */
export async function GET() {
  const user = await currentUserOrDemo();
  return Response.json({ learners: await listLearners(user?.id) });
}

/**
 * POST — start a new session. The original created a "learner"; the new backend's unit is
 * an agent session, so this creates one and returns it in the shape the UI expects.
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, Body);
  if (!parsed.ok) return parsed.response;
  const user = await currentUserOrDemo();
  try {
    const handle = await db();
    const [created] = await handle
      .insert(agentSessions)
      .values({ title: parsed.data.displayName, llmMode: llmMode(), userId: null })
      .returning({ id: agentSessions.id, createdAt: agentSessions.createdAt });
    return Response.json({
      id: created.id,
      displayName: parsed.data.displayName,
      avatarSeed: created.id.slice(0, 8),
      userId: user?.id ?? null,
      createdAt: created.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("learners: create failed", err);
    return jsonError(503, "Could not start a session");
  }
}
