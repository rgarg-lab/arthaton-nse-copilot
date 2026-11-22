/**
 * The voice-over, as data.
 *
 * One source for three consumers: the burned-in captions, `audio/VO_SCRIPT.md`
 * which the author records against, and the timing check in
 * `analysis/check_script.py`.
 *
 * **The shipped mix has no voice track.** An earlier cut carried a synthesised
 * scratch voice under the music bed; the two were hard to separate and the
 * speech was not clear (BUILD_LOG D8.3). So the bed plays alone and these lines
 * are burned in as captions instead — readable, unambiguous, and honest about
 * the fact that nobody has narrated this yet. When the author records a take,
 * `build_audio.py` drops it in against these same timings and nothing in the
 * edit moves.
 *
 * Timings are the in/out points of `SCRIPT.md`.
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
  { id: "1.2", from: 4, to: 9, text: "This one tells you when it doesn't." },
  {
    id: "1.3",
    from: 9,
    to: 14,
    text: "And it shows you the measurement that earns the refusal.",
  },
  {
    id: "1.4",
    from: 14,
    to: 21,
    text: "This is it, running. Eighteen NSE large caps.",
  },
  {
    id: "1.5",
    from: 21,
    to: 28,
    text: "One question each — and a refusal when conviction is low.",
  },
  {
    id: "2.1",
    from: 28,
    to: 33,
    text:
      "Open any retail equity app in India and there is always a number. " +
      "A target price. A buy badge. A confidence score.",
  },
  {
    id: "2.2",
    from: 33,
    to: 37,
    text: "It is there whether or not anything about tomorrow is actually knowable.",
  },
  {
    id: "2.3",
    from: 37,
    to: 44,
    text: "Next-session direction on large caps is close to a coin flip.",
  },
  {
    id: "3",
    from: 44,
    to: 55,
    text:
      "NSE Copilot runs two independent heads over a fixed basket of large caps — " +
      "one asks which way tomorrow goes, the other asks how big the move will be. " +
      "They are never merged.",
  },

  // 3.5 — one real call, queried from the committed walk-forward predictions.
  {
    id: "3.5",
    from: 55,
    to: 72,
    text:
      "One real call. April twenty-sixth, twenty twenty-two: Bajaj Finance, " +
      "called down at sixty point nine percent. Next session it fell seven " +
      "point two seven. Not luck — that band was calibrated.",
  },

  // 4. The demo. The product being used, not described.
  {
    id: "4.1",
    from: 72,
    to: 80,
    text: "This is the real thing. The Copilot, its working, and the panes it reads from.",
  },
  {
    id: "4.2",
    from: 80,
    to: 93,
    text:
      "So let's ask it about Bajaj Finance — the name it just got right — and watch " +
      "which tools it reaches for.",
  },
  // The payoff of beat 3.5. It refuses the very name it was right about.
  {
    id: "4.3",
    from: 93,
    to: 105,
    text:
      "And it says no. Same name, same model — today's conviction sits under the same " +
      "frozen gate. Being right once does not buy it an answer every time.",
  },
  {
    id: "4.4",
    from: 105,
    to: 116,
    text: "Ask about one that clears the gate, and it answers, with the number attached.",
  },
  { id: "4.5", from: 116, to: 119, text: "That is the refusal, in full." },
  {
    id: "4.6",
    from: 123,
    to: 139,
    text:
      "Beside the chat: today's board, the closest historical sessions, and the model " +
      "card it quotes against itself.",
  },
  {
    id: "4.7",
    from: 139,
    to: 146,
    text: "Your own names, each one called or declined.",
  },
  {
    id: "4.8",
    from: 146,
    to: 152,
    text: "What it remembers, and what it retrieved to answer you.",
  },
  {
    id: "4.9",
    from: 152,
    to: 160,
    text:
      "Every figure on the model card is read from one committed artifact — accuracy by " +
      "confidence, and what each band costs in coverage.",
  },
  {
    id: "4.10",
    from: 160,
    to: 167,
    text: "And nothing is ever sent without an approval.",
  },

  // 5. Why believe it.
  {
    id: "5.1",
    from: 167,
    to: 177,
    text:
      "Why believe any of it. Four expanding training windows, split on dates, " +
      "with a five-session embargo — because the label for today is tomorrow's move.",
  },
  {
    id: "5.2",
    from: 177,
    to: 181,
    text: "Then one final holdout, read exactly once, with a committed ledger.",
  },
  {
    id: "5.3",
    from: 181,
    to: 188,
    text: "Isotonic calibration is what makes this a probability at all.",
  },
  {
    id: "5.4",
    from: 188,
    to: 192,
    text: "And here is what it beats — four baselines, on the identical split.",
  },

  // 6. Honesty.
  {
    id: "6.1",
    from: 192,
    to: 199,
    text: "Forced to call every session, it is right half the time. That is the honest floor.",
  },
  {
    id: "6.2",
    from: 199,
    to: 205,
    text: "Every configuration in the published search failed to beat it.",
  },
  {
    id: "6.3",
    from: 205,
    to: 215,
    text:
      "The usable product is the accuracy on the sessions where conviction clears " +
      "the gate — and knowing which sessions those are.",
  },

  // 7. Close.
  {
    id: "7.1",
    from: 215,
    to: 220,
    text: "Paper trading and historical analysis only. Not investment advice.",
  },
  {
    id: "7.2",
    from: 220,
    to: 227,
    text: "I would rather tell you that than show you a number I invented.",
  },
];

export const voWordCount = VO.reduce(
  (n, l) => n + l.text.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length,
  0,
);
