/**
 * The covered basket, mirrored from `ml/src/copilot/config.py`.
 *
 * Python is the single source of truth: it is what the panel, the model and the artifacts
 * were built from. This list exists so the UI can render a ticker picker and validate a
 * query parameter without a round trip to a service that might be down — a page that
 * cannot even draw its own navigation when the ML service is unreachable is worse than one
 * that draws it and then reports the service is down.
 *
 * The duplication is tested, not trusted: `tests/universe.test.ts` parses
 * `ml/src/copilot/config.py` and asserts the two lists are identical, so a change on the
 * Python side that is not mirrored here fails `npm test` rather than silently showing a
 * ticker the model has never seen.
 */

export const UNIVERSE: readonly string[] = [
  "RELIANCE.NS",
  "HDFCBANK.NS",
  "ICICIBANK.NS",
  "INFY.NS",
  "TCS.NS",
  "LT.NS",
  "ITC.NS",
  "SBIN.NS",
  "AXISBANK.NS",
  "BHARTIARTL.NS",
  "KOTAKBANK.NS",
  "HINDUNILVR.NS",
  "MARUTI.NS",
  "SUNPHARMA.NS",
  "TATAMOTORS.NS",
  "ASIANPAINT.NS",
  "BAJFINANCE.NS",
  "NTPC.NS",
] as const;

export function inUniverse(ticker: string): boolean {
  return UNIVERSE.includes(ticker.toUpperCase());
}
