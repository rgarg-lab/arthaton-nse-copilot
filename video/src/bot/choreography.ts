import type { Expression, Pose } from "../three/Copilot";
import { defaultPose } from "../three/Copilot";

/**
 * Where the Copilot is, and what it is doing, at every moment of the film.
 *
 * A list of keyframes in **absolute seconds**. The bot's pose at any frame is
 * the eased interpolation between the surrounding two, which is what makes it
 * move continuously rather than snapping at beat boundaries — the whole point
 * of having a character.
 *
 * ## Staging
 *
 * Camera sits at `[0, 0.3, 7.4]`, fov 40, so at z = 0 the visible field is
 * about **x ∈ [-4.8, 4.8], y ∈ [-2.4, 3.0]**. A framed screen capture fills
 * roughly x ∈ [-3.9, 3.9], y ∈ [-2.2, 2.2].
 *
 * So the bot lives at **|x| ≈ 3.4–4.0** during capture beats (beside the panel,
 * never over the data) and comes closer to centre during 3D and text beats
 * where it can own the frame. `z` is used for emphasis: positive z is nearer
 * the camera and reads as bigger.
 *
 * `turn` is kept within ±0.15 — see the note on `Pose.turn`.
 */

export type BotKey = {
  /** Absolute seconds. */
  t: number;
  pose: Partial<Pose> & { position: [number, number, number] };
};

/** Shorthand. */
const k = (
  t: number,
  position: [number, number, number],
  rest: Partial<Pose> = {},
): BotKey => ({ t, pose: { position, ...rest } });

/**
 * The cue sheet. One or more keys per beat; beats that need the bot to *act*
 * (the abstention, the wave) get several.
 */
