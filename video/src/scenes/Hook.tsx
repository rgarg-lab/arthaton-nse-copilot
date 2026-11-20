import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Build, Label, StatementCard } from "../components/primitives";
import { headline, universe } from "../data";
import { color, layout, sec, semantic, type } from "../theme";

/**
 * Beat 1.1-1.2 — the cold open.
 *
 * The thesis, in two clauses, on the reference's warm paper field. The second
 * clause is the product and it gets the accent colour and the hardest cut.
 * Lifted straight from the README's opening line, which is the strongest
 * sentence in the repository.
 */
export const HookOne: React.FC = () => (
  <AbsoluteFill
    style={{
      background: color.paper,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <StatementCard lines={["Most stock tools", "always have an answer."]} size={76} />
  </AbsoluteFill>
);

export const HookTwo: React.FC = () => (
  <AbsoluteFill
    style={{
      background: color.paper,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <StatementCard
      lines={["This one tells you", "when it doesn't."]}
      tone={semantic.abstain}
      size={76}
    />
  </AbsoluteFill>
);

/**
 * Beat 1.3 — the title.
 *
 * The ticker symbols in the committed panel resolve into the title. The count
 * and the names are read from the artifact, so the cloud is the real universe.
 */
export const HookTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const tickers = universe.tickers;

  const settle = interpolate(frame, [0, sec(2.4)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: color.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* The universe, drifting into alignment behind the title. */}
      <AbsoluteFill style={{ opacity: 0.5 * (1 - settle * 0.55) }}>
        {tickers.map((t, i) => {
          const a = (i / tickers.length) * Math.PI * 2;
          const r = 520 - settle * 180;
          return (
            <div
              key={t}
              style={{
                position: "absolute",
                left: 960 + Math.cos(a) * r * 1.5 - 70,
                top: 540 + Math.sin(a) * r * 0.52 - 10,
                fontFamily: type.mono,
                fontSize: type.size.label,
                letterSpacing: type.trackingCaps,
                color: color.navy,
                opacity: interpolate(frame, [i * 2, i * 2 + sec(0.4)], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              {t.replace(".NS", "")}
            </div>
          );
        })}
      </AbsoluteFill>

      <div style={{ textAlign: "center", zIndex: 2 }}>
        <Build delay={sec(0.3)}>
          <div
            style={{
              fontFamily: type.sans,
              fontSize: 128,
              fontWeight: type.weight.hero,
              color: color.navy,
              letterSpacing: "-0.035em",
              lineHeight: 1,
            }}
          >
            NSE COPILOT
          </div>
        </Build>
        <Build delay={sec(0.7)}>
          <div style={{ marginTop: 26 }}>
            <Label tone="rgba(43,44,48,0.7)">
              Calibrated next-session signals · {universe.present} NSE large-caps ·
              explicit abstention
            </Label>
          </div>
        </Build>
        <Build delay={sec(1.3)}>
          <div
            style={{
              marginTop: 34,
              display: "flex",
              gap: 18,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontFamily: type.mono,
                fontSize: type.size.label,
                letterSpacing: type.trackingCaps,
                color: color.white,
                background: semantic.holdout,
                padding: "8px 14px",
                borderRadius: layout.radiusSmall,
              }}
            >
              {headline.direction.qualifier}
            </span>
            <span
              style={{
                fontFamily: type.mono,
                fontSize: type.size.label,
                letterSpacing: type.trackingCaps,
                color: "rgba(43,44,48,0.65)",
              }}
            >
              {headline.direction.window[0]} → {headline.direction.window[1]}
            </span>
          </div>
        </Build>
      </div>
    </AbsoluteFill>
  );
};
