import { config } from "@/lib/config";
import { db } from "@/db";
import { jsonError } from "@/lib/api";
import { applySeed, loadSeedFile } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/demo — what the "Load demo" button calls.
 *
 * Loads the seed named by `idea.config.demoSeed` into a fresh session, so the app stops
 * looking empty. Deliberately a new session each time: a demo that has been run twice
 * should not show doubled-up memory.
 */
export async function POST() {
  try {
    const seed = await loadSeedFile(config().demoSeed);
    const handle = await db();
    const result = await applySeed(handle, seed);
    return Response.json(result);
  } catch (err) {
    console.error("demo load failed:", err);
    return jsonError(503, "Could not load the demo seed", { error: (err as Error).message });
  }
}
