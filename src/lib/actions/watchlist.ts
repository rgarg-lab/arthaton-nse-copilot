"use server";

import { revalidatePath } from "next/cache";
import { getSignals } from "@/lib/ml/client";
import {
  addToWatchlist,
  currentScope,
  removeFromWatchlist,
  saveRiskProfile,
} from "@/lib/watchlist";

/**
 * The watchlist and risk-profile mutations.
 *
 * Server actions rather than API routes: these are form posts from a server component,
 * they touch only this app's own tables, and routing them through `/api` would add a
 * client-side fetch and a second place for the scoping rule to be got wrong.
 *
 * **None of these can change a prediction.** They write which names a user tracks and how
 * conservative their board is. The model, the calibrator and the abstention threshold are
 * frozen in `ml/artifacts/` and are not reachable from here.
 */

export type ActionState = { error?: string; ok?: boolean };

export async function addTickerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ticker = String(formData.get("ticker") ?? "");
  const result = await addToWatchlist(await currentScope(), ticker);
  if (!result.ok) return { error: result.error };
  revalidatePath("/watchlist");
  return { ok: true };
}

export async function removeTickerAction(formData: FormData): Promise<void> {
  const ticker = String(formData.get("ticker") ?? "");
  await removeFromWatchlist(await currentScope(), ticker);
  revalidatePath("/watchlist");
}

/**
 * Save the risk profile.
 *
 * The model's own frozen threshold is read from the service and passed to
 * `saveRiskProfile`, which clamps the user's value up to it. That clamp is deliberately
 * server-side: the form's `min` attribute is a hint a browser can ignore, and the whole
 * point of the setting is that it can only ever hide signals, never reveal ones the model
 * declined to make.
 *
 * If the service is unreachable there is no frozen threshold to clamp against, so the
 * save is refused rather than written against a guess.
 */
export async function saveRiskProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const signals = await getSignals();
  if (signals.source === "unavailable") {
    return {
      error:
        "The model service is not answering, so the frozen threshold cannot be read and " +
        "your minimum could not be checked against it. Start the service and try again.",
    };
  }

  const result = await saveRiskProfile(
    await currentScope(),
    {
      horizonSessions: Number(formData.get("horizonSessions") ?? 1),
      riskTolerance: String(formData.get("riskTolerance") ?? "balanced"),
      minProbability: Number(formData.get("minProbability") ?? 0.5),
    },
    signals.data.model.threshold,
  );

  if (!result.ok) return { error: result.error };
  revalidatePath("/watchlist");
  return { ok: true };
}
