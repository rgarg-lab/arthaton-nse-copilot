import { z } from "zod";
import { jsonError, parseBody } from "@/lib/api";
import { demoSeed } from "@/data/demo-seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ learnerId: z.string().min(1) });

/**
 * POST — produce a plan.
 *
 * The original ran a set-cover path engine over a mined prerequisite graph. That is exactly
 * the domain logic the template must not carry, so this returns the seeded plan. An idea
 * that wants a generated plan calls its agent here and maps the result onto `PathSchema` —
 * the shape the path view renders is unchanged either way.
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, Body);
  if (!parsed.ok) return parsed.response;
  try {
    return Response.json({ version: 1, path: demoSeed().path, diff: null });
  } catch (err) {
    console.error("path generate failed", err);
    return jsonError(503, "Could not build a plan");
  }
}
