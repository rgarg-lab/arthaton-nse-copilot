"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./arcdeck.module.css";
import { FOCUS_THRESHOLD, useInView } from "./useInView";
import { IDEA_NAME } from "@/lib/config/client";

type Theme = "ink" | "paper" | "signal";
type Art =
  "count" | "process" | "portal" | "pulse" | "statement" | "brief" | "orbit";

interface CardData {
  theme: Theme;
  type: Art;
  kicker: string;
  title: string;
  /** One line that stays readable even when the next card overlaps this one. */
  sub: string;
}

/**
 * A cover card plus the six steps from raw prices to a call the model is willing to make.
 *
 * The deck itself — the stacking, the scroll-driven arc, the card art — is the shell's and
 * is untouched. Only the copy changed: it described a course-planning pipeline, and these
 * are the six stages this project's pipeline actually has. Each one is a real stage you can
 * find in `ml/src/copilot/`, in this order.
 *
 * No figures here on purpose. The deck explains *how*; the measured numbers are the
 * counting strip below it and the model card, both of which read the artifact.
 */
const CARDS: CardData[] = [
  {
    theme: "signal",
    type: "count",
    kicker: "OVERVIEW",
    title: "Six steps",
    sub: "How eleven years of prices become one honest call — or a refusal",
  },
  {
    theme: "ink",
    type: "process",
    kicker: "STEP / 01",
    title: "Ingest the basket",
    sub: "Eighteen NSE large-caps and eight macro series since 2015, cached to disk, never fetched on a request.",
  },
  {
    theme: "paper",
    type: "portal",
    kicker: "STEP / 02",
    title: "Make it scale-free",
    sub: "Ratios, z-scores and ranks — no raw prices, no close lags. That is what makes pooling 18 names valid.",
  },
  {
    theme: "ink",
    type: "pulse",
    kicker: "STEP / 03",
    title: "Split it honestly",
    sub: "Purged walk-forward on dates, a five-session embargo, and preprocessing refit inside every fold.",
  },
  {
    theme: "signal",
    type: "brief",
    kicker: "STEP / 04",
    title: "Calibrate the probability",
    sub: "Isotonic regression on out-of-fold predictions, so a stated probability is the rate those calls came in at.",
  },
  {
    theme: "paper",
    type: "statement",
    kicker: "STEP / 05",
    title: "Choose when to shut up",
    sub: "A conviction threshold picked on validation, then frozen — so it can never be tuned to look better.",
  },
  {
    theme: "ink",
    type: "orbit",
    kicker: "STEP / 06",
    title: "Measure it once, in public",
    sub: "One holdout, read exactly once, against four baselines. The ledger is committed so you can check.",
  },
];

const STEPS = CARDS.length - 1;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** Card 01's chips: what actually goes into the panel. */
const INTAKE = [
  { label: "UNIVERSE", value: "18 NSE large-caps" },
  { label: "MACRO", value: "Nifty · VIX · USD/INR · S&P" },
  { label: "SINCE", value: "2015 · ~50k rows" },
  { label: "SENTIMENT", value: "FinBERT, shifted a session" },
];

/**
 * Card 03's bars: which features the model actually leans on.
 *
 * The template's version of this panel hard-coded six invented decimals under labels like
 * "Learners' next". These are read from `ml/artifacts/feature_importance.json`, which is
 * gain-based importance taken off the fitted booster — passed in by `app/page.tsx` so this
 * component still has no data access of its own.
 *
 * `value` here is the share of total gain, already normalised to 0–1 by `train.py`, which
 * is exactly what the bar width wants. Nothing is computed in this file.
 */
export type ImportanceRow = { label: string; value: number };

/** What the panel shows before the artifact arrives, or if the service is down: nothing. */
const NO_IMPORTANCE: ImportanceRow[] = [];

/**
 * Card 05's mini graph: the actual data flow, in the shell's node style.
 *
 * It was a slice of the template's skill taxonomy (Python → SQL → Cloud → DevOps). This is
 * the pipeline in `ml/src/copilot/`, top to bottom: the three committed inputs, the two
 * things fit on them, and the three things that come out. The `level` chip carries the
 * stage rather than a skill level.
 */
