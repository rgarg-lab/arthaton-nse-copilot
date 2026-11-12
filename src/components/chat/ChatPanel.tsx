"use client";

import { ArrowUp, Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type RefObject } from "react";

import type { ChatEvent } from "@/lib/agent/chatEvents";
import type { Degradation, DegradationReason } from "@/schemas";
import type { NovaState } from "@/schemas";
import type { Path, Profile, ProfileOp, PathDiff } from "@/schemas";
import { readSse } from "@/lib/sseClient";
import type { TraceEvent } from "@/lib/agent/trace";
import { Orb } from "@/components/ui/orb";
import { cn } from "@/lib/utils";

import { RotatingPrompt } from "./RotatingPrompt";
import styles from "./chat.module.css";
import { ASSISTANT_NAME, SAMPLE_QUESTIONS } from "@/lib/config/client";

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls?: string[];
  degraded?: boolean;
  streaming?: boolean;
};

type Props = {
  learnerId: string;
  initialMessages: ChatMessageView[];
  onProfileUpdated: (profile: Profile, ops: ProfileOp[]) => void;
  onPathUpdated: (version: number, path: Path, diff: PathDiff | null) => void;
  onNovaState: (state: NovaState) => void;
  /** Input focus drives the assistant's listening state (§9.2). */
  onInputFocus?: (focused: boolean) => void;
  /** Lets the shell focus the composer (`Talk to ${ASSISTANT_NAME}`). */
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  /** Judge mode has parked the model: show the resting notice. */
  resting?: boolean;
  /** Why the assistant rests; a spent budget closes the composer, an outage leaves it open for a retry. */
  restingReason?: DegradationReason | null;
  /** A turn came back degraded — the shell remembers the reason. */
  onDegraded?: (degradation: Degradation) => void;
  /**
   * The raw agent trace, forwarded to whatever wants to render it. Added so the restored
   * panel and the new TracePanel read one stream instead of each running the agent.
   */
  onTrace?: (event: TraceEvent) => void;
  /** Compact greeting for the landing drawer. */
  compact?: boolean;
  /** Stage-aware composer suggestions (src/lib/nextPrompts); null keeps the role carousel. */
  prompts?: string[] | null;
};

/**
 * Human labels for the tool chips that appear while the agent works.
 *
 * Keyed by tool name; anything unlisted falls back to the raw name, so this does not have
 * to be exhaustive. The template's entries named a different product's tools
 * ("Generating your path", "Searching the catalog") and would have been shown to a judge
 * the moment the chat ran.
 */
export const TOOL_LABEL: Record<string, string> = {
  // finance
  get_signal: "Reading today's signal",
  get_model_metrics: "Checking its own track record",
  find_similar_days: "Finding similar past sessions",
  // template
  clean_input: "Cleaning up the question",
  extract_structured: "Pulling out the details",
  verify: "Verifying before asserting",
  calculate: "Computing it in code",
  search_memory: "Checking what it remembers",
  save_memory: "Remembering that",
  rag_lookup: "Searching the documents",
  create_task: "Queuing for your approval",
};

/**
 * The opening suggestions, from `idea.config.ts`. Hard-coded examples would be the one
 * place an idea's chat still spoke about somebody else's domain.
 */
const SUGGESTIONS = SAMPLE_QUESTIONS;

/**
 * The chat's opening line, and the two resting states.
 *
 * All three described a different product — "I'll map the gap, build a path from real
 * courses", "Your path, feedback, graph and dashboard still work". Named constants here
 * rather than in `idea.config.ts` because they are this component's own states rather
 * than idea copy, and a schema field for each would be three fields nobody edits. The
 * assistant's name still comes from the config.
 */
const GREETING_LEAD =
  "Ask me about any name in the basket and I'll give you the model's calibrated " +
  "probability — or tell you it's declining to call that one today, and why.";

const RESTING_BUDGET_SPENT =
  "today's conversation budget is spent. The signals, the model card and the evidence " +
  "pages still work — they read the model service directly. Chat opens again tomorrow.";

const RESTING_UNAVAILABLE =
  "the model is unavailable right now. The signals, the model card and the evidence " +
  "pages still work — they read the model service directly.";

const ENTER = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };

