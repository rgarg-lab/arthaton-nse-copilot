import { RiskProfileSchema, type RiskProfile } from "@/schemas/finance";

/**
 * The risk profile's rules, with no I/O.
 *
 * Deliberately separate from `src/lib/watchlist.ts`, which imports `@/auth` and therefore
 * drags next-auth and the database in with it. The clamp below is the single most
 * important invariant in this part of the app, so it has to be testable without standing
 * up half the framework — a rule nobody can unit-test is a rule that will eventually be
 * quietly broken.
 */

export const DEFAULT_RISK_PROFILE: RiskProfile = RiskProfileSchema.parse({});

/**
 * Clamp a user's display threshold so it can only ever hide signals, never reveal them.
 *
 * This is what keeps the risk profile out of the model. §6.5 freezes the abstention
 * threshold precisely so it cannot become a dial for making the coverage-accuracy curve
 * look better; a user-editable minimum that could go *below* it would reopen that dial
 * from the UI. Someone drags a slider to 50%, the board starts showing calls the model
 * declined to make, and nothing anywhere records that the gate moved.
 *
 * So the effective gate is `max(model, user)`. The slider's `min` attribute sets the floor
 * for the UI, and this runs again on save, because a floor in a form control is a
 * suggestion to the browser rather than a constraint on the request.
 */
export function effectiveThreshold(modelThreshold: number, userMinProbability: number): number {
  return Math.max(modelThreshold, userMinProbability);
}
