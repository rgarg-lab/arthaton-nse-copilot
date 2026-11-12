import type {
  Branch,
  CatalogItem,
  DashboardSummaryOut,
  Domain,
  GoalTemplate,
  Path,
  Profile,
  Skill,
  SkillEdge,
  SkillLevel,
} from "@/schemas";
import type { TrustNumbers } from "@/lib/trustFormat";
import { config } from "@/lib/config";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE ONLY DATA FILE. Everything the restored UI renders comes from here.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The UI shell is kept as it was — same layout, same components, same charts — and this
 * file supplies plausible placeholder content for it. There is no real dataset behind any
 * of it: no mined corpus, no course catalogue, no learner records. Vocabulary is generic
 * on purpose ("Systems Design", "Practice Lab") so nothing reads as a real product's data.
 *
 * On hackathon day you change two files: `idea.config.ts` for labels and copy, and this one
 * for the shape of the demo content. Everything downstream follows.
 *
 * Every value is derived from a seeded PRNG, so the same build always produces the same
 * dashboard, the same chart heights and the same streak. A demo that reshuffles itself
 * between rehearsal and recording is a demo you cannot script.
 */

// ── determinism ─────────────────────────────────────────────────────────────

/** mulberry32: small, fast, and identical across platforms. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded from the idea's name, so renaming the idea reshuffles the demo coherently. */
const SEED = hashString(config().name || "starter");

// ── vocabulary ──────────────────────────────────────────────────────────────

/**
 * Human labels for the schema's domain keys.
 *
 * The keys are an enum in `src/schemas/skill.ts` and are internal identifiers only; these
 * are what the radar chart and the graph legend actually display. Relabelling here keeps
 * the schema untouched while removing the inherited vocabulary from the screen.
 */
export const DOMAIN_LABELS: Record<Domain, string> = {
  foundations: "Foundations",
  "web-frontend": "Interfaces",
  "web-backend": "Services",
  "data-engineering": "Data Pipelines",
  "data-analysis": "Analysis",
  "machine-learning": "Modelling",
  "ai-engineering": "Applied AI",
  cloud: "Platform",
  devops: "Delivery",
  security: "Safety",
};

/**
 * Neutral names for the two evidence sources the schema enumerates. The enum keys are
 * inherited identifiers; nothing on screen should name a real third party's dataset.
 */
export const SOURCE_LABELS = {
  stackoverflow: "Practitioner panel",
  coursera: "Sequence history",
} as const;

const SKILL_BLUEPRINT: { id: string; name: string; domain: Domain; band: 1 | 2 | 3; prereqs: string[] }[] = [
  { id: "s-basics", name: "Core Concepts", domain: "foundations", band: 1, prereqs: [] },
  { id: "s-tooling", name: "Everyday Tooling", domain: "foundations", band: 1, prereqs: ["s-basics"] },
  { id: "s-structures", name: "Structured Thinking", domain: "foundations", band: 2, prereqs: ["s-basics"] },
  { id: "s-interfaces", name: "Interface Building", domain: "web-frontend", band: 2, prereqs: ["s-tooling"] },
  { id: "s-interaction", name: "Interaction Design", domain: "web-frontend", band: 3, prereqs: ["s-interfaces"] },
  { id: "s-services", name: "Service Design", domain: "web-backend", band: 2, prereqs: ["s-structures"] },
  { id: "s-storage", name: "Data Storage", domain: "web-backend", band: 2, prereqs: ["s-structures"] },
  { id: "s-pipelines", name: "Pipeline Assembly", domain: "data-engineering", band: 3, prereqs: ["s-storage"] },
  { id: "s-analysis", name: "Quantitative Analysis", domain: "data-analysis", band: 2, prereqs: ["s-structures"] },
  { id: "s-modelling", name: "Model Building", domain: "machine-learning", band: 3, prereqs: ["s-analysis"] },
  { id: "s-applied-ai", name: "Applied AI Systems", domain: "ai-engineering", band: 3, prereqs: ["s-modelling", "s-services"] },
  { id: "s-platform", name: "Platform Basics", domain: "cloud", band: 2, prereqs: ["s-tooling"] },
  { id: "s-delivery", name: "Delivery Practice", domain: "devops", band: 3, prereqs: ["s-platform"] },
  { id: "s-safety", name: "Safety and Review", domain: "security", band: 2, prereqs: ["s-basics"] },
];

