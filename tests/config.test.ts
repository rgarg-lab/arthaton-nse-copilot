import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { IdeaConfigSchema } from "@/lib/config/schema";
import idea from "../idea.config";

describe("idea.config", () => {
  it("the shipped config is valid", () => {
    expect(() => config()).not.toThrow();
    expect(config().name).toBe(idea.name);
  });

  it("every sample question and enabled tool is non-empty", () => {
    const c = config();
    expect(c.sampleQuestions.length).toBeGreaterThan(0);
    for (const q of c.sampleQuestions) expect(q.trim()).not.toBe("");
    for (const t of c.agent.enabledTools) expect(t.trim()).not.toBe("");
  });

  it("rejects a bad theme colour", () => {
    const bad = { ...idea, theme: { primary: "violet", accent: "#a78bfa" } };
    const parsed = IdeaConfigSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("rejects a confidence threshold outside 0..1", () => {
    const bad = { ...idea, agent: { ...idea.agent, confidenceThreshold: 1.5 } };
    expect(IdeaConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("requires at least three landing features", () => {
    const bad = { ...idea, landing: { ...idea.landing, features: idea.landing.features.slice(0, 2) } };
    expect(IdeaConfigSchema.safeParse(bad).success).toBe(false);
  });

  it("applies defaults for omitted optional fields", () => {
    const withoutMustBuilds: Record<string, unknown> = { ...idea };
    delete withoutMustBuilds.mustBuilds;
    const parsed = IdeaConfigSchema.safeParse(withoutMustBuilds);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.mustBuilds).toEqual([]);
  });
});
