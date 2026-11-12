import { z } from "zod";
import { jsonError, parseBody } from "@/lib/api";
import { getProfile } from "@/db/queries";
import { ProfileOpSchema } from "@/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ ops: z.array(ProfileOpSchema) });

/**
 * POST — apply profile operations and return the updated profile.
 *
 * The original applied these through the engine's deterministic reducer. The reducer was
 * domain logic and is gone, so the seeded profile is returned unchanged and the operations
 * are acknowledged. An idea that needs a real profile implements the reducer here — the
 * op vocabulary in `src/schemas/profile.ts` is still the contract, which is why the
 * request is validated rather than waved through.
 */
export async function POST(request: Request, ctx: { params: Promise<{ learnerId: string }> }) {
  const parsed = await parseBody(request, Body);
  if (!parsed.ok) return parsed.response;
  const { learnerId } = await ctx.params;
  try {
    return Response.json(await getProfile(learnerId));
  } catch (err) {
    console.error("profile: update failed", err);
    return jsonError(503, "Could not save that");
  }
}

export async function GET(_request: Request, ctx: { params: Promise<{ learnerId: string }> }) {
  const { learnerId } = await ctx.params;
  return Response.json(await getProfile(learnerId));
}
