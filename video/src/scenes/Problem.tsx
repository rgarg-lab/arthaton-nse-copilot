import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Build, Figure, Label } from "../components/primitives";
import { headline } from "../data";
import { ILLUSTRATIVE_CERTAINTIES, ILLUSTRATIVE_NOTICE } from "../illustrative";
import { color, layout, sec, semantic, type } from "../theme";

/**
 * Beat 2.1-2.2 — what every other tool does.
 *
 * A wall of confident-looking certainties. The figures are **invented**, and
 * they live in `src/illustrative.ts` rather than here so that `honesty.test.ts`
 * can keep scanning this tree for metric-shaped literals without an exemption
 * that would also hide a real mistake. The notice renders across the frame for
 * the whole beat.
 */
export const ProblemWall: React.FC<{ dropAway?: boolean }> = ({ dropAway }) => {
  const frame = useCurrentFrame();
  const drop = dropAway
    ? interpolate(frame, [sec(1.2), sec(2.6)], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 0;

  return (
    <AbsoluteFill
      style={{
        background: color.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 340px)",
          gap: 26,
        }}
      >
        {ILLUSTRATIVE_CERTAINTIES.map((f, i) => (
          <Build key={f.k} delay={dropAway ? 0 : i * sec(0.16)}>
            <div
              style={{
                background: color.white,
                borderRadius: layout.radius,
                boxShadow: layout.shadowSoft,
                padding: 26,
                opacity: 1 - drop,
                transform: `translateY(${drop * 60}px)`,
              }}
            >
              <div
                style={{
                  fontFamily: type.sans,
                  fontSize: type.size.strip + 2,
                  fontWeight: type.weight.label,
                  letterSpacing: type.trackingCaps,
                  color: "rgba(43,44,48,0.45)",
                  border: "1px solid rgba(43,44,48,0.18)",
                  borderRadius: 6,
                  padding: "4px 8px",
                  display: "inline-block",
                }}
              >
                {f.badge}
              </div>
              <div
                style={{
                  fontFamily: type.sans,
                  fontSize: 52,
                  fontWeight: type.weight.hero,
                  color: "rgba(43,44,48,0.42)",
                  marginTop: 16,
                  letterSpacing: "-0.03em",
                }}
              >
                {f.figure}
              </div>
              <div
                style={{
                  fontFamily: type.sans,
                  fontSize: type.size.label,
                  color: "rgba(43,44,48,0.4)",
                  marginTop: 6,
                }}
              >
                {f.sub}
              </div>
            </div>
          </Build>
        ))}
      </div>

      {/* The marking that makes this honest. */}
      <div style={{ position: "absolute", top: 150, left: 0, right: 0, textAlign: "center" }}>
        <Build delay={0}>
          <Label tone="rgba(43,44,48,0.55)">{ILLUSTRATIVE_NOTICE}</Label>
        </Build>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Beat 2.3 — the measured reality the genre is selling against.
 *
 * The holdout figure arrives with the thing that makes it mean anything beside
 * it: the always-up baseline on the identical split.
 */
export const CoinFlip: React.FC = () => {
  const frame = useCurrentFrame();
  const land = interpolate(frame, [sec(0.2), sec(1.4)], [0, 1], {
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
      <div style={{ display: "flex", alignItems: "center", gap: 110 }}>
        {/* A 50/50 axis with the measured point landing on it. */}
        <div style={{ position: "relative", width: 420, height: 420 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: layout.radius,
              background: color.panel,
              opacity: 0.35,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "50%",
              height: 2,
              background: "rgba(43,44,48,0.35)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              width: 2,
              background: "rgba(43,44,48,0.35)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${50 + (headline.direction.value - 0.5) * 900}%`,
              top: `${50 - (headline.direction.value - 0.5) * 900}%`,
              width: 26,
              height: 26,
              marginLeft: -13,
              marginTop: -13,
              borderRadius: 13,
              background: semantic.holdout,
              transform: `scale(${land})`,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 16,
              left: 0,
              right: 0,
              textAlign: "center",
            }}
          >
            <Label tone="rgba(43,44,48,0.6)">a coin flip is the origin</Label>
          </div>
        </div>

        <Figure
          value={headline.direction.display}
          qualifier={headline.direction.qualifier}
          baselineLabel={headline.direction.baseline.label}
          baselineValue={headline.direction.baseline.display}
          tone={semantic.holdout}
          delay={sec(1.0)}
        />
      </div>
    </AbsoluteFill>
  );
};
