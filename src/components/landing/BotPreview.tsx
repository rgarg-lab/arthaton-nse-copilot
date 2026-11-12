"use client";

import { Check, Wrench } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { ASSISTANT_NAME, ASSISTANT_PREVIEW, ASSISTANT_ROLE } from "@/lib/config/client";
import { BotAvatar } from "./BotAvatar";

import styles from "./botPreview.module.css";

/**
 * The hero's right-hand column: an assistant interface, playing one scripted turn.
 *
 * This replaces a rotating-rings stand-in, and the reason is worth keeping. The slot exists
 * for an optional 3D scene (`NEXT_PUBLIC_HERO_SCENE_URL`); with no scene configured the
 * column previously showed concentric spinning circles around a 64px orb, which is
 * decoration — it told a visitor nothing about what the product is. A chat window showing
 * the agent call `calculate` and label the result as computed says it in one glance.
 *
 * Deliberately canned, not a live call. The hero is the first paint on the first visit,
 * frequently with no keys set and sometimes with no network, and a hero that depends on a
 * model is a hero that spins. Every string comes from `idea.config.ts`, so swapping the
 * idea swaps the demonstration too.
 */

/** The turn, as discrete frames. Each one only adds, so the card never shrinks. */
const STAGES = ["asking", "thinking", "tools", "answering", "settled"] as const;
type Stage = (typeof STAGES)[number];

/** How long each frame holds. The last is the read pause before the turn replays. */
const HOLD: Record<Stage, number> = {
  asking: 1100,
  thinking: 900,
  tools: 1500,
  answering: 2600,
  settled: 4200,
};

const TYPE_MS = 26;

export function BotPreview({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const preview = ASSISTANT_PREVIEW;

  // With reduced motion the whole thing is rendered in its final state: no replay, no
  // typing, no pulse. That is a complete version of the content, not a degraded one.
  const [stage, setStage] = useState<Stage>(reduce ? "settled" : "asking");
  const [typed, setTyped] = useState(reduce ? preview.answer.length : 0);

  // Advance through the frames, looping. One timer at a time, cleared on every change, so
  // a remount or a reduced-motion flip cannot leave two timelines running.
  useEffect(() => {
    if (reduce) return;
    const timer = setTimeout(() => {
      const next = STAGES[(STAGES.indexOf(stage) + 1) % STAGES.length];
      setStage(next);
      // Restarting the loop clears the typed answer, or the replay would start finished.
      if (next === "asking") setTyped(0);
    }, HOLD[stage]);
    return () => clearTimeout(timer);
  }, [stage, reduce]);

  // The answer types itself while the "answering" frame holds.
  useEffect(() => {
    if (reduce || stage !== "answering") return;
    if (typed >= preview.answer.length) return;
    const timer = setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
    return () => clearTimeout(timer);
  }, [stage, typed, reduce, preview.answer.length]);

  const at = (s: Stage) => STAGES.indexOf(stage) >= STAGES.indexOf(s);
  const thinking = stage === "thinking" || stage === "tools";
  // Once the answer starts, show it whole on the last frame even if the typer was
  // interrupted — a settled card with a half-typed sentence looks like a bug.
  const shown = stage === "settled" ? preview.answer : preview.answer.slice(0, typed);

  return (
    <div className={`${styles.wrap} ${className ?? ""}`}>
      <div className={styles.glow} aria-hidden />

      {/* aria-hidden: this is an illustration of the product, and a screen reader reading a
          fake conversation as if it were real content is worse than silence. The real chat
          is one tab away and is properly labelled. */}
      <article className={styles.card} aria-hidden>
        <header className={styles.head}>
          <span className={`${styles.avatar} ${thinking ? styles.avatarBusy : ""}`}>
            <BotAvatar size={40} thinking={thinking} />
          </span>
          <span className={styles.identity}>
            <strong>{ASSISTANT_NAME}</strong>
            <small>{ASSISTANT_ROLE}</small>
          </span>
          <span className={styles.status}>
            <span className={styles.statusDot} />
            {thinking ? "Working" : "Ready"}
          </span>
        </header>

        <div className={styles.thread}>
          <div className={`${styles.row} ${styles.rowUser} ${at("asking") ? styles.in : ""}`}>
            <p className={`${styles.bubble} ${styles.bubbleUser}`}>{preview.question}</p>
          </div>

          <div className={`${styles.row} ${at("thinking") ? styles.in : ""}`}>
            <span className={styles.botMark}>
              <BotAvatar size={20} thinking={thinking} />
            </span>

            <div className={styles.replyCol}>
              {/* Tool chips: the part a judge is looking for. They appear in call order. */}
              <ul className={styles.tools}>
                {preview.tools.map((tool, i) => (
                  <li
                    key={tool}
                    className={`${styles.tool} ${at("tools") ? styles.in : ""}`}
                    style={{ transitionDelay: reduce ? "0ms" : `${i * 170}ms` }}
                  >
                    <Wrench className={styles.toolIcon} />
                    <code>{tool}</code>
                  </li>
                ))}
              </ul>

              {at("answering") ? (
                <p className={`${styles.bubble} ${styles.bubbleBot}`}>
                  {shown}
                  {stage === "answering" && shown.length < preview.answer.length && (
                    <span className={styles.caret} />
                  )}
                </p>
              ) : (
                <p className={`${styles.bubble} ${styles.bubbleBot} ${styles.typingBubble}`}>
                  <span className={styles.dots}>
                    <i />
                    <i />
                    <i />
                  </span>
                </p>
              )}

              <p className={`${styles.note} ${stage === "settled" ? styles.in : ""}`}>
                <Check className={styles.noteIcon} />
                {preview.note}
              </p>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
