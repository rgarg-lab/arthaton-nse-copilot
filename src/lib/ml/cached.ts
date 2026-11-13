import { unstable_cache } from "next/cache";
import {
  findNeighbors,
  getMetrics,
  getSignals,
  type MlResult,
} from "@/lib/ml/client";
import type { MetricsPayload, NeighborsPayload, SignalsPayload } from "@/schemas/finance";

/**
 * Cached reads of the ML service, for use by pages.
 *
 * ## Why these exist
 *
 * Every page is `force-dynamic` — correct, because a board headed "today's signals" must
 * not be a build-time snapshot — but the first version paired that with *uncached* fetches,
 * so every navigation blocked on a fresh round trip before a byte of HTML went out. The
 * workspace did it three times. The result was a site that felt slow for no reason: the
 * data behind all of it is a set of committed JSON files that change **once a day**, when
 * `make -C ml refresh` runs.
 *
 * `force-dynamic` and a cached fetch are not in tension. The page is still rendered per
 * request — it can read cookies, the session, the user's watchlist — it just does not
 * re-fetch an artifact that has not changed since the last visitor.
 *
 * ## Why five minutes
 *
 * Far finer than the data's actual cadence, so a refresh is visible almost immediately,
 * while still collapsing a burst of navigation into one round trip. Anything longer would
 * start to feel stale on the day the panel is refreshed; anything shorter stops being a
 * cache during a demo.
 *
 * ## What is deliberately *not* cached
 *
 * `getHealth` — `/preflight` exists to tell you the live state of the service, and a
 * cached answer there would be worse than useless. It is the one place a stale read would
 * actively mislead.
 *
 * ## Failures cache too, briefly
 *
 * An `unavailable` result is cached like any other. That is intentional: without it, a
 * page rendered while the service is down pays the full timeout on every single request.
 * Five minutes is short enough that starting the service shows up quickly, and
 * `revalidateMlArtifacts()` below clears it immediately when something needs to.
 */

export const cachedSignals = unstable_cache(
  async (): Promise<MlResult<SignalsPayload>> => getSignals(),
  ["ml-signals"],
  { revalidate: 300, tags: ["ml-artifacts"] },
);

export const cachedMetrics = unstable_cache(
  async (): Promise<MlResult<MetricsPayload>> => getMetrics(),
  ["ml-metrics"],
  { revalidate: 300, tags: ["ml-artifacts"] },
);

/**
 * Neighbours, keyed by ticker.
 *
 * The key has to include the ticker or every name would serve the first one's analogues —
 * which is precisely the bug the ML service's own cache was written to avoid (the earlier
 * project's `/api/history` cached once and then ignored its own `days` argument forever).
 */
export const cachedNeighbors = unstable_cache(
  async (ticker: string, k: number): Promise<MlResult<NeighborsPayload>> =>
    findNeighbors({ ticker, k }),
  ["ml-neighbors"],
  { revalidate: 300, tags: ["ml-artifacts"] },
);

/**
 * Drop every cached artifact read at once.
 *
 * Call after `make -C ml refresh` if you do not want to wait out the window. Exported
 * rather than used internally so there is one named way to do it, instead of someone
 * reaching for a hard reload and concluding the cache is broken.
 */
export async function revalidateMlArtifacts(): Promise<void> {
  const { revalidateTag } = await import("next/cache");
  // Next 16 takes a cache profile alongside the tag; "max" drops every stored entry for
  // it rather than only the current request's.
  revalidateTag("ml-artifacts", "max");
}