export const BOT_KEYS: BotKey[] = [
  // --- Act 1: hook. Drifts in from off-stage left. ---------------------
  // Low and left through 1.1-1.2: the serif line owns the upper left and the
  // five app slabs own the right, so the bot takes the corner between them.
  k(0.0, [-6.2, -1.6, 0.3], { scale: 0.7, expression: "neutral" }),
  k(2.2, [-3.6, -1.7, 0.3], { scale: 0.7, expression: "thinking", turn: 0.12 }),
  // "...tells you when it doesn't" — raises a hand, shows the dash, in time
  // with every slab's badge collapsing to the same flat line.
  k(4.8, [-3.4, -1.6, 0.5], { scale: 0.74, expression: "dash", handR: 0.85, abstain: 0.4 }),
  k(8.0, [-3.5, -1.7, 0.3], { scale: 0.72, expression: "neutral", handR: 0.3 }),
  // Title: two-handed lift, presenting.
  k(9.5, [-3.6, -0.7, 0], { scale: 0.8, expression: "present", handL: 0.8, handR: 0.8 }),
  k(13.2, [-3.7, -0.6, 0], { scale: 0.8, expression: "present", handL: 0.6, handR: 0.6 }),

  // --- 1.4 / 1.5: the landing page. Beside the panel, small, never over it.
  k(14.6, [-4.0, -1.5, 0.3], { scale: 0.62, expression: "present", handR: 0.8 }),
  k(20.0, [-4.0, -1.4, 0.3], { scale: 0.62, expression: "present", handR: 0.45 }),
  k(22.0, [4.0, -1.5, 0.3], { scale: 0.62, expression: "thinking", handL: 0.8 }),
  k(27.0, [4.0, -1.4, 0.3], { scale: 0.62, expression: "present", handL: 0.45 }),

  // --- Act 2: the wall of invented certainty. --------------------------
  k(28.4, [3.6, -0.6, 0.2], { scale: 0.82, expression: "thinking", turn: -0.14 }),
  k(32.2, [3.6, -0.5, 0.2], { scale: 0.82, expression: "thinking", turn: -0.1 }),
  // Taps a card; it shatters. Open palms — "there was nothing there".
  k(33.8, [3.3, -0.5, 0.5], { scale: 0.86, expression: "present", handL: 0.9, handR: 0.9 }),
  k(36.6, [3.5, -0.6, 0.2], { scale: 0.82, expression: "neutral" }),
  // The coin flip. Watches it land, shrugs.
  k(38.5, [-3.3, -1.5, 0.3], { scale: 0.76, expression: "thinking", handR: 0.75 }),
  // The coin settles on its edge at ~3.5 s; the bot shrugs rather than calls it.
  k(41.5, [-3.3, -1.4, 0.3], { scale: 0.76, expression: "dash", handL: 0.6, handR: 0.6, abstain: 0.3 }),
  k(43.6, [-3.4, -1.5, 0.2], { scale: 0.74, expression: "neutral", handR: 0.2 }),

  // --- Act 3: the universe, two heads held apart. ----------------------
  k(44.6, [3.7, -0.8, 0], { scale: 0.76, expression: "present", handL: 0.7, handR: 0.7 }),
  k(49.8, [3.8, -0.6, 0], { scale: 0.76, expression: "present", handL: 0.5, handR: 0.8 }),
  k(54.4, [3.8, -0.8, 0], { scale: 0.74, expression: "neutral" }),

  // --- 3.5: the worked example. The scene is dense — a date and conviction
  // bar on the left, the price columns centre-right, the calibration panel
  // across the bottom — so the bot sits small in the bottom-right corner,
  // under the panel, and gestures rather than moves.
  k(55.6, [3.75, -1.8, 0.4], { scale: 0.56, expression: "thinking", handL: 0.7 }),
  k(60.0, [3.75, -1.75, 0.4], { scale: 0.56, expression: "present", handL: 0.9 }),
  k(63.5, [3.7, -1.8, 0.5], { scale: 0.58, expression: "present", handL: 0.6 }),
  k(67.5, [3.75, -1.8, 0.4], { scale: 0.56, expression: "pleased", handL: 0.4 }),
  k(71.0, [3.75, -1.85, 0.3], { scale: 0.55, expression: "neutral", handL: 0.25 }),

  // --- Act 4: the application. Beside the panel, never over it. --------
  // 60.20% — pulls the tile out, holds it up.
  // Watchlist — fans the four cards.
  // The declined card — leans in.

  // --- 4.5 THE ABSTENTION. The centre of the film. ---------------------
  // Comes to centre, front on. Everything else leaves the frame.
  // Left of centre, not on it: from 84 s a full-bleed card carries the words
  // "I don't know." and the bot must stand beside that line, not across it.
  // Visor goes dark, antenna amber, hands drop, turns slightly away.
  // Held. Nothing moves. This is the longest still moment in the film.
  // Recovers.

  // --- Act 4 continued: evidence, model card, outbox. ------------------
  // Outbox — the stamp gesture.

  // --- Act 4: the demo. The bot presents from the margin and stays small —
  // the chat, the trace and the answer are the content here, and a mascot
  // waving over a live refusal would undercut the one beat that has to land.
  k(72.4, [4.0, -1.5, 0.3], { scale: 0.60, expression: "present", handL: 0.8 }),
  k(79.0, [4.0, -1.4, 0.3], { scale: 0.60, expression: "present", handL: 0.45 }),
  // Asking. Leans in slightly while the tools fire.
  k(81.0, [3.95, -1.35, 0.5], { scale: 0.64, expression: "thinking", handL: 0.75, lean: 0.06 }),
  k(91.5, [3.95, -1.4, 0.5], { scale: 0.64, expression: "thinking", handL: 0.5, lean: 0.04 }),
  // The refusal, on the name it was right about. Antenna goes amber, hands
  // down. It does not celebrate and it does not apologise.
  k(94.5, [3.9, -1.5, 0.4], { scale: 0.62, expression: "dash", handL: 0, handR: 0, abstain: 0.9 }),
  k(103.5, [3.9, -1.5, 0.4], { scale: 0.62, expression: "dash", handL: 0, handR: 0, abstain: 0.9 }),
  // And one it will call.
  k(106.5, [4.0, -1.4, 0.4], { scale: 0.63, expression: "present", handL: 0.85, abstain: 0.1 }),
  k(114.5, [4.0, -1.45, 0.3], { scale: 0.62, expression: "present", handL: 0.45 }),

  // --- 4.5 the 3D card. Comes to the left of the line, goes dark. ---------
  k(116.5, [-2.9, -0.8, 0.8], { scale: 0.9, expression: "thinking", handL: 0.5, handR: 0.5 }),
  k(118.6, [-2.9, -0.9, 0.8], { scale: 0.9, expression: "dash", handL: 0, handR: 0, abstain: 1 }),
  k(119.6, [-3.0, -1.0, 0.8], { scale: 0.9, expression: "off", handL: 0, handR: 0, abstain: 1, turn: 0.14 }),
  k(122.4, [-3.0, -1.0, 0.8], { scale: 0.9, expression: "off", abstain: 1, turn: 0.14 }),
  k(123.5, [3.9, -1.5, 0.3], { scale: 0.62, expression: "neutral", abstain: 0.15 }),

  // --- the tour: tabs, watchlist, memory, model card, outbox -------------
  k(125.0, [4.0, -1.5, 0.3], { scale: 0.62, expression: "present", handL: 0.75 }),
  k(137.5, [4.0, -1.4, 0.3], { scale: 0.62, expression: "present", handL: 0.4 }),
  k(140.0, [4.0, -1.4, 0.4], { scale: 0.63, expression: "present", handL: 0.85, handR: 0.5 }),
  k(145.0, [4.0, -1.5, 0.3], { scale: 0.62, expression: "neutral", handL: 0.4 }),
  k(147.0, [3.95, -1.35, 0.5], { scale: 0.64, expression: "thinking", handL: 0.8, lean: 0.06 }),
  k(151.5, [3.95, -1.4, 0.4], { scale: 0.63, expression: "thinking", handL: 0.5 }),
  k(153.0, [4.0, -1.5, 0.3], { scale: 0.62, expression: "present", handL: 0.8 }),
  k(159.0, [4.0, -1.4, 0.3], { scale: 0.62, expression: "present", handL: 0.4 }),
  // Outbox — the stamp gesture.
  k(161.0, [4.0, -1.4, 0.4], { scale: 0.64, expression: "present", handL: 0.95 }),
  k(163.0, [4.0, -1.6, 0.4], { scale: 0.64, expression: "present", handL: 0.35 }),
  k(166.0, [4.0, -1.5, 0.3], { scale: 0.62, expression: "pleased", handL: 0.5 }),

  // --- Act 5: walks the walk-forward axis. -----------------------------
  k(167.8, [-4.0, -1.1, 0.2], { scale: 0.7, expression: "present", handR: 0.85 }),
  k(172.4, [-1.2, -1.1, 0.2], { scale: 0.7, expression: "present", handR: 0.9 }),
  k(175.6, [1.6, -1.1, 0.2], { scale: 0.7, expression: "thinking", handR: 0.9 }),
  // The vault opens — steps back from it.
  k(178.3, [0.2, -1.2, 0.5], { scale: 0.72, expression: "present", handR: 0.3, lean: -0.06 }),
  k(180.6, [0.0, -1.3, 0.3], { scale: 0.7, expression: "neutral" }),
  // Calibration ribbon — holds it, lets it settle.
  k(182.2, [3.5, -1.2, 0.2], { scale: 0.72, expression: "present", handL: 0.85, handR: 0.85 }),
  k(187.4, [3.6, -1.3, 0.2], { scale: 0.72, expression: "neutral", handL: 0.3, handR: 0.3 }),
  // Baselines — pulls the bars up.
  k(188.8, [-3.8, -1.3, 0.2], { scale: 0.72, expression: "present", handR: 0.9 }),
  k(191.5, [-3.8, -1.1, 0.2], { scale: 0.72, expression: "present", handR: 0.5 }),

  // --- Act 6: honesty. Presents the floor flat, no flourish. -----------
  k(193.0, [3.7, -1.2, 0.2], { scale: 0.7, expression: "neutral", handL: 0.6 }),
  k(198.0, [3.7, -1.2, 0.2], { scale: 0.7, expression: "neutral", handL: 0.4 }),
  // Sweeps a hand across the failed search.
  k(200.0, [-3.6, -1.2, 0.3], { scale: 0.72, expression: "thinking", handR: 0.9 }),
  k(204.0, [3.6, -1.2, 0.3], { scale: 0.72, expression: "thinking", handR: 0.5 }),
  // Climbs the confidence ladder.
  k(205.9, [-3.4, -1.6, 0.2], { scale: 0.66, expression: "present", handR: 0.7 }),
  k(210.5, [0.4, -0.6, 0.2], { scale: 0.68, expression: "present", handR: 0.8 }),
  k(214.1, [2.6, 0.1, 0.2], { scale: 0.68, expression: "present", handR: 0.5 }),

  // --- Act 7: close. Waves from the right, NOT from centre.
  // It stood on centre at scale 0.92 for the first 190 s cut and covered four
  // words of the SEBI disclaimer. A legal line that cannot be read is a defect,
  // not a staging preference, so the wave moved off the text.
  k(215.5, [3.6, -1.2, 0.2], { scale: 0.68, expression: "neutral", handL: 0.5 }),
  k(219.5, [3.5, -1.05, 0.9], { scale: 0.8, expression: "pleased", handL: 0.3, handR: 0.95 }),
  // The wave — the pose from the author's reference image.
  k(221.0, [3.5, -1.0, 0.9], { scale: 0.8, expression: "pleased", handL: 0.3, handR: 1, turn: -0.1 }),
  k(222.2, [3.5, -1.05, 0.9], { scale: 0.8, expression: "pleased", handL: 0.3, handR: 0.8, turn: 0.1 }),
  k(223.5, [3.5, -1.0, 0.9], { scale: 0.8, expression: "pleased", handL: 0.3, handR: 1, turn: -0.08 }),
];

