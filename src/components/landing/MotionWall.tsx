"use client";

import { useEffect, useRef } from "react";

import { useInView } from "./useInView";

import styles from "./wall.module.css";
import { ASSISTANT_NAME, IDEA_NAME } from "@/lib/config/client";

interface Panel {
  /** Optional looping screen capture; falls back to the poster gradient. */
  src?: string;
  eyebrow: string;
  title: string[];
  footer: string;
  speed: number;
}

/** Six things a course list never does; one shipped feature per panel (§7, §8.3, §5.1, §5.5, §6, §8.4). */
const PANELS: Panel[] = [
  { eyebrow: "WHEN IT WON'T CALL", title: ["NO", "SIGNAL"], footer: "THE REFUSAL IS THE PRODUCT", speed: 0.92 },
  { eyebrow: "WHAT IT LEANS ON", title: ["58", "FEATURES"], footer: "", speed: 0.88 },
  { eyebrow: "AGAINST FOUR BASELINES", title: ["SMALL", "BUT REAL"], footer: "", speed: 0.92 },
  { eyebrow: "EVIDENCE YOU CAN CHECK", title: ["REAL", "DATES"], footer: "", speed: 0.9 },
  { eyebrow: "WHAT ABSTAINING BUYS", title: ["FEWER", "BETTER"], footer: "", speed: 0.86 },
  { eyebrow: "IF THE MODEL IS DOWN", title: ["NO", "GUESSING"], footer: "", speed: 0.84 },
];

/** Clamped, because a couple of the bars are drawn on a zoomed axis. */
const pct = (value: number) =>
  `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

/**
 * What the wall renders, all of it read from `ml/artifacts/*.json` by `app/page.tsx`.
 *
 * The template's version took a `DemoNumbers` built from a seeded PRNG. The panels, their
 * scroll choreography and their CSS are untouched; only the source of the figures changed,
 * which is the whole fix — these were good panels showing invented numbers, and the answer
 * was never to delete them.
 *
 * Every field is optional-free but the whole object is nullable at the call site: with the
 * ML service down the wall renders its panels with no figures rather than placeholder ones.
 */
export type WallData = {
  /** The top features by gain share, already normalised by `train.py`. */
  features: { label: string; value: number }[];
  /** Accuracy for the model and each baseline, as fractions. */
  baselines: { label: string; value: number; isModel?: boolean }[];
  /** A few real analogue sessions: date, ticker, and what happened next. */
  analogues: { date: string; ticker: string; up: boolean }[];
  abstention: {
    /** Fraction of sessions it will call. */
    coverage: number;
    /** Accuracy on those, and on everything, as fractions. */
    whenCalling: number;
    onEverything: number;
  };
  /** How many names abstained today, of how many. */
  today: { abstained: number; total: number };
};

type ArtProps = { index: number; data: WallData | null };

