import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { Capture } from "./components/Capture";
import { Captions } from "./components/Captions";
import { Chrome } from "./components/Chrome";
import { ReFrame } from "./components/ReFrame";
import { plan, type ReframePlan } from "./reframePlan";
import { Soundtrack } from "./components/Soundtrack";
import { CloseCard, DisclaimerCard } from "./scenes/Close";
import { Baselines, FailedSearch, HonestNumber } from "./scenes/Evidence";
import { HookOne, HookTitle, HookTwo } from "./scenes/Hook";
import { CoinFlip, ProblemWall } from "./scenes/Problem";
import { board, headline } from "./data";
import { color, sec } from "./theme";
import { Abstention } from "./three/Abstention";
import { CalibrationRibbon } from "./three/CalibrationRibbon";
import { ConfidenceLadder } from "./three/ConfidenceLadder";
import { UniverseGrid } from "./three/UniverseGrid";
import { WalkForward } from "./three/WalkForward";

/**
 * The submission timeline. Every row here is a row of `SCRIPT.md`, in order,
 * with the same in/out points — `analysis/check_script.py` validates that table
 * and this file is its implementation.
 *
 * The reference cuts hard and animates inside shots (STYLE_SPEC.md §4), so
 * these are bare `<Sequence>` boundaries with no transition components between
 * them. That is deliberate, not an omission.
 */

type Beat = {
  id: string;
  from: number;
  to: number;
  el: React.ReactNode;
  /**
   * Seconds within the beat at which to re-frame. See `<ReFrame>`: a long shot
   * that has to stay continuous for its own sake (a 3D camera move, a capture
   * scroll) is split into several framings of itself, which is how the
   * reference reaches a 1.91 s mean shot without cutting away from an idea.
   */
  reframe?: number[];
  scales?: number[];
  origins?: string[];
};

const B = (
  id: string,
  from: number,
  to: number,
  el: React.ReactNode,
  p?: ReframePlan,
): Beat => ({
  id,
  from,
  to,
  el,
  reframe: p?.at,
  scales: p?.scales,
  origins: p?.origins,
});

export const Main: React.FC = () => {
  const beats: Beat[] = [
    // 1. HOOK
    B("1.1", 0, 4, <HookOne />),
    B("1.2", 4, 9, <HookTwo />),
    B(
      "1.3",
      9,
      15,
      <HookTitle />,
      plan(6, 4, 1),
    ),

    // 2. PROBLEM
    B(
      "2.1",
      15,
      21,
      <ProblemWall />,
      plan(6, 5, 2),
    ),
    B(
      "2.2",
      21,
      27,
      <ProblemWall dropAway />,
      plan(6, 5, 5),
    ),
    B(
      "2.3",
      27,
      35,
      <CoinFlip />,
      plan(8, 6, 3),
    ),

    // 3. WHAT IT IS — one continuous 3D move across three beats, so the
    // camera is not restarted at each cut. Re-framed six times so a 20 s
    // continuous move still cuts at the reference's rhythm.
    B(
      "3",
      35,
      55,
      <UniverseGrid />,
      plan(20, 13, 0),
    ),

    // 4. DEMO — the real app
    B(
      "4.1",
      55,
      62,
      <Capture
        name="signals-board"
        caption={`/signals · ${board.count} names · ${board.abstained} abstentions`}
      />,
      plan(7, 4, 4),
    ),
    B(
      "4.2",
      62,
      69,
      <Capture
        name="signals-tiles"
        caption={`calls today ${board.signalsEmitted} · abstentions ${board.abstained}`}
      />,
      plan(7, 4, 7),
    ),
    B(
      "4.3",
      69,
      75,
      <Capture
        name="signals-threshold"
        caption={`frozen threshold ${headline.direction.qualifier}`}
      />,
      plan(6, 5, 2),
    ),
    B(
      "4.4",
      75,
      81,
      <Capture name="abstention-card" caption="one card it declined" />,
      plan(6, 4, 6),
    ),

    // 4.5 — THE ABSTENTION. The longest hold in the film, and the only long
    // beat with no re-framing at all: the whole point is that nothing moves.
    B("4.5", 81, 88, <Abstention />),

    B(
      "4.6",
      88,
      96,
      <Capture
        name="abstention-payload"
        caption="the API payload — no `direction` key at all"
      />,
      plan(8, 5, 1),
    ),
    B(
      "4.7",
      96,
      110,
      <Capture
        name="evidence"
        caption="/evidence · real dates, real subsequent returns"
      />,
      plan(14, 9, 3),
    ),

    // 5. HOW IT WORKS — the money shot, then the ledger, then calibration.
    // The vault opens at 12 s into this beat; the re-frames stay off it either
    // side so the reveal lands on a held frame rather than through a cut.
    B(
      "5.1+5.2",
      110,
      130,
      <WalkForward />,
      plan(20, 12, 5),
    ),
    B(
      "5.3",
      130,
      136,
      <CalibrationRibbon />,
      plan(6, 4, 8),
    ),
    B(
      "5.4",
      136,
      140,
      <Baselines />,
      plan(4, 2, 2),
    ),

    // 6. HONESTY
    B(
      "6.1",
      140,
      147,
      <HonestNumber />,
      plan(7, 4, 1),
    ),
    B(
      "6.2",
      147,
      153,
      <FailedSearch />,
      plan(6, 4, 4),
    ),
    B(
      "6.3",
      153,
      165,
      <ConfidenceLadder />,
      plan(12, 8, 6),
    ),

    // 7. CLOSE
    B("7.1", 165, 171, <DisclaimerCard />),
    B(
      "7.2",
      171,
      180,
      <CloseCard />,
      plan(9, 4, 2),
    ),
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: color.bg }}>
      {beats.map((b) => (
        <Sequence
          key={b.id}
          name={b.id}
          from={sec(b.from)}
          durationInFrames={sec(b.to - b.from)}
        >
          {b.reframe ? (
            <ReFrame at={b.reframe} scales={b.scales} origins={b.origins}>
              {b.el}
            </ReFrame>
          ) : (
            b.el
          )}
        </Sequence>
      ))}

      {/* Persistent chrome, over everything, for the whole runtime. */}
      <Chrome />

      {/* Open captions — judges often watch muted. */}
      <Captions />

      {/* VO scratch track + bed. Swapping in the real take is one file. */}
      <Soundtrack />
    </AbsoluteFill>
  );
};