const DAG = {
  nodes: [
    { label: "Prices", level: "IN", x: 96, y: 4 },
    { label: "Macro", level: "IN", x: 174, y: 4 },
    { label: "Features", level: "58", x: 18, y: 48 },
    { label: "Folds", level: "WF", x: 96, y: 48 },
    { label: "Model", level: "GBM", x: 174, y: 48 },
    { label: "Calibrator", level: "ISO", x: 252, y: 48 },
    { label: "Panel", level: "50k", x: 18, y: 92 },
    { label: "Holdout", level: "1×", x: 96, y: 92 },
    { label: "Signal", level: "OUT", x: 174, y: 92 },
    { label: "Abstain", level: "OUT", x: 252, y: 92 },
  ],
  edges: [
    [0, 2],
    [0, 3],
    [1, 4],
    [1, 5],
    [2, 6],
    [3, 7],
    [4, 8],
    [5, 8],
    [3, 9],
  ] as [number, number][],
};

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function CardArt({
  card,
  importance = NO_IMPORTANCE,
}: {
  card: CardData;
  importance?: ImportanceRow[];
}) {
  switch (card.type) {
    case "count":
      return (
        <>
          <div className={styles.micro}>
            PYTHON COMPUTES THE PROBABILITY.
            <br />
            THE AI ONLY EXPLAINS IT.
          </div>
          <strong className={styles.giant}>{STEPS}</strong>
          <i className={styles.rule} />
        </>
      );
    case "process":
      return (
        <>
          <div className={styles.intake}>
            {INTAKE.map((row, index) => (
              <p key={row.label}>
                <span>{index + 1}</span>
                <b>{row.label}</b>
                <em>{row.value}</em>
              </p>
            ))}
          </div>
        </>
      );
    case "portal":
      return (
        <>
          <svg className={styles.radar} viewBox="0 0 100 100" aria-hidden>
            <polygon
              className={styles.radarGrid}
              points="50,6 88,28 88,72 50,94 12,72 12,28"
            />
            <polygon
              className={styles.radarGrid}
              points="50,28 69,39 69,61 50,72 31,61 31,39"
            />
            <polygon
              className={styles.radarRequired}
              points="50,10 84,30 82,70 50,90 16,68 18,32"
            />
            <polygon
              className={styles.radarKnown}
              points="50,34 64,42 62,60 50,64 36,58 38,42"
            />
            {/* The outer ring is the raw columns a naive pipeline would feed a tree;
                the inner one is what survives the scale-free rule. */}
            <text className={styles.radarLabel} x="50" y="4" textAnchor="middle">
              RAW
            </text>
            <text className={styles.radarLabel} x="50" y="51" textAnchor="middle">
              SCALE-FREE
            </text>
          </svg>
        </>
      );
    case "pulse":
      /**
       * Bars are scaled to the *largest* share, not to 1.0. Gain shares on 58 features are
       * all small — the top one is around 0.15 — so scaling to an absolute 1.0 would draw
       * six slivers. Relative widths are what the panel is for; the printed value is the
       * true share either way.
       */
      return importance.length === 0 ? null : (
        <div className={styles.score}>
          {importance.map((row) => (
            <p key={row.label}>
              <span>
                <b>{row.label}</b>
                <i
                  style={
                    {
                      "--w": `${(row.value / (importance[0]?.value || 1)) * 100}%`,
                    } as React.CSSProperties
                  }
                />
                <em>{row.value.toFixed(3)}</em>
              </span>
            </p>
          ))}
        </div>
      );
    case "statement":
      return (
        <>
          <svg className={styles.dag} viewBox="0 0 332 118" aria-hidden>
            <defs>
              <marker
                id="dagArrow"
                markerWidth="4"
                markerHeight="4"
                refX="3"
                refY="2"
                orient="auto"
              >
                <path d="M0 0 L4 2 L0 4 z" fill="rgb(0 0 0 / 42%)" />
              </marker>
            </defs>
            {DAG.edges.map(([from, to]) => {
              const a = DAG.nodes[from];
              const b = DAG.nodes[to];
              return (
                <path
                  key={`${from}-${to}`}
                  className={styles.dagEdge}
                  markerEnd="url(#dagArrow)"
                  d={`M ${a.x + 38} ${a.y + 20} C ${a.x + 38} ${a.y + 32}, ${b.x + 38} ${b.y - 12}, ${b.x + 38} ${b.y - 2}`}
                />
              );
            })}
            {DAG.nodes.map((node) => (
              <g key={node.label} transform={`translate(${node.x} ${node.y})`}>
                <rect
                  className={styles.dagNode}
                  width="76"
                  height="20"
                  rx="10"
                />
                <circle className={styles.dagTick} cx="10" cy="10" r="3.5" />
                <text className={styles.dagLabel} x="17" y="13.5">
                  {node.label}
                </text>
                <text className={styles.dagLevel} x="70" y="13.5">
                  {node.level}
                </text>
              </g>
            ))}
          </svg>
        </>
      );
    case "brief":
      return (
        <>
          <div className={styles.columns}>
            <p>
              EACH PICK
              <br />
              <b>MOST GAP PER HOUR</b>
            </p>
            <p>
              STOPS WHEN
              <br />
              <b>THE GAP IS CLOSED</b>
            </p>
            <p>
              OR WHEN
              <br />
              <b>YOUR HOURS RUN OUT</b>
            </p>
          </div>
        </>
      );
    default:
      return (
        <div className={styles.diff}>
          {/* The once-only holdout, and the thing that makes it checkable. */}
          <p>
            <b>HOLDOUT</b>
            <strong>read once</strong>
          </p>
          <p>
            <b>NOT</b>
            <em>
              <s>tuned, then re-measured</s>
            </em>
          </p>
          <p>
            <b>PROOF</b>
            <em>a committed ledger</em>
          </p>
        </div>
      );
  }
}