const GOAL_BLUEPRINT: { id: string; title: string; skills: [string, SkillLevel][] }[] = [
  {
    id: "g-builder",
    title: "Product Builder",
    skills: [["s-basics", 3], ["s-tooling", 2], ["s-interfaces", 3], ["s-interaction", 2], ["s-services", 2]],
  },
  {
    id: "g-analyst",
    title: "Analyst",
    skills: [["s-basics", 2], ["s-structures", 3], ["s-analysis", 3], ["s-storage", 2]],
  },
  {
    id: "g-platform",
    title: "Platform Engineer",
    skills: [["s-tooling", 3], ["s-platform", 3], ["s-delivery", 3], ["s-safety", 2]],
  },
  {
    id: "g-applied-ai",
    title: "Applied AI Engineer",
    skills: [["s-structures", 3], ["s-analysis", 2], ["s-modelling", 3], ["s-applied-ai", 3], ["s-services", 2]],
  },
  {
    id: "g-generalist",
    title: "Generalist",
    skills: [["s-basics", 3], ["s-tooling", 2], ["s-structures", 2], ["s-safety", 1]],
  },
];

const PROVIDERS = ["Open Courseware", "Practice Lab", "Field Guide", "Studio Series", "Workshop Co"];
const ITEM_SHAPES = [
  { prefix: "Foundations of", kind: "course" as const, format: "video" as const, hours: 6 },
  { prefix: "Working with", kind: "course" as const, format: "interactive" as const, hours: 9 },
  { prefix: "Build:", kind: "project" as const, format: "project" as const, hours: 14 },
  { prefix: "Deep Dive:", kind: "course" as const, format: "text" as const, hours: 11 },
  { prefix: "Checkpoint:", kind: "assessment" as const, format: "interactive" as const, hours: 2 },
];

// ── generators ──────────────────────────────────────────────────────────────

function buildSkills(): Skill[] {
  return SKILL_BLUEPRINT.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
    description: `Placeholder description for ${s.name}. Replace in src/data/demo-seed.ts.`,
    levelBand: s.band,
    prereqs: s.prereqs,
  }));
}

function buildGoals(): GoalTemplate[] {
  return GOAL_BLUEPRINT.map((g) => ({
    id: g.id,
    title: g.title,
    description: `Placeholder role description for ${g.title}.`,
    requiredSkills: g.skills.map(([skillId, level]) => ({ skillId, level })),
  }));
}

function buildCatalog(skills: Skill[]): CatalogItem[] {
  const random = rng(SEED + 11);
  const items: CatalogItem[] = [];
  skills.forEach((skill, skillIndex) => {
    // Two or three items per skill, so every node on the graph has something behind it.
    const count = 2 + (skillIndex % 2);
    for (let i = 0; i < count; i += 1) {
      const shape = ITEM_SHAPES[(skillIndex + i) % ITEM_SHAPES.length];
      const provider = PROVIDERS[(skillIndex + i * 2) % PROVIDERS.length];
      const level = (1 + ((skillIndex + i) % 3)) as SkillLevel;
      items.push({
        id: `c-${skill.id.replace(/^s-/, "")}-${i + 1}`,
        kind: shape.kind,
        title: `${shape.prefix} ${skill.name}`,
        provider,
        url: `https://example.invalid/${skill.id}/${i + 1}`,
        description: `Placeholder item covering ${skill.name} at level ${level}.`,
        skillsTaught: [{ skillId: skill.id, level }],
        skillsRequired: skill.prereqs.slice(0, 1).map((p) => ({ skillId: p, level: 1 as SkillLevel })),
        difficulty: (1 + ((skillIndex + i) % 5)) as 1 | 2 | 3 | 4 | 5,
        durationHours: shape.hours + Math.round(random() * 4),
        format: shape.format,
        cost: i === 0 ? "free" : i === 1 ? "freemium" : "paid",
        qualityPrior: Number((0.62 + random() * 0.33).toFixed(2)),
      });
    }
  });
  return items;
}

