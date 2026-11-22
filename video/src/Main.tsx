import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Capture } from "./components/Capture";
import { Captions } from "./components/Captions";
import { Chrome } from "./components/Chrome";
import { OVERLAP, StagePanel, type Transition } from "./components/StagePanel";
import { Soundtrack } from "./components/Soundtrack";
import { BotStage } from "./three/BotStage";
import { CloseCard, DisclaimerCard } from "./scenes/Close";
import { Baselines, FailedSearch, HonestNumber } from "./scenes/Evidence";
import { HookTitle } from "./scenes/Hook";
import { ProblemWall } from "./scenes/Problem";
import { AppSlabs } from "./three/props/AppSlabs";
import { CoinFlip3D } from "./three/props/CoinFlip3D";
import { TwoHeads } from "./three/props/TwoHeads";
import { AbstentionReadout } from "./three/props/AbstentionReadout";
import { WorkedExample } from "./three/props/WorkedExample";
import { board, headline } from "./data";
import { color, sec, semantic } from "./theme";
import { CalibrationRibbon } from "./three/CalibrationRibbon";
import { ConfidenceLadder } from "./three/ConfidenceLadder";
import { WalkForward } from "./three/WalkForward";

/**
 * The submission timeline. Every row is a row of `SCRIPT.md`, in order, with
 * the same in/out points — `analysis/check_script.py` validates that table and
 * this file is its implementation.
 *
 * ## The picture holds still
 *
 * An earlier cut wrapped most beats in a `<ReFrame>` that jumped the crop and
 * zoom on a schedule, to raise the detected cut count toward the reference's
 * measured 1.91 s mean shot. It worked as a metric and failed as a film: the
 * frame appeared to zoom in and out at random, which is the first thing a
 * viewer noticed. It is gone (BUILD_LOG D8.1).
 *
 * The cut rate now comes from **real content changes** — twenty-three beats
 * across eight distinct application pages and five 3D set pieces — rather than
 * from moving the camera over a still one. That reads as a slower film than the
 * reference, and `COMPARISON.md` records exactly how much. A stable frame is
 * worth more than a matched statistic.
 */

type Beat = {
  id: string;
  from: number;
  to: number;
  el: React.ReactNode;
  /** How this beat arrives. Defaults to a swipe. */
  enter?: Transition;
  /** How it leaves, under the next beat. Defaults to a swipe. */
  exit?: Transition;
};

const B = (
  id: string,
  from: number,
  to: number,
  el: React.ReactNode,
  enter: Transition = "swipe",
  exit: Transition = "swipe",
): Beat => ({ id, from, to, el, enter, exit });

