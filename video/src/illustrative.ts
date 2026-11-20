/**
 * INVENTED FIGURES. NOT MEASUREMENTS. NOT ABOUT ANY REAL PRODUCT.
 *
 * Beat 2.1 of `SCRIPT.md` depicts the genre this project is arguing against: a
 * wall of confident-looking target prices and confidence scores of the sort
 * every retail equity app shows. Those numbers have to be invented, because
 * putting a real competitor's real figures on screen would be a different and
 * worse problem.
 *
 * They live here, alone, in a file whose name and header say what they are, for
 * two reasons:
 *
 *  1. `honesty.test.ts` scans `scenes/` and `three/` for metric-shaped literals
 *     and must keep failing on them. Quarantining these keeps the rule strict
 *     instead of adding an exemption that would also hide a real mistake.
 *  2. The one place in the film with unsourced numbers should be a single file
 *     that is obvious in a diff.
 *
 * The scene renders them greyed, and stamps "Illustrative · invented figures ·
 * depicts the genre, not any real product" across the top of the frame for the
 * entire beat.
 */
export type IllustrativeCard = {
  k: string;
  badge: string;
  figure: string;
  sub: string;
};

export const ILLUSTRATIVE_CERTAINTIES: IllustrativeCard[] = [
  { k: "a", badge: "STRONG BUY", figure: "₹3,240", sub: "target price" },
  { k: "b", badge: "BUY", figure: "92%", sub: "confidence score" },
  { k: "c", badge: "ACCUMULATE", figure: "+18.4%", sub: "upside" },
  { k: "d", badge: "BUY", figure: "₹1,880", sub: "target price" },
  { k: "e", badge: "OUTPERFORM", figure: "87%", sub: "AI confidence" },
  { k: "f", badge: "STRONG BUY", figure: "+24%", sub: "12-month view" },
  { k: "g", badge: "BUY", figure: "95%", sub: "signal strength" },
  { k: "h", badge: "ACCUMULATE", figure: "₹980", sub: "target price" },
];

export const ILLUSTRATIVE_NOTICE =
  "Illustrative · invented figures · depicts the genre, not any real product";