/** Edges for the graph, each carrying plausible support numbers and a visible caveat. */
function buildEdges(skills: Skill[]): SkillEdge[] {
  const random = rng(SEED + 23);
  const edges: SkillEdge[] = [];

  for (const skill of skills) {
    for (const prereq of skill.prereqs) {
      const support = 40 + Math.floor(random() * 900);
      const reverse = Math.floor(support * (0.04 + random() * 0.12));
      const both = random() > 0.45;
      edges.push({
        from: prereq,
        to: skill.id,
        origin: "authored",
        status: both ? "confirmed-both" : random() > 0.25 ? "confirmed-one-source" : "no-data",
        drivesPath: true,
        sources: {
          stackoverflow: {
            support,
            reverse,
            confidence: Number((support / (support + reverse)).toFixed(3)),
            n: support + reverse,
            caveat: "Placeholder counts from src/data/demo-seed.ts — not a measurement.",
          },
          ...(both
            ? {
                coursera: {
                  support: Math.floor(support * 0.6),
                  reverse: Math.floor(reverse * 0.8),
                  confidence: Number((0.6 + random() * 0.3).toFixed(3)),
                  n: Math.floor((support + reverse) * 0.7),
                  caveat: "Placeholder counts from src/data/demo-seed.ts — not a measurement.",
                },
              }
            : {}),
        },
      });
    }
  }

  // A couple of mined candidates, so the graph shows both origins and the review states.
  edges.push({
    from: "s-analysis",
    to: "s-applied-ai",
    origin: "mined",
    status: "candidate",
    drivesPath: false,
    sources: {
      stackoverflow: {
        support: 128,
        reverse: 31,
        confidence: 0.805,
        n: 159,
        caveat: "Placeholder candidate edge — awaiting review.",
      },
    },
  });
  edges.push({
    from: "s-tooling",
    to: "s-safety",
    origin: "mined",
    status: "promoted",
    drivesPath: true,
    sources: {
      coursera: {
        support: 96,
        reverse: 18,
        confidence: 0.842,
        n: 114,
        caveat: "Placeholder promoted edge — review note is illustrative.",
      },
    },
    resolution: {
      by: "human",
      decision: "promote",
      note: "Placeholder review note.",
      date: "2026-10-01",
    },
  });

  return edges;
}

function buildBranches(skills: Skill[]): Branch[] {
  const random = rng(SEED + 37);
  return skills.slice(0, 8).map((skill) => {
    const successors = skills.filter((s) => s.prereqs.includes(skill.id));
    const pool = successors.length > 0 ? successors : skills.filter((s) => s.id !== skill.id).slice(0, 3);
    const nTotal = 320 + Math.floor(random() * 1800);
    let remaining = 1;
    const next = pool.slice(0, 3).map((s, i, arr) => {
      const share = i === arr.length - 1 ? Math.max(0.08, remaining) : Number((remaining * (0.4 + random() * 0.3)).toFixed(3));
      remaining = Math.max(0.05, remaining - share);
      return {
        to: s.id,
        n: Math.max(5, Math.floor(nTotal * share)),
        shareRaw: Math.min(1, Math.max(0.01, share)),
        shareShrunk: Math.min(1, Math.max(0.01, Number((share * 0.92).toFixed(3)))),
        inCatalog: true,
      };
    });
    return {
      from: skill.id,
      source: "stackoverflow" as const,
      next,
      nTotal,
      nNextObserved: Math.max(1, Math.floor(nTotal * 0.7)),
      minSupportMet: true,
      caveat: "Placeholder transition shares from src/data/demo-seed.ts.",
    };
  });
}

