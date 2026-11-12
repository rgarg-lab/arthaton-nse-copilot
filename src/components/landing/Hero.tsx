"use client";

import { ArrowRight } from "lucide-react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Application } from "@splinetool/runtime";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Orb } from "@/components/ui/orb";
import { BotPreview } from "@/components/landing/BotPreview";
import { NOVA_SCENE_TIMEOUT_MS, NOVA_SCENE_URL, NovaScene } from "@/components/landing/NovaScene";
import { useQuickChat } from "@/components/landing/QuickChat";
import { useHydrated } from "@/lib/hydrated";
// The `numbers` prop is gone: the headline comes from idea.config.ts, and the counts it
// used to be assembled from were demo-seed placeholders that §4.1 does not allow here.

import styles from "./hero.module.css";
import { useInView } from "./useInView";
import {
  ASSISTANT_NAME,
  ASSISTANT_ROLE,
  HERO_SUBTITLE,
  HERO_TITLE_ACCENT,
  HERO_TITLE_LEAD,
  IDEA_NAME,
} from "@/lib/config/client";

const ENTER = { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const };

/** The slice of the Network Information API we read; it ships in Chromium only. */
type SaveDataConnection = { saveData?: boolean };

/** True when the visitor has asked their browser to spend less data ("Data Saver"). */
function prefersSaveData() {
  if (typeof navigator === "undefined") return false;
  return (navigator as Navigator & { connection?: SaveDataConnection }).connection?.saveData === true;
}