const ease = (t: number): number => {
  const c = Math.min(Math.max(t, 0), 1);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/**
 * The bot's pose at a given time.
 *
 * Numeric channels ease between keys. `expression` does **not** blend — it
 * snaps at the midpoint, because a half-way face is a broken face.
 */
export const poseAt = (seconds: number): Pose => {
  const keys = BOT_KEYS;
  if (seconds <= keys[0].t) return { ...defaultPose, ...keys[0].pose };
  const last = keys[keys.length - 1];
  if (seconds >= last.t) return { ...defaultPose, ...last.pose };

  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= seconds) i++;
  const a = { ...defaultPose, ...keys[i].pose };
  const b = { ...defaultPose, ...keys[i + 1].pose };
  const span = keys[i + 1].t - keys[i].t;
  const u = ease(span <= 0 ? 1 : (seconds - keys[i].t) / span);

  return {
    position: [
      lerp(a.position[0], b.position[0], u),
      lerp(a.position[1], b.position[1], u),
      lerp(a.position[2], b.position[2], u),
    ],
    turn: lerp(a.turn, b.turn, u),
    lean: lerp(a.lean, b.lean, u),
    scale: lerp(a.scale, b.scale, u),
    handL: lerp(a.handL, b.handL, u),
    handR: lerp(a.handR, b.handR, u),
    abstain: lerp(a.abstain, b.abstain, u),
    expression: (u < 0.5 ? a.expression : b.expression) as Expression,
  };
};
