import { z } from "zod";

/**
 * The shape of `idea.config.ts` — the single source of truth for whatever is being built.
 * Every user-facing string and every prompt reads from here; no idea text is hard-coded
 * anywhere else in the template.
 *
 * Changing this schema is a template-level change. Changing the *values* is what happens
 * at a hackathon kickoff.
 */

const HexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a hex colour like #8765ff");

export const ThemeSchema = z.object({
  primary: HexColor,
  accent: HexColor,
});

export const FeatureSchema = z.object({
  title: z.string().min(1).max(60),
  description: z.string().min(1).max(200),
  /** lucide-react icon name; the UI falls back to a dot when it does not resolve. */
  icon: z.string().min(1).default("sparkles"),
});

export const StepSchema = z.object({
  title: z.string().min(1).max(60),
  description: z.string().min(1).max(200),
});

export const LandingSchema = z.object({
  heroTitle: z.string().min(1).max(90),
  heroSubtitle: z.string().min(1).max(240),
  features: z.array(FeatureSchema).min(3).max(4),
  howItWorks: z.array(StepSchema).min(2).max(5),
  ctaText: z.string().min(1).max(40),
});

/**
 * The assistant's own identity, separate from the product's.
 *
 * The restored UI was built around a named conversational mentor, and that name appears in
 * the hero eyebrow, the chat panel, the orb label and the sign-in page. Keeping it in the
 * config is what lets every one of those read from one place instead of carrying a
 * hard-coded brand through the component tree.
 */
export const AssistantSchema = z.object({
  /** Shown wherever the assistant is addressed by name. */
  name: z.string().min(1).max(24),
  /** The hero eyebrow, e.g. "<name> · your AI mentor". */
  role: z.string().min(1).max(60),
  /** The one-line invitation on the chat launcher. */
  invitation: z.string().min(1).max(60),
  /**
   * The scripted turn the landing hero's bot preview plays. Canned on purpose: the hero
   * has to render with no keys, no database and no network. Lengths are capped because
   * this copy sits in a fixed-height card and longer strings overflow it rather than wrap
   * gracefully.
   */
  preview: z.object({
    question: z.string().min(1).max(120),
    /** Chips shown in the order the agent would call them. Two to four reads best. */
    tools: z.array(z.string().min(1).max(32)).min(1).max(4),
    answer: z.string().min(1).max(160),
    /** The small claim under the answer, e.g. "Computed with a tool, not generated". */
    note: z.string().min(1).max(48),
  }),
});

/**
 * Who to contact and who built it.
 *
 * In the config because the footer of the inherited UI carried the original team's
 * personal email and their LinkedIn profiles. Personal details belong to whoever is
 * shipping, so they are declared here and default to empty.
 */
export const ContactSchema = z.object({
  email: z.string().min(1),
  /** Shown as a row of links. Empty renders nothing, which is the default. */
  team: z
    .array(z.object({ label: z.string().min(1), href: z.string().url().optional() }))
    .default([]),
  credit: z.string().max(120).default(""),
});

export const AgentSchema = z.object({
  systemPrompt: z.string().min(1),
  /** Only these tools are exposed to the model. Validated against the registry at load. */
  enabledTools: z.array(z.string().min(1)),
  maxSteps: z.number().int().min(1).max(20).default(8),
  /** Below this, a result is shown as unverified rather than as fact. */
  confidenceThreshold: z.number().min(0).max(1).default(0.85),
});

export const InputsSchema = z.object({
  text: z.boolean().default(true),
  dictation: z.boolean().default(true),
  file: z.boolean().default(false),
  url: z.boolean().default(false),
  /** Extensions, lower-case with the dot, e.g. [".pdf", ".csv"]. */
  acceptedFileTypes: z.array(z.string().regex(/^\.[a-z0-9]+$/)).default([]),
});

export const PartnerToolSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["input", "build", "integration", "api"]),
  /** What to screenshot into docs/partner-proof/ to prove the tool was used. */
  proofNotes: z.string().min(1),
});

export const MustBuildSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["todo", "partial", "done"]).default("todo"),
  files: z.array(z.string()).default([]),
});

export const WowSchema = z.object({
  title: z.string().min(1).max(80),
  description: z.string().min(1).max(300),
});

export const IdeaConfigSchema = z.object({
  name: z.string().min(1).max(40),
  tagline: z.string().min(1).max(120),
  problem: z.string().min(1),
  targetUser: z.string().min(1).max(240),
  /**
   * What the primary user does *today*, without this tool.
   *
   * Separate from `problem` because it is a different claim: `problem` says the category is
   * badly designed, this says what the person is actually doing in its absence. It is also
   * the honest human baseline — the model is measured against always-up, previous-day sign
   * and a 3-feature logistic regression, none of which is what a real person does instead.
   */
  userToday: z.string().min(1).max(320),
  /**
   * What this deliberately is not.
   *
   * Stated because a scope this narrow is a design decision rather than a limitation, and
   * an unstated one reads as something the build simply never reached.
   */
  nonGoals: z.array(z.string().min(1).max(160)).min(3).max(8),
  theme: ThemeSchema,
  assistant: AssistantSchema,
  contact: ContactSchema,
  landing: LandingSchema,
  agent: AgentSchema,
  inputs: InputsSchema,
  partnerTool: PartnerToolSchema,
  sampleQuestions: z.array(z.string().min(1)).min(1).max(8),
  /** File name (without .json) under /seed loaded by the "Load demo" button. */
  demoSeed: z.string().min(1),
  mustBuilds: z.array(MustBuildSchema).default([]),
  wow: WowSchema,
});

export type IdeaConfig = z.infer<typeof IdeaConfigSchema>;
export type Assistant = z.infer<typeof AssistantSchema>;
export type Feature = z.infer<typeof FeatureSchema>;
export type MustBuild = z.infer<typeof MustBuildSchema>;
export type PartnerTool = z.infer<typeof PartnerToolSchema>;