function buildProfile(skills: Skill[]): Profile {
  const random = rng(SEED + 53);
  const levels: Profile["skills"] = {};
  for (const skill of skills) {
    const roll = random();
    // A believable spread: some mastered, some underway, plenty still to do.
    const level = roll > 0.78 ? 3 : roll > 0.55 ? 2 : roll > 0.3 ? 1 : 0;
    levels[skill.id] = { level: level as 0 | 1 | 2 | 3, source: roll > 0.6 ? "stated" : "inferred" };
  }
  return {
    goals: [{ type: "role", templateId: "g-applied-ai" }],
    skills: levels,
    preferences: { hoursPerWeek: 8, formats: ["interactive", "project"], budget: "any", pace: "standard" },
    dislikes: { catalogIds: [], providers: [], formats: [] },
  };
}

function buildPath(catalog: CatalogItem[]): Path {
  const random = rng(SEED + 71);
  const phaseTitles = ["Get the fundamentals in place", "Build something real", "Go deeper"];
  const milestones = [
    "You can explain the core ideas without notes.",
    "You have shipped one working thing end to end.",
    "You can make a considered trade-off and defend it.",
  ];

  const phases = phaseTitles.map((title, phaseIndex) => {
    const slice = catalog.slice(phaseIndex * 4, phaseIndex * 4 + 4);
    return {
      title,
      milestone: milestones[phaseIndex],
      items: slice.map((item, i) => {
        // Front-loaded completion, so progress bars and the streak look lived-in.
        const status =
          phaseIndex === 0 ? (i < 3 ? ("done" as const) : ("in_progress" as const))
          : phaseIndex === 1 ? (i === 0 ? ("done" as const) : i === 1 ? ("in_progress" as const) : ("todo" as const))
          : ("todo" as const);
        return {
          catalogId: item.id,
          status,
          evidence: {
            catalogId: item.id,
            gapSkillsCovered: item.skillsTaught.map((taught) => ({
              skillId: taught.skillId,
              reason: "below-target" as const,
              graphPath: [taught.skillId],
            })),
            scoreBreakdown: {
              coverage: Number((0.4 + random() * 0.5).toFixed(3)),
              levelFit: Number((0.45 + random() * 0.45).toFixed(3)),
              preferenceFit: Number((0.4 + random() * 0.5).toFixed(3)),
              quality: item.qualityPrior,
              similarity: Number((0.35 + random() * 0.5).toFixed(3)),
              transitionPrior: Number((0.3 + random() * 0.6).toFixed(3)),
              total: Number((0.5 + random() * 0.45).toFixed(3)),
            },
            sequencedAfter: [],
            provenance: item.url,
          },
        };
      }),
    };
  });

  return {
    phases,
    meta: {
      generatedAt: new Date("2026-11-01T09:00:00Z").toISOString(),
      engineVersion: "demo-seed",
      trigger: "initial",
    },
  };
}