/** The real app element behind each panel. */
function PanelArt({ index, data }: ArtProps) {
  if (!data) {
    return (
      <div className={`${styles.art} ${styles.meter}`} aria-hidden>
        <span className={styles.state}>
          <i /> The model service is not running, so there are no figures to show.
        </span>
      </div>
    );
  }

  switch (index) {
    case 0:
      return (
        <div className={`${styles.art} ${styles.chips}`} aria-hidden>
          <span className={styles.chip}>
            <em>today</em> {data.today.abstained} of {data.today.total} declined
          </span>
          <span className={`${styles.chip} ${styles.new}`}>
            <em>gate</em> {pct(data.abstention.coverage)} of sessions get a call
          </span>
          <span className={styles.chip}>
            frozen before the holdout was read
          </span>
        </div>
      );
    case 1:
      return (
        <div className={styles.art} aria-hidden>
          {data.features.map((f) => (
            <div
              className={styles.bar}
              key={f.label}
              // Scaled to the largest share: gain on 58 features is all small numbers,
              // and scaling to 1.0 would draw six slivers.
              style={{ "--w": pct(f.value / (data.features[0]?.value || 1)) } as React.CSSProperties}
            >
              <span>{f.label}</span>
              <i />
              <b>{f.value.toFixed(3)}</b>
            </div>
          ))}
        </div>
      );
    case 2:
      return (
        <div className={styles.art} aria-hidden>
          {data.baselines.map((b) => (
            <div
              className={styles.bar}
              key={b.label}
              // Zoomed to the 45–60% band. All five sit within three points of a coin
              // flip, and a 0–100% axis would draw five identical bars — the gap between
              // them is the entire point of the panel.
              style={{ "--w": pct((b.value - 0.45) / 0.15) } as React.CSSProperties}
            >
              <span>{b.label}</span>
              <i />
              <b>{pct(b.value)}</b>
            </div>
          ))}
        </div>
      );
    case 3:
      return (
        <div className={`${styles.art} ${styles.chips}`} aria-hidden>
          {data.analogues.map((a) => (
            <span
              className={a.up ? `${styles.chip} ${styles.new}` : styles.chip}
              key={`${a.ticker}-${a.date}`}
            >
              <em>{a.date}</em> {a.ticker} {a.up ? "↑" : "↓"}
            </span>
          ))}
        </div>
      );
    case 4:
      return (
        <div className={styles.art} aria-hidden>
          <div
            className={styles.bar}
            style={{ "--w": pct(data.abstention.whenCalling) } as React.CSSProperties}
          >
            <span>when it calls</span>
            <i />
            <b>{pct(data.abstention.whenCalling)}</b>
          </div>
          <div
            className={styles.bar}
            style={{ "--w": pct(data.abstention.onEverything) } as React.CSSProperties}
          >
            <span>if it called all</span>
            <i />
            <b>{pct(data.abstention.onEverything)}</b>
          </div>
          <p className={styles.count}>
            it calls {pct(data.abstention.coverage)} of sessions
          </p>
        </div>
      );
    default:
      return (
        <div className={`${styles.art} ${styles.meter}`} aria-hidden>
          <span className={styles.state}>
            <i /> {ASSISTANT_NAME} cannot reach the model service.
          </span>
          <div className={styles.meterRow} style={{ "--w": "100%" } as React.CSSProperties}>
            <span>signals</span>
            <i />
          </div>
          <div className={styles.meterRow} style={{ "--w": "100%" } as React.CSSProperties}>
            <span>model card</span>
            <i />
          </div>
          <div className={styles.meterRow} style={{ "--w": "100%" } as React.CSSProperties}>
            <span>evidence</span>
            <i />
          </div>
          <span className={styles.state}>
            <i /> Each one says so. None of them estimates a number instead.
          </span>
        </div>
      );
  }
}

export function MotionWall({ id, data }: { id?: string; data: WallData | null }) {
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    videoRefs.current.forEach((video, index) => {
      if (!video) return;
      const panel = PANELS[index];
      const beginPlayback = () => {
        video.muted = true;
        video.defaultMuted = true;
        video.playbackRate = panel.speed;
        void video.play().catch(() => undefined);
      };
      if (video.readyState >= 3) beginPlayback();
      video.addEventListener("canplay", beginPlayback);
      cleanups.push(() => video.removeEventListener("canplay", beginPlayback));
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  // Six video textures decode continuously; only the ones on screen should. Pause when the wall
  // is scrolled away or the tab is hidden, resume when it is back.
  useEffect(() => {
    const sync = () => {
      const shouldPlay = inView && !document.hidden;
      videoRefs.current.forEach((video) => {
        if (!video) return;
        if (shouldPlay) void video.play().catch(() => undefined);
        else video.pause();
      });
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [inView]);

  return (
    <section ref={sectionRef} id={id} className={`${styles.scene} ${inView ? "" : styles.quiet}`} aria-labelledby="wall-heading">
      <div className={styles.wall}>
        {PANELS.map((panel, index) => (
          <article className={styles.panel} key={panel.eyebrow}>
            {panel.src ? (
              <video
                ref={(node) => {
                  videoRefs.current[index] = node;
                }}
                className={styles.video}
                src={panel.src}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                disablePictureInPicture
                tabIndex={-1}
              />
            ) : (
              <div className={styles.poster} />
            )}
            <div className={styles.copy}>
              <p className={styles.eyebrow}>{panel.eyebrow}</p>
              <p className={styles.title}>
                {panel.title.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </p>
              {panel.footer ? <p className={styles.footer}>{panel.footer}</p> : null}
              <PanelArt index={index} data={data} />
            </div>
          </article>
        ))}
      </div>

      <div className={styles.vignette} aria-hidden />

      <div className={styles.glass}>
        <div className={styles.reflection} aria-hidden />
        <div className={styles.glassCopy}>
          <p className={styles.intro}>
            You get a plan, the reasons behind each step, and a mentor who rewrites it when you push back.
          </p>
          <h2 id="wall-heading" className={styles.heading}>
            <span>Six things</span>
            <span>a course list</span>
            <span>never does.</span>
          </h2>
          <p className={styles.wordmark}>{IDEA_NAME.toUpperCase()}</p>
        </div>
      </div>

      <div className={`${styles.grain} bg-noise`} aria-hidden />
    </section>
  );
}
