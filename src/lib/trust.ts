import type { TrustNumbers } from "@/lib/trustFormat";
import { demoSeed } from "@/data/demo-seed";

/**
 * The counts the landing page shows.
 *
 * Originally computed from the mined corpus. Now derived from the demo seed, so they are
 * internally consistent (the percentages really are the ratios of the other fields) while
 * being placeholders rather than measurements. Every component that renders one of these
 * also renders its caveat.
 */
export function loadTrustNumbers(): TrustNumbers {
  return demoSeed().trust;
}
