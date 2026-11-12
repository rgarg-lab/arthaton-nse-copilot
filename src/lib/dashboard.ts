import type { DashboardSummary } from "@/schemas";
import { demoSeed } from "@/data/demo-seed";

/**
 * The dashboard summary.
 *
 * Originally computed by the engine from a profile, a path and an event log. That engine is
 * gone: the shape now comes from the demo seed, and an idea that wants live numbers computes
 * them here from its own tables. The signature keeps the arguments so the call sites, and
 * the intent, are unchanged.
 */
export function computeDashboard(): DashboardSummary {
  return demoSeed().dashboard;
}
