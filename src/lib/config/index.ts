import rawIdea from "../../../idea.config";
import { IdeaConfigSchema, type IdeaConfig } from "./schema";

export * from "./schema";

let cached: IdeaConfig | null = null;

/**
 * The validated idea config. Parsed once per process; a malformed config throws here
 * rather than rendering as `undefined` three layers down.
 *
 * `enabledTools` is *not* checked against the tool registry here — that would make the
 * config import the registry, and the registry imports the config. `assertToolsExist`
 * in src/lib/tools/index.ts closes that loop at startup instead.
 */
export function config(): IdeaConfig {
  if (cached) return cached;
  const parsed = IdeaConfigSchema.safeParse(rawIdea);
  if (!parsed.success) {
    throw new Error(
      `idea.config.ts is invalid:\n${JSON.stringify(parsed.error.format(), null, 2)}`,
    );
  }
  cached = parsed.data;
  return cached;
}

/** Test seam: swap the config for one case, then reset with `setConfig(null)`. */
export function setConfig(next: IdeaConfig | null) {
  cached = next;
}