export const Main: React.FC = () => {
  const beats: Beat[] = [
    // 1. HOOK
    B(
      "1.1",
      0,
      4,
      <AppSlabs lines={["Most stock tools", "always have an answer."]} />,
      "hold",
      "rise",
    ),
    B(
      "1.2",
      4,
      9,
      <AppSlabs
        blanked
        lines={["This one tells you", "when it doesn't."]}
        tone={semantic.abstain}
      />,
      "rise",
      "collapse",
    ),
    B("1.3", 9, 14, <HookTitle />, "collapse", "swipe"),

    // 1.4 / 1.5 — the landing page. Added in v5: it is the best-designed
    // screen in the product and was absent from the first four cuts. Both are
    // genuine recordings of `/` — the hero with the Copilot panel working, then
    // the eighteen-name deck in perspective.
    B(
      "1.4",
      14,
      21,
      <Capture name="landing-hero" caption="the product, stating its own thesis" />, "swipe", "swipe"),
    B(
      "1.5",
      21,
      28,
      <Capture name="landing-deck" caption="/ · the full universe, one question each" />, "swipe", "collapse"),

    // 2. PROBLEM
    B("2.1", 28, 33, <ProblemWall />, "swipe", "scatter"),
    B("2.2", 33, 37, <ProblemWall dropAway />, "scatter", "rise"),
    B("2.3", 37, 44, <CoinFlip3D />, "rise", "collapse"),

    // 3. WHAT IT IS — one continuous 3D camera move, uninterrupted.
    B("3", 44, 55, <TwoHeads />, "collapse", "flip"),

    // 3.5 — one real call, start to finish. The film explained how the product
    // works but never showed it being right about anything. Every figure here
    // is queried from the committed walk-forward predictions by
    // `scripts/build_example.py`; none of it is authored.
    B("3.5", 55, 72, <WorkedExample />, "flip", "collapse"),

    // 4. THE DEMO — the product being used, as one journey.
    //
    // v5 showed eight disconnected page views and never once showed the agent
    // doing anything; /workspace, where the chat and the trace panel live, had
    // never been filmed. Beats 4.1-4.4 are four slices of a single continuous
    // recording of one real conversation.
    B(
      "4.1",
      72,
      80,
      <Capture name="ws-open" caption="/workspace · the Copilot, its trace, and four panes" />, "collapse", "hold"),

    // The callback. Beat 3.5 has just proved it was right about this name in
    // April 2022; asked about it today it declines, because today's conviction
    // is below the same frozen gate. Being right once does not license an
    // answer every time — which is the whole argument of the film, happening
    // live rather than asserted.
    B(
      "4.2",
      80,
      93,
      <Capture name="ws-ask" caption="a real question, and the tools firing" />, "hold", "hold"),
    B(
      "4.3",
      93,
      105,
      <Capture name="ws-refusal" caption="the same name it was right about — declined today" />, "hold", "hold"),
    B(
      "4.4",
      105,
      116,
      <Capture name="ws-call" caption="and one it will call, with the number" />, "hold", "collapse"),

    // 4.5 — the 3D card. No longer the reveal: it explains the refusal the
    // viewer has just watched happen in the chat.
    B("4.5", 116, 123, <AbstentionReadout />, "collapse", "rise"),

    B(
      "4.6",
      123,
      139,
      <Capture name="workspace-tabs" caption="Signals · Evidence · Model card" />, "rise", "swipe"),
    B(
      "4.7",
      139,
      146,
      <Capture name="watchlist" caption="/watchlist · your names, called or declined" />, "swipe", "collapse"),
    B(
      "4.8",
      146,
      152,
      <Capture name="memory" caption="/memory · what it recalls, and why" />, "collapse", "swipe"),
    B(
      "4.9",
      152,
      160,
      <Capture name="dashboard" caption="/dashboard · every figure read from one artifact" />, "swipe", "scatter"),
    B(
      "4.10",
      160,
      167,
      <Capture name="outbox" caption="/outbox · nothing is sent without an approval" />, "scatter", "rise"),

    // 5. HOW IT WORKS
    B("5.1+5.2", 167, 181, <WalkForward />, "rise", "collapse"),
    B("5.3", 181, 188, <CalibrationRibbon />, "collapse", "swipe"),
    B("5.4", 188, 192, <Baselines />, "swipe", "scatter"),

    // 6. HONESTY
    B("6.1", 192, 199, <HonestNumber />, "scatter", "swipe"),
    B("6.2", 199, 205, <FailedSearch />, "swipe", "rise"),
    B("6.3", 205, 215, <ConfidenceLadder />, "rise", "collapse"),

    // 7. CLOSE
    B("7.1", 215, 220, <DisclaimerCard />, "collapse", "swipe"),
    B("7.2", 220, 227, <CloseCard />, "swipe", "hold"),
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: color.bg }}>
      {beats.map((b) => (
        <Sequence
          key={b.id}
          name={b.id}
          from={sec(b.from)}
          // Extended by the overlap so this beat is still mounted, underneath,
          // while the next one arrives. StagePanel animates the handoff.
          durationInFrames={sec(b.to - b.from + OVERLAP)}
        >
          <StagePanel
            durationS={b.to - b.from}
            enter={b.enter ?? "swipe"}
            exit={b.exit ?? "swipe"}
          >
            {b.el}
          </StagePanel>
        </Sequence>
      ))}

      {/* The Copilot. One canvas for the whole film, above the beat content
          and below the chrome, so the character is continuous across every
          cut instead of being rebuilt per beat. */}
      <BotStage />

      {/* Persistent chrome, over everything, for the whole runtime. */}
      <Chrome />

      {/* Open captions — judges often watch muted, and the shipped mix has no
          voice track, so these carry the words. */}
      <Captions />

      <Soundtrack />
    </AbsoluteFill>
  );
};