export function Hero({ storyHref = "#how-it-works" }: { storyHref?: string }) {
  const containerRef = useRef<HTMLElement>(null);
  const appRef = useRef<Application | null>(null);
  const [sceneLoaded, setSceneLoaded] = useState(false);
  // Two different failures: the scene threw (it will never paint), or it is simply
  // taking too long (it may still arrive, and is welcome when it does).
  const [sceneErrored, setSceneErrored] = useState(false);
  const [sceneStalled, setSceneStalled] = useState(false);
  const quickChat = useQuickChat();
  const reduce = useReducedMotion();

  // False through the server render and the hydration render, true immediately after, so
  // browser-only preferences can decide what to render without a hydration mismatch.
  const hydrated = useHydrated();

  /**
   * Whether a scene exists at all, known at build time from the inlined env var — so this
   * is the same value on the server and on the client and can be read during the first
   * render without risking a hydration mismatch.
   *
   * Reading it matters: the slot ships empty, and treating "no scene configured" as a
   * stalled load meant the hero showed its opaque loading cover for the full 8-second
   * timeout, on every visit, before the stand-in appeared — and rendered nothing at all
   * server-side. An unset env var is not a slow network; it is an answer, immediately.
   */
  const sceneConfigured = NOVA_SCENE_URL !== "";

  // Reduced motion, or Data Saver: the visitor asked for less, so the ~3 MB of runtime and
  // scene is never fetched — the bot preview is the hero instead. (`reduce` is null until
  // known, hence the explicit `=== true`.)
  const skipScene = hydrated && (reduce === true || prefersSaveData());
  const showScene = sceneConfigured && hydrated && !skipScene;

  // A stalled scene request calls neither onLoad nor onError, so a timer is the only
  // thing that notices. The scene stays mounted: if it does arrive late, it still wins.
  useEffect(() => {
    if (!showScene || sceneLoaded) return;
    const timer = setTimeout(() => setSceneStalled(true), NOVA_SCENE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [showScene, sceneLoaded]);

  // An error outranks a load: once the boundary has caught, nothing is on the canvas,
  // whatever a load callback from a torn-down mount may have said.
  const sceneVisible = sceneLoaded && !sceneErrored;
  // Nothing is on its way any more — either none was ever coming, or it failed. Stop
  // saying "loading" and show the assistant instead.
  const sceneGivenUp = !sceneConfigured || skipScene || sceneErrored || sceneStalled;

  // The runtime has no pause: play() after stop() replays the intro zoom. So the scene keeps
  // running while the hero is within a viewport of the screen (scrolling to the next section
  // and back never replays) and only stops once the visitor is well past it.
  const near = useInView(containerRef, "100% 0px");
  useEffect(() => {
    const app = appRef.current;
    if (!app || !sceneVisible) return;
    if (near) app.play();
    else app.stop();
  }, [near, sceneVisible]);

  const cursorX = useMotionValue(-500);
  const cursorY = useMotionValue(-500);
  const smoothX = useSpring(cursorX, { stiffness: 130, damping: 25, mass: 0.25 });
  const smoothY = useSpring(cursorY, { stiffness: 130, damping: 25, mass: 0.25 });

  function handleMouseMove(event: React.MouseEvent<HTMLElement>) {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    cursorX.set(event.clientX - bounds.left);
    cursorY.set(event.clientY - bounds.top);
  }

  return (
    <motion.section
      ref={containerRef}
      className={styles.hero}
      onMouseMove={handleMouseMove}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={ENTER}
      aria-label={`${IDEA_NAME} — ${ASSISTANT_NAME}, your AI learning mentor`}
    >
      <motion.div className={`${styles.cursorLight} bg-cursor-light`} style={{ x: smoothX, y: smoothY }} aria-hidden />

      <div className={styles.content}>
        <motion.div
          className={styles.textArea}
          initial={{ opacity: 0, x: -35 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...ENTER, delay: 0.15 }}
        >
          {/* Copy comes from idea.config.ts; the layout, type scale and motion are unchanged. */}
          <Badge variant="eyebrow" dot className={styles.eyebrow}>
            {ASSISTANT_ROLE}
          </Badge>

          <h1 className={styles.h1}>
            {HERO_TITLE_LEAD}
            <span className={`${styles.gradientText} text-gradient-violet`}>{HERO_TITLE_ACCENT}</span>
          </h1>

          <p className={styles.lead}>{HERO_SUBTITLE}</p>

          <div className={styles.buttons}>
            <Button asChild>
              <a href={storyHref}>
                Explore how it works <ArrowRight data-icon="inline-end" />
              </a>
            </Button>
          </div>

        </motion.div>

        <motion.div
          className={styles.sceneArea}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...ENTER, duration: 1, delay: 0.15 }}
        >
          {/*
            Two different states, and they must not share a treatment. While a configured
            scene is still loading, `.loader` covers the hero in opaque ink — correct, it
            is hiding a half-painted canvas. When there is no scene at all, that cover has
            nothing to hide: it just sits there forever, flattening the aurora and leaving
            one small orb adrift in the middle of an empty half.

            The given-up state is the common one — the scene slot ships empty — so it gets
            the actual assistant interface rather than decoration. A rotating ring says
            nothing about the product; a chat window showing a tool call and a computed
            answer says all of it, and needs no asset and no network to do so.
          */}
          {!sceneVisible &&
            (sceneGivenUp ? (
              <BotPreview />
            ) : (
              <div className={styles.loader} aria-live="polite">
                <Orb state="breathing" size={64} label={`Loading ${ASSISTANT_NAME}`} />
                <p className="label-caps">{`Loading ${ASSISTANT_NAME}`}</p>
              </div>
            ))}

          {showScene && (
            <NovaScene
              className={styles.spline}
              onLoad={(app) => {
                appRef.current = app;
                setSceneLoaded(true);
              }}
              onError={() => setSceneErrored(true)}
            />
          )}

          <motion.div
            className={styles.liveLabelWrap}
            animate={reduce ? undefined : { y: [0, -5, 0] }}
            transition={reduce ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <button type="button" onClick={quickChat.open} className={`${styles.liveLabel} ring-orbit`}>
              <span className={styles.liveIcon}>
                <span />
              </span>
              <div>
                <strong>Talk to {ASSISTANT_NAME}</strong>
                <small>Start a quick chat</small>
              </div>
            </button>
          </motion.div>
        </motion.div>
      </div>
    </motion.section>
  );
}