function buildDashboard(skills: Skill[], path: Path, catalog: CatalogItem[], profile: Profile): DashboardSummaryOut {
  const random = rng(SEED + 97);
  const allItems = path.phases.flatMap((p) => p.items);
  const itemsDone = allItems.filter((i) => i.status === "done").length;
  const itemsTotal = allItems.length;

  const goal = GOAL_BLUEPRINT.find((g) => g.id === "g-applied-ai")!;
  const requiredLevels = goal.skills.reduce((sum, [, level]) => sum + level, 0);
  const attainedLevels = goal.skills.reduce(
    (sum, [skillId, level]) => sum + Math.min(level, profile.skills[skillId]?.level ?? 0),
    0,
  );

  // 70 days of activity, deterministic, with a current streak that reads well on camera.
  const today = new Date("2026-11-09T00:00:00Z");
  const activeSet = new Set<string>();
  for (let back = 0; back < 70; back += 1) {
    const day = new Date(today.getTime() - back * 86_400_000).toISOString().slice(0, 10);
    if (back < 6 || random() > 0.45) activeSet.add(day);
  }
  const activeDays = [...activeSet].sort();

  const weeks: { day: string; active: boolean }[][] = [];
  const months: { label: string; week: number }[] = [];
  const start = new Date(today.getTime() - 69 * 86_400_000);
  // Align to the week so the calendar grid starts on a Sunday, as the component expects.
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  let seenMonth = "";
  for (let w = 0; w < 11; w += 1) {
    const week: { day: string; active: boolean }[] = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(start.getTime() + (w * 7 + d) * 86_400_000);
      const iso = date.toISOString().slice(0, 10);
      week.push({ day: iso, active: activeSet.has(iso) });
      const label = date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
      if (d === 0 && label !== seenMonth) {
        months.push({ label, week: w });
        seenMonth = label;
      }
    }
    weeks.push(week);
  }

  const byDifficulty = (lo: number, hi: number) => {
    const ids = catalog.filter((c) => c.difficulty >= lo && c.difficulty <= hi).map((c) => c.id);
    const inPath = allItems.filter((i) => ids.includes(i.catalogId));
    return { done: inPath.filter((i) => i.status === "done").length, total: inPath.length };
  };

  const nextItem = allItems.find((i) => i.status === "in_progress") ?? allItems.find((i) => i.status === "todo");
  const nextCatalog = catalog.find((c) => c.id === nextItem?.catalogId);
  const nextPhase = path.phases.find((p) => p.items.some((i) => i.catalogId === nextItem?.catalogId));

  const skillStatus: Record<string, "acquired" | "in-progress" | "gap" | "unrelated"> = {};
  const required = new Map(goal.skills);
  for (const skill of skills) {
    const have = profile.skills[skill.id]?.level ?? 0;
    const need = required.get(skill.id);
    skillStatus[skill.id] = need === undefined ? "unrelated" : have >= need ? "acquired" : have > 0 ? "in-progress" : "gap";
  }

  return {
    progress: {
      percent: Math.round((attainedLevels / Math.max(1, requiredLevels)) * 100),
      attainedLevels,
      requiredLevels,
      itemsDone,
      itemsTotal,
    },
    radar: [...new Set(skills.map((s) => s.domain))].map((domain) => {
      const inDomain = skills.filter((s) => s.domain === domain);
      return {
        domain,
        label: DOMAIN_LABELS[domain],
        known: inDomain.reduce((sum, s) => sum + (profile.skills[s.id]?.level ?? 0), 0),
        required: inDomain.reduce((sum, s) => sum + (required.get(s.id) ?? 0), 0),
      };
    }),
    timeline: path.phases.map((phase, i) => {
      const done = phase.items.filter((item) => item.status === "done").length;
      return {
        title: phase.title,
        milestone: phase.milestone,
        itemsDone: done,
        itemsTotal: phase.items.length,
        complete: done === phase.items.length,
        active: i === 1,
      };
    }),
    nextAction: {
      catalogId: nextCatalog?.id ?? null,
      title: nextCatalog?.title ?? null,
      kind: nextCatalog?.kind ?? null,
      hours: nextCatalog?.durationHours ?? null,
      phase: nextPhase?.title ?? null,
      why: nextCatalog
        ? `Placeholder reason: it is the next unfinished item in "${nextPhase?.title ?? "your plan"}".`
        : "Nothing queued — load the demo seed.",
    },
    streak: { current: 6, longest: 14, activeDays },
    difficulty: { easy: byDifficulty(1, 2), medium: byDifficulty(3, 3), hard: byDifficulty(4, 5) },
    activity: { weeks, months, activeDays: activeDays.length },
    achievements: [
      { id: "first-path", name: "First plan", hint: "Generate a plan", earned: true },
      { id: "first-done", name: "Off the mark", hint: "Finish one item", earned: true },
      { id: "streak-7", name: "A week running", hint: "Seven active days in a row", earned: false },
      { id: "streak-30", name: "A month running", hint: "Thirty active days in a row", earned: false },
      { id: "foundations", name: "Grounded", hint: "Clear the foundations", earned: true },
      { id: "explorer", name: "Explorer", hint: "Touch four areas", earned: true },
      { id: "hard-mode", name: "Hard mode", hint: "Finish a level-5 item", earned: false },
      { id: "depth", name: "Depth", hint: "Reach level 3 in anything", earned: true },
      { id: "phase-1", name: "Phase one", hint: "Complete the first phase", earned: false },
      { id: "goal-complete", name: "Arrived", hint: "Meet every requirement", earned: false },
    ],
    gap: goal.skills
      .filter(([skillId, level]) => (profile.skills[skillId]?.level ?? 0) < level)
      .map(([skillId, level]) => ({
        skillId,
        targetLevel: level,
        currentLevel: (profile.skills[skillId]?.level ?? 0) as 0 | 1 | 2 | 3,
        reason: "below-target" as const,
      })),
    skillStatus,
    today: today.toISOString().slice(0, 10),
  };
}

