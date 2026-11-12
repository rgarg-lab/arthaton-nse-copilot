import { z } from "zod";
import { generate, llmMode } from "@/lib/llm/router";
import { jsonError, parseBody } from "@/lib/api";
import { config } from "@/lib/config";
import { demoSeed } from "@/data/demo-seed";
import { loadEngineData } from "@/lib/engineData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  learnerId: z.string().min(1),
  catalogId: z.string().min(1),
});

/**
 * POST /api/explain — the narration behind the "Why this?" button on a plan item.
 *
 * This route was missing: the restored `ExplainPanel` calls it, so the button 404'd and
 * showed "Could not explain this item". The panel's whole point is to put the structural
 * evidence and the model's narration side by side so any drift between them is visible,
 * which only works if something answers.
 *
 * The evidence is read from the plan, never generated — the panel renders it directly. The
 * model is given that evidence and asked only to phrase it, which is the same division of
 * labour the rest of the template uses: code decides, the model words it. In mock mode the
 * narration is deterministic and says so.
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, Body);
  if (!parsed.ok) return parsed.response;

  const seed = demoSeed();
  const data = loadEngineData();
  const item = data.catalog.find((c) => c.id === parsed.data.catalogId);
  if (!item) return jsonError(404, "No such item");

  const onPath = seed.path.phases
    .flatMap((phase) => phase.items.map((entry) => ({ phase, entry })))
    .find(({ entry }) => entry.catalogId === parsed.data.catalogId);

  if (!onPath) {
    return Response.json({
      degraded: { degraded: true, reason: "unavailable", message: "This item is not on the current plan." },
    });
  }

  const evidence = onPath.entry.evidence;
  const covered = evidence.gapSkillsCovered
    .map((gap) => data.skills.find((s) => s.id === gap.skillId)?.name ?? gap.skillId)
    .join(", ");

  try {
    const result = await generate({
      system:
        `You are ${config().assistant.name}. Explain in two or three plain sentences why an item ` +
        "sits where it does on a plan. You are given the structural reasons; your job is to " +
        "phrase them, not to add new ones. Never invent a number, a skill or a benefit that " +
        "is not in the evidence. No bullet points.",
      messages: [
        {
          role: "user",
          content: [
            `Item: ${item.title} (${item.kind}, ${item.durationHours}h, difficulty ${item.difficulty}/5)`,
            `Phase: ${onPath.phase.title} — milestone: ${onPath.phase.milestone}`,
            `Covers: ${covered || "(nothing recorded)"}`,
            `Scores — coverage ${evidence.scoreBreakdown.coverage}, level fit ` +
              `${evidence.scoreBreakdown.levelFit}, preference fit ${evidence.scoreBreakdown.preferenceFit}, ` +
              `quality ${evidence.scoreBreakdown.quality}, total ${evidence.scoreBreakdown.total}`,
          ].join("\n"),
        },
      ],
      // Cached per item: clicking the same "Why this?" twice during a demo is instant.
      cacheKey: `explain:${parsed.data.catalogId}`,
      maxTokens: 400,
    });

    return Response.json({
      narration: result.data,
      model: result.model,
      fromCache: result.fromCache,
      mode: llmMode(),
    });
  } catch (err) {
    console.error("explain failed:", err);
    // The panel has a degraded state for exactly this; the evidence beside it still renders.
    return Response.json({
      degraded: {
        degraded: true,
        reason: "unavailable",
        message: `${config().assistant.name} could not phrase this right now. The evidence beside it is unaffected.`,
      },
    });
  }
}
