import { buildBranchOverlay, type BranchOverlay } from "@/lib/branchOverlay";
import { loadEngineData } from "@/lib/engineData";
import { demoSeed, SOURCE_LABELS } from "@/data/demo-seed";
import type { EvidenceSource, SkillEdge } from "@/schemas";

/**
 * What the graph explorer renders.
 *
 * Originally a slice of two mined JSON datasets, filtered and validated at build time. The
 * datasets are gone; this assembles the identical shape from `src/data/demo-seed.ts`, so
 * SkillGraph, EdgeCard, BranchOverlay and the landing plates are all unchanged.
 */

/** One source's numbers for one edge. */
export type GraphEdgeSource = {
  support: number;
  reverse: number;
  confidence: number;
  n: number;
  nCoursePairs?: number;
  coursePairs?: { from: string; to: string; support: number }[];
};

export type GraphEdge = {
  from: string;
  to: string;
  origin: SkillEdge["origin"];
  status: SkillEdge["status"];
  drivesPath: boolean;
  sources: Partial<Record<EvidenceSource, GraphEdgeSource>>;
  resolution?: { decision: string; note: string; date: string };
};

export type BranchFloors = { minTotal: number; minListed: number; alpha: number };
export type PromotionThresholds = {
  promoteConfidence: number;
  promoteSupport: number;
  promoteCorroboration: number;
};
export type EvidenceThresholds = PromotionThresholds & { confirmConfidence: number; confirmN: number };

export type GraphEvidence = {
  edges: GraphEdge[];
  /** Rendered wherever that source's numbers appear, so a placeholder is never mistaken for data. */
  caveats: Record<EvidenceSource, string>;
  /** Tags behind each node, shown on the node detail. */
  soTags: Record<string, string[]>;
  thresholds: EvidenceThresholds;
  branches: BranchOverlay;
  branchFloors: BranchFloors;
};

/**
 * The same floors the original pipeline used, kept so the "verified by N of 2 sources"
 * verdict on the edge card behaves identically against the seeded numbers.
 */
export const DEMO_THRESHOLDS: EvidenceThresholds = {
  confirmConfidence: 0.7,
  confirmN: 20,
  promoteConfidence: 0.75,
  promoteSupport: 60,
  promoteCorroboration: 1,
};

export function meetsPromotionThresholds(
  edge: SkillEdge,
  _tags: Record<string, string[]>,
  t: PromotionThresholds,
): boolean {
  const stats = Object.values(edge.sources).filter((s) => s !== undefined);
  if (stats.length < t.promoteCorroboration) return false;
  return stats.some((s) => s.confidence >= t.promoteConfidence && s.support >= t.promoteSupport);
}

function toGraphEdge(edge: SkillEdge): GraphEdge {
  const sources: Partial<Record<EvidenceSource, GraphEdgeSource>> = {};
  for (const [key, stat] of Object.entries(edge.sources)) {
    if (!stat) continue;
    sources[key as EvidenceSource] = {
      support: stat.support,
      reverse: stat.reverse,
      confidence: stat.confidence,
      n: stat.n,
      ...(stat.detail?.nCoursePairs ? { nCoursePairs: stat.detail.nCoursePairs } : {}),
    };
  }
  return {
    from: edge.from,
    to: edge.to,
    origin: edge.origin,
    status: edge.status,
    drivesPath: edge.drivesPath,
    sources,
    ...(edge.resolution
      ? { resolution: { decision: edge.resolution.decision, note: edge.resolution.note, date: edge.resolution.date } }
      : {}),
  };
}

let cached: GraphEvidence | null = null;

export function loadGraphEvidence(): GraphEvidence {
  if (cached) return cached;
  const data = loadEngineData();
  const seed = demoSeed();

  const edges = data.edges
    .filter((e) => e.drivesPath || meetsPromotionThresholds(e, {}, DEMO_THRESHOLDS))
    .map(toGraphEdge);

  // One tag per node, derived from its name, so the node detail is not empty.
  const onEdges = new Set(edges.flatMap((e) => [e.from, e.to]));
  const soTags = Object.fromEntries(
    seed.skills
      .filter((s) => onEdges.has(s.id))
      .map((s) => [s.id, [s.name.toLowerCase().replace(/\s+/g, "-")]]),
  );

  cached = {
    edges,
    caveats: {
      stackoverflow: `Placeholder counts attributed to the ${SOURCE_LABELS.stackoverflow}. Not a measurement.`,
      coursera: `Placeholder counts attributed to the ${SOURCE_LABELS.coursera}. Not a measurement.`,
    },
    soTags,
    thresholds: DEMO_THRESHOLDS,
    branches: buildBranchOverlay(data.branches),
    branchFloors: { minTotal: 50, minListed: 5, alpha: 20 },
  };
  return cached;
}

/** Test seam. */
export function resetGraphEvidence() {
  cached = null;
}
