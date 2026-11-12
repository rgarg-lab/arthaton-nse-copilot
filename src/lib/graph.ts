import type { SkillEdge } from "@/schemas";

/**
 * The two graph utilities the restored UI needs, kept here rather than in an engine.
 *
 * The original project had a path-planning engine; that is domain logic and is gone. These
 * are the generic bits the *graph view* needs to lay nodes out, so they live in lib.
 */

/** The part of an edge the layout needs; the evidence layer reads the rest. */
export type PathEdge = Pick<SkillEdge, "from" | "to" | "drivesPath">;

/** Prerequisite lists keyed by the dependent node, in edge order. */
export type PrereqMap = ReadonlyMap<string, readonly string[]>;

/**
 * Only edges marked `drivesPath` shape the layout: authored ones plus any a human
 * promoted. Mined candidates are shown as evidence, never as structure.
 */
export function pathDrivingEdges<E extends PathEdge>(edges: readonly E[]): E[] {
  return edges.filter((e) => e.drivesPath);
}

export function prereqMap(edges: readonly PathEdge[]): PrereqMap {
  const map = new Map<string, string[]>();
  for (const e of pathDrivingEdges(edges)) {
    const list = map.get(e.to);
    if (list) list.push(e.from);
    else map.set(e.to, [e.from]);
  }
  return map;
}
