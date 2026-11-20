/**
 * The voice-over, as data.
 *
 * One source for three consumers: the burned-in captions, the VO scratch
 * timeline, and `audio/VO_SCRIPT.md` which the author records against. Keeping
 * them in one place is what makes "swap in the real take" a one-file change
 * rather than a re-sync.
 *
 * Timings are the in/out points of `SCRIPT.md`, validated by
 * `analysis/check_script.py`. Line text must match that table exactly — the
 * caption check in Stage 7 compares the rendered captions back to this file.
 */
export type VoLine = {
  /** Beat id in SCRIPT.md. */
  id: string;
  /** Seconds. */
  from: number;
  to: number;
  text: string;
};

export const VO: VoLine[] = [
  { id: "1.1", from: 0, to: 4, text: "Most stock tools always have an answer." },
  { id: "1.2", from: 4, to: 9, text: "This one tells you when it doesn't —" },
  {
    id: "1.3",
    from: 9,
    to: 15,
    text: "and it can show you the measurement that earns the refusal.",
  },
  {
    id: "2.1",
    from: 15,
    to: 21,
    text:
      "Open any retail equity app in India and there is always a number. " +
      "A target price. A buy badge. A confidence score.",
  },
  {
    id: "2.2",
    from: 21,
    to: 27,
    text: "It is there whether or not anything about tomorrow is actually knowable.",
  },
  {
    id: "2.3",
    from: 27,
    to: 35,
    text: "Next-session direction on large caps is close to a coin flip.",
  },
  {
    id: "3.1",
    from: 35,
    to: 43,
    text:
      "NSE Copilot runs two independent heads over a fixed basket of eighteen large caps.",
  },
  {
    id: "3.2",
    from: 43,
    to: 49,
    text: "One asks which way tomorrow goes. The other asks how big the move will be.",
  },
  {
    id: "3.3",
    from: 49,
    to: 55,
    text: "They are never merged, and on today's board direction calls nothing at all.",
  },
  {
    id: "4.1",
    from: 55,
    to: 62,
    text: "This is the real app. Today's board, every name in the committed panel.",
  },
  {
    id: "4.2",
    from: 62,
    to: 69,
    text: "The model only speaks when its calibrated conviction clears sixty percent —",
  },
  {
    id: "4.3",
    from: 69,
    to: 75,
    text:
      "a threshold chosen on validation data and frozen before the final holdout was ever read.",
  },
  {
    id: "4.4",
    from: 75,
    to: 81,
    text: "So open one it declined. This is not a weak buy.",
  },
  // The abstention: the line lands early and the rest of the beat is silence.
  { id: "4.5", from: 81, to: 84, text: "There is no direction here at all." },
  {
    id: "4.6",
    from: 88,
    to: 96,
    text:
      "When it abstains the API omits the direction field entirely — " +
      "a client cannot render a call it was never given.",
  },
  {
    id: "4.7",
    from: 96,
    to: 110,
    text:
      "And the refusal comes with evidence: the past sessions whose market state " +
      "most resembles today's, with real dates and the real return that followed each one.",
  },
  {
    id: "5.1",
    from: 110,
    to: 122,
    text:
      "Why believe any of it. Four expanding training windows, split on dates, " +
      "with a five-session embargo between train and validation — " +
      "because the label for today is tomorrow's move.",
  },
  {
    id: "5.2",
    from: 122,
    to: 130,
    text:
      "Then one final holdout, read exactly once, with a committed ledger so you can check that claim.",
  },
  {
    id: "5.3",
    from: 130,
    to: 136,
    text: "Isotonic calibration is what makes this a probability at all.",
  },
  {
    id: "5.4",
    from: 136,
    to: 140,
    text: "And here is what it beats — four baselines, on the identical split.",
  },
  {
    id: "6.1",
    from: 140,
    to: 147,
    text:
      "Fifty-one point four percent on the holdout. That is the honest number and it is the point.",
  },
  {
    // Deliberately not a number. MODEL_CARD §6 says "29 configurations"; the
    // committed stage artifacts yield 28 distinct names, and the scene renders
    // the artifact's count because the artifact is the authority. Speaking a
    // different number from the one on screen is exactly the sloppiness this
    // video argues against, so the line states the fact and lets the frame
    // carry the count.
    id: "6.2",
    from: 147,
    to: 153,
    text: "Every configuration in the published search failed to beat it.",
  },
  {
    id: "6.3",
    from: 153,
    to: 165,
    text:
      "The usable product is not the headline — it is the accuracy on the small share " +
      "of sessions where conviction clears the gate, and knowing which sessions those are.",
  },
  {
    id: "7.1",
    from: 165,
    to: 171,
    text: "Paper trading and historical analysis only. Not investment advice.",
  },
  {
    id: "7.2",
    from: 171,
    to: 180,
    text:
      "It is right about half the time, and I would rather tell you that " +
      "than show you a number I invented.",
  },
];

export const voWordCount = VO.reduce(
  (n, l) => n + l.text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length,
  0,
);