/** The conversational interface: one SSE turn at a time, tool activity shown as a live checklist. */
export function ChatPanel({
  learnerId,
  initialMessages,
  onProfileUpdated,
  onPathUpdated,
  onNovaState,
  onInputFocus,
  inputRef,
  prompts = null,
  resting = false,
  restingReason = null,
  onDegraded,
  onTrace,
  compact = false,
}: Props) {
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const localRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? localRef;
  const seq = useRef(initialMessages.length);
  const reduce = useReducedMotion() ?? false;
  // Cards answered this session (by card id); older cards count as answered once anything follows them.
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [messages, activity, reduce]);

  const budgetSpent = resting && restingReason === "budget";

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy || budgetSpent) return;
    setBusy(true);
    setError(null);
    setInput("");
    const userId = `u-${++seq.current}`;
    const assistantId = `a-${++seq.current}`;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text: message },
      { id: assistantId, role: "assistant", text: "", streaming: true },
    ]);
    const patch = (fn: (m: ChatMessageView) => ChatMessageView) =>
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? fn(m) : m)));
    onNovaState("thinking");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ learnerId, message }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      await readSse(res, (_name, data) => {
        const event = data as ChatEvent;
        switch (event.type) {
          case "text":
            setActivity(null);
            patch((m) => ({ ...m, text: m.text + event.delta }));
            break;
          case "nova_state":
            onNovaState(event.state);
            break;
          case "tool_call":
            if (event.status === "start") setActivity(TOOL_LABEL[event.name] ?? event.name);
            else {
              setActivity(null);
              patch((m) => ({ ...m, toolCalls: [...(m.toolCalls ?? []), event.name] }));
            }
            break;
          case "profile_updated":
            onProfileUpdated(event.profile, event.ops);
            break;
          case "path_updated":
            onPathUpdated(event.version, event.path, event.diff);
            break;
          case "ui_card":
            // Nothing in this project emits one; the structured intake card it rendered
            // is gone with the learner concept (§7.1). Ignored rather than crashing the
            // stream, because `ChatEvent` is a shared union the chat route still maps.
            break;
          case "degraded":
            patch((m) => ({ ...m, degraded: true, text: m.text || event.degradation.message }));
            onDegraded?.(event.degradation);
            break;
          case "done":
            patch((m) => ({ ...m, streaming: false }));
            break;
          case "trace":
            // Not rendered here: the panel shows the conversation, the Agent tab shows
            // the trace. Forwarding keeps both on the one stream.
            onTrace?.(event.event);
            break;
          default:
            break;
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      patch((m) => ({ ...m, streaming: false, degraded: true, text: m.text || "I couldn't answer that just now." }));
      onNovaState("idle");
    } finally {
      setActivity(null);
      setBusy(false);
      patch((m) => ({ ...m, streaming: false }));
    }
  }

  /*
   * `answerCard` and the structured intake card it served have been removed.
   *
   * It was already unreachable — nothing in this project emits a `ui_card` event — and
   * its save path POSTed to `/api/learners/:id/profile`, a route §7.1 retires. So it was
   * not a dormant feature but broken dead code pointing at a 404, which is why it is gone
   * rather than kept: `tests/honesty.test.ts` now fails the build on any reference to a
   * retired route, and an inert one is still a reference.
   */

  const canSend = input.trim().length > 0 && !busy && !budgetSpent;

  return (
    <section className={styles.panel} aria-label={`Chat with ${ASSISTANT_NAME}`}>
      <div className={styles.log} role="log" aria-live="polite">
        {messages.length === 0 && (
          <motion.div
            className={cn(styles.greeting, compact && styles.greetingCompact)}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={ENTER}
          >
            <Orb state="breathing" size={64} label={`${ASSISTANT_NAME}`} paused={reduce} />
            <h2 className={styles.greetingTitle}>
              Hi, I&apos;m <span className="text-gradient-violet">{ASSISTANT_NAME}</span>.
            </h2>
            <p className={styles.greetingLead}>{GREETING_LEAD}</p>
            <ul className={styles.suggestions} aria-label="Try one of these">
              {SUGGESTIONS.map((s, i) => (
                <motion.li
                  key={s}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...ENTER, delay: 0.12 + i * 0.07 }}
                >
                  <button type="button" className={styles.suggestion} onClick={() => send(s)}>
                    {s}
                  </button>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              className={cn(styles.row, m.role === "user" ? styles.rowUser : styles.rowNova)}
              data-role={m.role}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={ENTER}
            >
              {m.role === "user" ? (
                <div className={styles.userBubble}>{m.text}</div>
              ) : (
                <NovaMessage
                  message={m}
                  activity={m.streaming ? activity : null}
                  reduce={reduce}
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      <div className={styles.composerWrap}>
        <AnimatePresence>
          {resting && (
            <motion.p
              className={styles.notice}
              role="status"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={ENTER}
            >
              <span className={styles.noticeDot} aria-hidden />
              {`${ASSISTANT_NAME} is resting — ${budgetSpent ? RESTING_BUDGET_SPENT : RESTING_UNAVAILABLE}`}
            </motion.p>
          )}
        </AnimatePresence>

        <form
          className={cn(styles.composer, busy && styles.composerBusy)}
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          {input === "" && !focused && !busy && (
            <RotatingPrompt
              className={styles.rotating}
              paused={reduce}
              phrases={prompts}
              // The rotating phrases are the configured sample questions, so the intro
              // just has to hand off to them. The template's version ("I want to become
              // a…") belonged to a career-planning product.
              intro={messages.length === 0 ? "Try:" : "Ask another, or try:"}
              onPick={(text) => {
                setInput(text);
                textareaRef.current?.focus();
              }}
            />
          )}
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            rows={1}
            value={input}
            placeholder={focused ? (messages.length === 0 ? `Tell ${ASSISTANT_NAME} what you want to become…` : `Reply to ${ASSISTANT_NAME}…`) : ""}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => {
              setFocused(true);
              onInputFocus?.(true);
            }}
            onBlur={() => {
              setFocused(false);
              onInputFocus?.(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            disabled={busy || budgetSpent}
            aria-label={`Message ${ASSISTANT_NAME}`}
            data-testid="chat-input"
          />
          <div className={styles.composerBar}>
            <span className={styles.hint} aria-hidden>
              <kbd>↵</kbd> send · <kbd>⇧↵</kbd> new line
            </span>
            <button type="submit" className={styles.send} disabled={!canSend} aria-label={busy ? `${ASSISTANT_NAME} is answering` : "Send"} data-testid="chat-send">
              {busy ? <Orb state="working" size={20} label={`${ASSISTANT_NAME} is answering`} paused={reduce} /> : <ArrowUp />}
            </button>
          </div>
        </form>
        {error ? (
          <p className={cn(styles.footnote, styles.footnoteError)} role="alert">
            {error}
          </p>
        ) : (
          <p className={styles.footnote}>{ASSISTANT_NAME} can misread you — the path itself is computed from your profile, not generated.</p>
        )}
      </div>
    </section>
  );
}

function NovaMessage({
  message,
  activity,
  reduce,
}: {
  message: ChatMessageView;
  activity: string | null;
  reduce: boolean;
}) {
  const done = message.toolCalls ?? [];
  const showChecklist = done.length > 0 || activity;
  const thinking = message.streaming && !message.text && !activity;

  return (
    <div className={styles.novaMessage}>
      <div className={styles.novaMark} aria-hidden>
        <span />
      </div>
      <div className={styles.novaBody}>
        {showChecklist && (
          <ol className={styles.checklist} aria-label={`What ${ASSISTANT_NAME} did`}>
            {done.map((name, i) => (
              <li key={`${name}-${i}`} className={styles.checkDone}>
                <span className={styles.checkIcon}>
                  <Check />
                </span>
                {TOOL_LABEL[name] ?? name}
              </li>
            ))}
            {activity && (
              <li className={styles.checkRunning} data-testid="chat-activity">
                <span className={styles.checkIcon}>
                  <Orb state="searching" size={20} label="Working" paused={reduce} />
                </span>
                {activity}…
              </li>
            )}
          </ol>
        )}

        {thinking && (
          <div className={styles.thinking} aria-label={`${ASSISTANT_NAME} is thinking`}>
            <Orb state="searching" size={20} label={`${ASSISTANT_NAME} is thinking`} paused={reduce} />
            <span>Thinking</span>
          </div>
        )}

        {message.text && (
          <p className={cn(styles.novaText, message.degraded && styles.novaTextDegraded)}>
            {message.text}
            {message.streaming && <span className={styles.caret} aria-hidden />}
          </p>
        )}

        {message.degraded && !message.streaming && (
          <span className={styles.degradedTag}>answered without the model</span>
        )}
      </div>
    </div>
  );
}
