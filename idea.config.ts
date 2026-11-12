import type { IdeaConfig } from "@/lib/config/schema";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE ONLY FILE TO EDIT FOR A NEW IDEA (plus 2–4 new tools in src/lib/tools).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This is the neutral placeholder the template ships with. At kickoff, rewrite it
 * (or run `/new-idea "<one line>"`) and everything downstream follows: landing copy,
 * metadata, the agent's system prompt, which tools are exposed, the sample chips,
 * the must-builds table and the demo seed.
 *
 * It is validated by `IdeaConfigSchema` at load, so a typo fails loudly and early
 * rather than rendering as an empty string somewhere in the UI.
 */
export const idea: IdeaConfig = {
  name: "Starter",
  tagline: "An agentic workspace waiting for its problem statement.",
  problem:
    "Placeholder. Replace this with one paragraph describing the real problem: who has it, " +
    "what it costs them today, and why an agent that can reason and act is a better answer " +
    "than a form or a dashboard.",
  targetUser: "Placeholder — the specific person this is for.",

  theme: { primary: "#8765ff", accent: "#a78bfa" },

  /** The assistant's name and framing. Every mention in the UI reads from here. */
  assistant: {
    name: "Aria",
    role: "Aria · your AI assistant",
    invitation: "Start a quick chat",

    /**
     * The scripted turn the landing hero plays in the bot preview. It is a canned
     * illustration, not a live call — the hero must render identically with no keys, no
     * database and no network — so keep it to something the real agent genuinely does.
     *
     * Pick a question whose answer is *computed*: the whole claim of the system is that
     * arithmetic goes through a tool rather than being generated, and this is where a
     * visitor sees that in one glance.
     */
    preview: {
      question: "What's 18% of 2,450, and what is that per month over a year?",
      tools: ["clean_input", "calculate", "verify"],
      answer: "18% of 2,450 is 441 — that's 36.75 per month over a year.",
      note: "Computed with a tool, not generated",
    },
  },

  /** Your details. The footer reads these; nothing personal is hard-coded in a component. */
  contact: {
    email: "you@example.com",
    team: [],
    credit: "",
  },

  landing: {
    heroTitle: "Your idea, shipped in a day.",
    heroSubtitle:
      "A domain-agnostic starter for agentic AI hackathons: an agent that reasons, picks tools and acts, with every step visible.",
    features: [
      {
        title: "Visible reasoning",
        description: "Every thought, tool call, result and rule hit is streamed to a trace panel as it happens.",
        icon: "activity",
      },
      {
        title: "Correct by construction",
        description: "The model phrases; code computes. Dates, money and comparisons never go through the LLM.",
        icon: "calculator",
      },
      {
        title: "Nothing acts unasked",
        description: "External actions queue in an approval tray with a preview. You approve, then it happens.",
        icon: "shield-check",
      },
      {
        title: "Runs with no keys",
        description: "Mock providers and an embedded database mean the demo cannot break mid-recording.",
        icon: "plug",
      },
    ],
    howItWorks: [
      { title: "Describe it", description: "Type, dictate, drop a file or paste a URL. Messy input is cleaned first." },
      { title: "The agent works", description: "It picks tools, calls them, verifies what came back and shows its workings." },
      { title: "You approve", description: "Anything that touches the outside world waits for you in the tray." },
    ],
    ctaText: "Open the workspace",
  },

  agent: {
    systemPrompt: [
      "You are a careful assistant working inside a tool-using agent loop.",
      "",
      "Rules:",
      "- Prefer calling a tool over guessing. If a fact can be computed, compute it with `calculate`.",
      "- Never invent dates, amounts, names or citations. If a source is needed, retrieve it.",
      "- After extracting structured data, call `verify` before presenting it as fact.",
      "- Anything that leaves this system (a message, a task, a post) must go through an approval.",
      "- When you are done, answer plainly and say what you were unsure about.",
    ].join("\n"),
    // A deliberately small default set. `create_task` is included so a fresh clone can
    // demonstrate the full approval journey (queue -> tray -> outbox) with no setup; it
    // queues for a human and cannot send anything by itself.
    enabledTools: [
      "clean_input",
      "extract_structured",
      "verify",
      "calculate",
      "search_memory",
      "save_memory",
      "create_task",
      // Degrades to clearly-labelled MOCK results with no TAVILY_API_KEY, so it is safe
      // to leave on: the agent can still cite, it just cites visibly fake sources.
      "web_search",
    ],
    maxSteps: 8,
    confidenceThreshold: 0.85,
  },

  inputs: {
    text: true,
    dictation: true,
    file: false,
    url: false,
    acceptedFileTypes: [],
  },

  partnerTool: {
    name: "TBD at kickoff",
    type: "input",
    proofNotes:
      "Screenshot the partner tool mid-use and save it to docs/partner-proof/. Name the file after the tool.",
  },

  sampleQuestions: [
    "What can you do?",
    "Remember that I prefer short answers.",
    "What's 18% of 2,450, and what is that per month over a year?",
    "Create a task to review the forecast, due in two weeks.",
  ],

  demoSeed: "placeholder",

  mustBuilds: [],

  wow: {
    title: "TBD at kickoff",
    description:
      "The one memorable moment judges will remember. Build it into components/landing/WowSlot.tsx and show it at 1:30 in the demo.",
  },
};

export default idea;
