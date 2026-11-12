import idea from "../../../idea.config";

/**
 * Config values safe to read from a client component.
 *
 * `config()` validates the whole object with zod, which is server work; a client component
 * that only needs one number should not pull the validator into the browser bundle. These
 * are plain constants read at module load.
 */
export const CONFIDENCE_THRESHOLD: number = idea.agent.confidenceThreshold ?? 0.85;
export const ASSISTANT_NAME: string = idea.assistant.name;
export const ASSISTANT_ROLE: string = idea.assistant.role;
export const ASSISTANT_INVITATION: string = idea.assistant.invitation;

/** The scripted turn the landing hero's bot preview plays. See `assistant.preview`. */
export const ASSISTANT_PREVIEW: {
  question: string;
  tools: string[];
  answer: string;
  note: string;
} = idea.assistant.preview;
export const IDEA_NAME: string = idea.name;
export const IDEA_TAGLINE: string = idea.tagline;

/**
 * The hero headline, split for the two-tone treatment the design uses: the first clause is
 * plain, the last is the gradient span. Splitting on the final clause keeps that effect
 * working for any headline an idea writes, without the config having to know about it.
 */
const heroWords = idea.landing.heroTitle.trim().split(/\s+/);
const splitAt = Math.max(1, heroWords.length - (heroWords.length > 4 ? 2 : 1));
export const HERO_TITLE_LEAD: string = heroWords.slice(0, splitAt).join(" ") + " ";
export const HERO_TITLE_ACCENT: string = heroWords.slice(splitAt).join(" ");
export const HERO_SUBTITLE: string = idea.landing.heroSubtitle;
export const CTA_TEXT: string = idea.landing.ctaText;
export const SAMPLE_QUESTIONS: string[] = idea.sampleQuestions;
export const CONTACT_EMAIL: string = idea.contact.email;
export const TEAM: { label: string; href?: string }[] = idea.contact.team;
export const CREDIT: string = idea.contact.credit;