function buildTrust(skills: Skill[], goals: GoalTemplate[], catalog: CatalogItem[], edges: SkillEdge[]): TrustNumbers {
  const authored = edges.filter((e) => e.origin === "authored");
  const observable = authored.filter((e) => Object.keys(e.sources).length > 0).length;
  const confirmedAny = authored.filter((e) => e.status.startsWith("confirmed")).length;
  const confirmedBoth = authored.filter((e) => e.status === "confirmed-both").length;
  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));
  return {
    authoredEdges: authored.length,
    observable,
    observablePct: pct(observable, authored.length),
    confirmedAny,
    confirmedPct: pct(confirmedAny, authored.length),
    confirmedBoth,
    contradicted: authored.filter((e) => e.status === "contradicted-in-review").length,
    resolved: edges.filter((e) => e.resolution).length,
    promoted: edges.filter((e) => e.status === "promoted").length,
    skills: skills.length,
    goalTemplates: goals.length,
    catalogItems: catalog.length,
    providers: new Set(catalog.map((c) => c.provider)).size,
    // Illustrative population figures. Labelled as placeholders everywhere they appear.
    soUsers: 1_284_000,
    courseraLearners: 72_400,
    anchor: { from: "Core Concepts", to: "Structured Thinking" },
  };
}

// ── the seed ────────────────────────────────────────────────────────────────

export type DemoSeed = {
  skills: Skill[];
  goals: GoalTemplate[];
  catalog: CatalogItem[];
  edges: SkillEdge[];
  branches: Branch[];
  profile: Profile;
  path: Path;
  dashboard: DashboardSummaryOut;
  trust: TrustNumbers;
  learners: { id: string; displayName: string; avatarSeed: string }[];
};

let cached: DemoSeed | null = null;

/** Built once per process. Pure, so it is safe in a server component or a script. */
export function demoSeed(): DemoSeed {
  if (cached) return cached;
  const skills = buildSkills();
  const goals = buildGoals();
  const catalog = buildCatalog(skills);
  const edges = buildEdges(skills);
  const branches = buildBranches(skills);
  const profile = buildProfile(skills);
  const path = buildPath(catalog);
  const dashboard = buildDashboard(skills, path, catalog, profile);
  const trust = buildTrust(skills, goals, catalog, edges);

  cached = {
    skills,
    goals,
    catalog,
    edges,
    branches,
    profile,
    path,
    dashboard,
    trust,
    // Neutral placeholder profiles; the UI shows an initial and a name.
    learners: [
      { id: "11111111-1111-4111-8111-111111111111", displayName: "Demo One", avatarSeed: "one" },
      { id: "22222222-2222-4222-8222-222222222222", displayName: "Demo Two", avatarSeed: "two" },
    ],
  };
  return cached;
}

/** Test seam. */
export function resetDemoSeed() {
  cached = null;
}

export function catalogById(id: string): CatalogItem | undefined {
  return demoSeed().catalog.find((c) => c.id === id);
}

export function skillById(id: string): Skill | undefined {
  return demoSeed().skills.find((s) => s.id === id);
}
