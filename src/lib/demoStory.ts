import { loadEngineData, type EngineData } from "@/lib/engineData";
import { demoSeed } from "@/data/demo-seed";

/**
 * The numbers the landing's motion wall animates through.
 *
 * Originally these were produced by replaying a scripted session through the path engine,
 * so the figures on the landing page were the engine's own output. The engine is gone, so
 * they are read from the demo seed instead — same shape, same component, placeholder values.
 */
export type DemoNumbers = {
  /** Score parts of the first open item on the plan. */
  score: { coverage: number; levelFit: number; preferenceFit: number; quality: number; similarity: number };
  streakDays: number;
  progressPct: number;
  /** An illustrative "too hard" adjustment: what it would add and drop, and why. */
  tooHard: { cause: string; added: { title: string; reason: string }[]; removed: { title: string; reason: string }[] };
  /** The live-profile chips: the goal, hours per week, and the skills the story sets first. */
  chips: { goal: string; hoursPerWeek: number; skills: { id: string; name: string; level: number; source: string }[] };
};

export function demoNumbers(data: EngineData = loadEngineData(), now = new Date()): DemoNumbers {
  void now;
  const seed = demoSeed();
  const dashboard = seed.dashboard;

  const openItem = seed.path.phases.flatMap((p) => p.items).find((i) => i.status !== "done");
  const openCatalog = data.catalog.find((c) => c.id === openItem?.catalogId) ?? data.catalog[0];
  const score = openItem?.evidence.scoreBreakdown;

  // Two items that are plausibly swapped when something proves too hard: an easier item in
  // the same area replaces a harder one.
  const harder = [...data.catalog].sort((a, b) => b.difficulty - a.difficulty)[0];
  const easier = [...data.catalog].sort((a, b) => a.difficulty - b.difficulty)[0];

  const goalTitle = data.goals.find((g) => g.id === "g-applied-ai")?.title ?? data.goals[0].title;
  const statedSkills = Object.entries(seed.profile.skills)
    .filter(([, v]) => v.level > 0)
    .slice(0, 3)
    .map(([id, v]) => ({
      id,
      name: data.skills.find((s) => s.id === id)?.name ?? id,
      level: v.level,
      source: v.source,
    }));

  return {
    score: {
      coverage: score?.coverage ?? 0.62,
      levelFit: score?.levelFit ?? 0.58,
      preferenceFit: score?.preferenceFit ?? 0.61,
      quality: score?.quality ?? openCatalog?.qualityPrior ?? 0.74,
      similarity: score?.similarity ?? 0.66,
    },
    streakDays: dashboard.streak.current,
    progressPct: dashboard.progress.percent,
    tooHard: {
      cause: "Marked too hard, so the plan drops a step and inserts a gentler one first.",
      added: [{ title: easier.title, reason: "Lower difficulty, same area." }],
      removed: [{ title: harder.title, reason: "Too steep for now; it returns later." }],
    },
    chips: {
      goal: goalTitle,
      hoursPerWeek: seed.profile.preferences.hoursPerWeek,
      skills: statedSkills,
    },
  };
}
