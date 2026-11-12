import type { Branch, CatalogItem, GoalTemplate, Skill, SkillEdge } from "@/schemas";
import { demoSeed } from "@/data/demo-seed";

/**
 * What the graph and catalogue views read.
 *
 * The original loaded six validated JSON datasets off disk. Those were real mined data and
 * are gone; this returns the same shape from `src/data/demo-seed.ts` instead, so every
 * component above it is unchanged. The name is kept because the components import it.
 */
export type EngineData = {
  skills: Skill[];
  goals: GoalTemplate[];
  catalog: CatalogItem[];
  edges: SkillEdge[];
  branches: Branch[];
};

export function loadEngineData(): EngineData {
  const seed = demoSeed();
  return {
    skills: seed.skills,
    goals: seed.goals,
    catalog: seed.catalog,
    edges: seed.edges,
    branches: seed.branches,
  };
}
