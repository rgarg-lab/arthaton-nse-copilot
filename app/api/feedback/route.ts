import { z } from "zod";
import { currentUserOrDemo, persistableUserId } from "@/auth";
import { db, memoryItems } from "@/db";
import { embed } from "@/lib/llm/embed";
import { parseBody } from "@/lib/api";
import { isUuid } from "@/schemas";
import { demoSeed } from "@/data/demo-seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  learnerId: z.string().min(1),
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
});

/**
 * POST — feedback on an item ("too hard", "not interested", "done").
 *
 * Originally this fed the replan rules and retrained the recommender. That pipeline is
 * gone; the signal is now stored as a memory item, which means the agent can retrieve it
 * on a later turn — the same "learn from a correction" behaviour, through the generic
 * memory tool rather than a bespoke ML path. The plan returned is the seeded one.
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, Body);
  if (!parsed.ok) return parsed.response;
  const user = await currentUserOrDemo();

  try {
    const handle = await db();
    const content = `Feedback: ${parsed.data.type} on ${JSON.stringify(parsed.data.payload).slice(0, 200)}`;
    await handle.insert(memoryItems).values({
      sessionId: isUuid(parsed.data.learnerId) ? parsed.data.learnerId : null,
      userId: ((id) => (id && isUuid(id) ? id : null))(persistableUserId(user?.id)),
      type: "correction",
      content,
      source: "feedback",
      metadata: parsed.data.payload,
      embedding: await embed(content),
    });
  } catch (err) {
    // Losing a feedback row must not break the interaction.
    console.warn("feedback: not persisted", err);
  }

  return Response.json({ version: 1, path: demoSeed().path, diff: null });
}