function ArcCard({
  card,
  index,
  slot,
  width,
  motion,
  isHovered,
  hiddenCopy,
  onHoverChange,
  onChoose,
  importance,
}: {
  card: CardData;
  importance?: ImportanceRow[];
  index: number;
  /** Looped duplicate — hidden from assistive tech so the deck reads as one set. */
  hiddenCopy: boolean;
  slot: number;
  width: number;
  motion: number;
  isHovered: boolean;
  onHoverChange: (hovered: boolean) => void;
  onChoose: () => void;
}) {
  // Every card sits on one shared circle; no card animates independently.
  const theta = ((-20 + slot * 10.5) * Math.PI) / 180;
  const radius = width * 1.868;
  const centerX = -width * 1.322;
  const centerY = width * 0.812;
  const x = centerX + radius * Math.cos(theta);
  const y = centerY + radius * Math.sin(theta);
  const edge = Math.max(0, Math.abs(slot - 2) - 3.15);
  const visible = slot > -2.2 && slot < 6.2;

  const side = clamp(Math.abs(slot - 2) / 2.6, 0, 1);
  const travel = clamp(motion, -1, 1);
  const travelStrength = Math.abs(travel) * (0.34 + side * 0.66);
  const slipX = travel * width * 0.009 * side;
  const peelY = -travelStrength * width * 0.014;
  const counterRotation = travel * (slot < 2 ? -1 : 1) * (0.7 + side * 1.8);
  const travelScale = 1 + travelStrength * 0.012;

  return (
    <article
      className={`${styles.card} ${styles[card.theme]}`}
      aria-label={card.title}
      aria-hidden={hiddenCopy}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onClick={onChoose}
      style={{
        // Rounded so server and client serialise the same strings (the CSSOM trims long floats).
        opacity: visible ? r3(clamp(1 - edge * 0.52, 0, 1)) : 0,
        filter: `blur(${r3(edge * (2.5 + Math.abs(travel) * 1.4))}px)`,
        pointerEvents: visible ? "auto" : "none",
        zIndex: isHovered ? 1000 : Math.round((slot + 3) * 10),
        transform: `translate3d(${r3(x)}px,${r3(y)}px,0) translate(-50%,-50%) rotate(${r3(theta)}rad)`,
      }}
    >
      <div
        className={styles.cardMotion}
        style={{
          transform: `translate3d(${r3(slipX)}px,${r3(peelY)}px,0) rotate(${r3(counterRotation)}deg) scale(${r3(travelScale)})`,
        }}
      >
        <div className={styles.cardSurface}>
          <header>
            <span>{card.kicker}</span>
            <span>
              {index === 0
                ? "INTRO"
                : `${String(index).padStart(2, "0")} / ${String(STEPS).padStart(2, "0")}`}
            </span>
          </header>
          <h3>{card.title}</h3>
          <p className={styles.sub}>{card.sub}</p>
          <CardArt card={card} importance={importance} />
        </div>
      </div>
    </article>
  );
}

/**
 * `importance` is the top handful of features by gain share, read from
 * `ml/artifacts/feature_importance.json` by `app/page.tsx`. Optional: with the ML service
 * down that card simply shows no bars rather than placeholder ones.
 */
