import type { Profile } from "@/schemas";
import { demoSeed } from "@/data/demo-seed";
import { loadEngineData } from "@/lib/engineData";

/**
 * The compact state the assistant is given before a turn.
 *
 * Context engineering, not a data dump: the agent gets a summary it can act on, never the
 * whole seed. The agent loop adds the tool results on top of this.
 */
export type ChatContext = {
  profileSummary: string;
  goals: string[];
  openItems: { id: string; title: string }[];
};

export function dbChatContext(sessionId: string): ChatContext {
  void sessionId;
  const seed = demoSeed();
  const data = loadEngineData();
  const openItems = seed.path.phases
    .flatMap((p) => p.items)
    .filter((i) => i.status !== "done")
    .slice(0, 5)
    .map((i) => ({ id: i.catalogId, title: data.catalog.find((c) => c.id === i.catalogId)?.title ?? i.catalogId }));

  return {
    profileSummary: profileSummaryFor(seed.profile),
    goals: seed.profile.goals.map((g) =>
      g.type === "role" ? (data.goals.find((t) => t.id === g.templateId)?.title ?? g.templateId) : g.text,
    ),
    openItems,
  };
}

export function profileSummaryFor(profile: Profile): string {
  const known = Object.entries(profile.skills).filter(([, v]) => v.level > 0);
  const parts = [
    `${known.length} skills recorded`,
    `${profile.preferences.hoursPerWeek} h/week`,
    `pace ${profile.preferences.pace}`,
    `budget ${profile.preferences.budget}`,
  ];
  return parts.join(" · ");
}
