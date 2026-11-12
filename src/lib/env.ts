/**
 * Environment reads where an empty value means "not set".
 *
 * `process.env.X ?? default` is a trap with a `.env.local` file: `??` only falls back on
 * null and undefined, and a line like `NEXT_PUBLIC_SITE_URL=` gives an empty *string*,
 * which wins. The consequences are not subtle — a blank site URL threw from `new URL("")`
 * and took the whole layout down, and a blank `LLM_MAX_TOOL_STEPS` became `Number("") === 0`,
 * which silently blocked every tool call and sent each turn down the fallback path.
 *
 * Leaving a key blank is the most natural thing to do with a scaffolded env file, so it
 * has to mean exactly what it looks like: unconfigured.
 */

/** The value, trimmed, or undefined when absent or blank. */
export function env(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** The value, or `fallback` when absent, blank, or not a finite number. */
export function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** True unless the value is explicitly one of the "off" spellings. */
export function envFlag(name: string, fallback: boolean): boolean {
  const raw = env(name)?.toLowerCase();
  if (raw === undefined) return fallback;
  if (["off", "false", "0", "no"].includes(raw)) return false;
  if (["on", "true", "1", "yes"].includes(raw)) return true;
  return fallback;
}