export function ArcDeck({ id, importance }: { id?: string; importance?: ImportanceRow[] }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, "0px", FOCUS_THRESHOLD);
  const value = useRef(-1);
  const target = useRef(-1);
  const velocity = useRef(0);
  const visualMotion = useRef(0);
  const lastFrameValue = useRef(-1);
  const manual = useRef(false);
  const dragging = useRef(false);
  const dragged = useRef(false);
  const startY = useRef(0);
  const startValue = useRef(0);
  const [position, setPosition] = useState(-1);
  const [motion, setMotion] = useState(0);
  const [stageWidth, setStageWidth] = useState(234);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

  useEffect(() => {
    const measure = () => setStageWidth(stageRef.current?.clientWidth || 234);
    measure();
    const observer = new ResizeObserver(measure);
    if (stageRef.current) observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    let frame = 0;
    const started = performance.now() - (lastFrameValue.current + 1) * 2100;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (now: number) => {
      if (!manual.current) {
        const time = reduced ? 0 : ((now - started) % 5300) / 1000;
        let next = -1;
        if (time < 2.1) next = -1 + easeInOutCubic(time / 2.1);
        else if (time < 3.72) next = 0;
        else next = -easeInOutCubic((time - 3.72) / 1.58);
        value.current = next;
      } else if (!dragging.current) {
        const delta = target.current - value.current;
        velocity.current = (velocity.current + delta * 0.105) * 0.72;
        value.current += velocity.current;
        if (Math.abs(delta) < 0.0005 && Math.abs(velocity.current) < 0.0005) {
          value.current = target.current;
          velocity.current = 0;
        }
        if (Math.abs(value.current) > CARDS.length) {
          const cycle = Math.round(value.current / CARDS.length) * CARDS.length;
          value.current -= cycle;
          target.current -= cycle;
        }
      }

      let frameDelta = value.current - lastFrameValue.current;
      frameDelta -= Math.round(frameDelta / CARDS.length) * CARDS.length;
      lastFrameValue.current = value.current;
      const requestedMotion = clamp(frameDelta * 28, -1, 1);
      const motionResponse =
        Math.abs(requestedMotion) > Math.abs(visualMotion.current)
          ? 0.38
          : 0.115;
      visualMotion.current +=
        (requestedMotion - visualMotion.current) * motionResponse;
      if (Math.abs(visualMotion.current) < 0.0005) visualMotion.current = 0;
      if (frameDelta !== 0 || visualMotion.current !== 0) {
        setPosition(value.current);
        setMotion(visualMotion.current);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView]);

  const takeControl = useCallback(() => {
    manual.current = true;
    target.current = value.current;
  }, []);

  const moveOne = useCallback(
    (direction: number) => {
      takeControl();
      target.current = Math.round(target.current) + direction;
    },
    [takeControl],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    takeControl();
    dragging.current = true;
    dragged.current = false;
    startY.current = event.clientY;
    startValue.current = value.current;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragging.current) return;
    const delta = event.clientY - startY.current;
    if (Math.abs(delta) > 5) dragged.current = true;
    value.current = startValue.current + delta / (stageWidth * 0.34);
    target.current = value.current;
  };

  const onPointerUp = (event: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    target.current = Math.round(value.current);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const logicalCards = Array.from({ length: 19 }, (_, index) => index - 7);

  return (
    <section
      ref={sectionRef}
      id={id}
      className={styles.section}
      aria-label={`How ${IDEA_NAME} works`}
    >
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>
            From eleven years of prices to one honest call, in six steps.
          </h2>
        </div>
        <div className={styles.controls}>
          <span className={styles.hint} aria-hidden>
            <span className={styles.dragWord}>DRAG</span>
            <i />
            <span>CLICK A CARD</span>
          </span>
          <button
            type="button"
            className={styles.control}
            onClick={() => moveOne(1)}
            aria-label="Previous step"
          >
            <ArrowLeft size={16} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className={styles.control}
            onClick={() => moveOne(-1)}
            aria-label="Next step"
          >
            <ArrowRight size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className={styles.stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {logicalCards.map((logical) => {
          const dataIndex =
            ((logical % CARDS.length) + CARDS.length) % CARDS.length;
          const slot = logical + position;
          return (
            <ArcCard
              key={logical}
              card={CARDS[dataIndex]}
              importance={importance}
              index={dataIndex}
              hiddenCopy={logical < 0 || logical >= CARDS.length}
              slot={slot}
              width={stageWidth}
              motion={motion}
              isHovered={hoveredCard === logical}
              onHoverChange={(hovered) =>
                setHoveredCard(hovered ? logical : null)
              }
              onChoose={() => {
                if (!dragged.current) moveOne(2 - Math.round(slot));
              }}
            />
          );
        })}
      </div>
    </section>
  );
}
