import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bar, Build, Figure, Label } from "../components/primitives";
import { baselines, experiments, headline } from "../data";
import { color, layout, sec, semantic, type } from "../theme";

/**
 * Beat 5.4 — the four baselines, on the identical split.
 *
 * 51.37% means nothing on its own, so it is never shown on its own. The bars
 * are drawn from a common origin well below the data so the differences are
 * visible, and the origin is labelled — a bar chart starting at 48% without
 * saying so is the standard way to make a 2.5-point edge look like a landslide.
 */
export const Baselines: React.FC = () => {
  const origin = 0.46;
  const scale = (a: number) => (a - origin) / (0.56 - origin);

  return (
    <AbsoluteFill
      style={{
        background: color.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: 1280 }}>
        <Build delay={0}>
          <Label tone={color.navy}>
            Four baselines · identical split · {headline.direction.nDisplay} holdout rows
          </Label>
        </Build>

        <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 22 }}>
          {baselines.map((b, i) => (
            <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <div
                style={{
                  width: 260,
                  textAlign: "right",
                  fontFamily: type.sans,
                  fontSize: type.size.body,
                  color: b.isModel ? color.navy : "rgba(43,44,48,0.6)",
                  fontWeight: b.isModel ? type.weight.label : type.weight.body,
                }}
              >
                {b.label}
              </div>
              <div style={{ flex: 1 }}>
                <Bar
                  share={scale(b.accuracy)}
                  tone={b.isModel ? semantic.holdout : semantic.baseline}
                  delay={sec(0.5) + i * sec(0.22)}
                  height={30}
                />
              </div>
              <Build delay={sec(0.5) + i * sec(0.22)}>
                <div
                  style={{
                    width: 110,
                    fontFamily: type.sans,
                    fontSize: type.size.headline * 0.7,
                    fontWeight: type.weight.hero,
                    color: b.isModel ? color.navy : "rgba(43,44,48,0.55)",
                  }}
                >
                  {b.display}
                </div>
              </Build>
            </div>
          ))}
        </div>

        <Build delay={sec(1.8)}>
          <div
            style={{
              marginTop: 30,
              fontFamily: type.mono,
              fontSize: type.size.label,
              color: "rgba(43,44,48,0.5)",
            }}
          >
            bars start at {(origin * 100).toFixed(0)}%, not zero — the edge is 2.5 points
            and the axis says so
          </div>
        </Build>
      </div>
    </AbsoluteFill>
  );
};

/**
 * Beat 6.1 — the honest headline, given the whole frame.
 */
export const HonestNumber: React.FC = () => (
  <AbsoluteFill
    style={{
      background: color.bg,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <div
      style={{
        background: color.panel,
        borderRadius: layout.radius,
        boxShadow: layout.shadow,
        padding: "72px 96px",
      }}
    >
      <Figure
        value={headline.direction.display}
        qualifier={headline.direction.qualifier}
        baselineLabel={headline.direction.baseline.label}
        baselineValue={headline.direction.baseline.display}
        tone={color.navy}
        size={168}
      />
      <Build delay={sec(1.2)}>
        <div
          style={{
            marginTop: 26,
            fontFamily: type.sans,
            fontSize: type.size.body,
            color: "rgba(23,40,98,0.75)",
            maxWidth: 760,
            lineHeight: 1.6,
          }}
        >
          {headline.direction.nDisplay} rows the model never saw, read exactly once.
        </div>
      </Build>
    </div>
  </AbsoluteFill>
);

/**
 * Beat 6.2 — the published search, and what it actually proved.
 *
 * Every configuration tried, as a wall of rows, all landing in the same narrow
 * band. Then the part that matters: the three that looked best on the folds
 * that chose them, measured on a fold that did not — where the ranking inverts.
 */
export const FailedSearch: React.FC = () => {
  const frame = useCurrentFrame();
  const accs = experiments.selection.accuracies;
  const lo = Math.min(...accs);
  const hi = Math.max(...accs);

  const reveal = interpolate(frame, [sec(2.6), sec(3.2)], [0, 1], {
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
      <div style={{ width: 1400 }}>
        <Build delay={0}>
          <Label tone={color.navy}>
            {experiments.configurationsSearched} configurations searched · five algorithm
            families · the holdout untouched
          </Label>
        </Build>

        {/* Every configuration as a tick on one axis. */}
        <div
          style={{
            marginTop: 44,
            position: "relative",
            height: 120,
            borderBottom: "1px solid rgba(43,44,48,0.2)",
          }}
        >
          {accs.map((a, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${((a - lo) / (hi - lo)) * 96}%`,
                bottom: 0,
                width: 3,
                height: 56,
                background: semantic.baseline,
                opacity: interpolate(frame, [i * 2, i * 2 + sec(0.3)], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            />
          ))}
          <div
            style={{
              position: "absolute",
              left: 0,
              bottom: -30,
              fontFamily: type.mono,
              fontSize: type.size.label,
              color: "rgba(43,44,48,0.55)",
            }}
          >
            {experiments.selection.minDisplay}
          </div>
          <div
            style={{
              position: "absolute",
              right: 0,
              bottom: -30,
              fontFamily: type.mono,
              fontSize: type.size.label,
              color: "rgba(43,44,48,0.55)",
            }}
          >
            {experiments.selection.maxDisplay}
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              fontFamily: type.sans,
              fontSize: type.size.label,
              letterSpacing: type.trackingCaps,
              color: "rgba(43,44,48,0.5)",
            }}
          >
            ON THE FOLDS THAT SELECTED THEM
          </div>
        </div>

        {/* The confirmation fold: the ranking inverts. */}
        <div style={{ marginTop: 80, opacity: reveal }}>
          <Label tone={semantic.abstain}>
            the same three, on a fold that selected nothing
          </Label>
          <div style={{ marginTop: 22, display: "flex", gap: 54 }}>
            {experiments.confirmation.map((c, i) => (
              <Build key={c.name} delay={sec(3.2) + i * sec(0.2)}>
                <div style={{ maxWidth: 380 }}>
                  <div
                    style={{
                      fontFamily: type.sans,
                      fontSize: type.size.headline,
                      fontWeight: type.weight.hero,
                      color: color.navy,
                    }}
                  >
                    {c.display}
                  </div>
                  <div
                    style={{
                      fontFamily: type.sans,
                      fontSize: type.size.label,
                      color: "rgba(43,44,48,0.6)",
                      marginTop: 8,
                      lineHeight: 1.5,
                    }}
                  >
                    {c.short}
                  </div>
                </div>
              </Build>
            ))}
          </div>
          <Build delay={sec(4.2)}>
            <div
              style={{
                marginTop: 26,
                fontFamily: type.sans,
                fontSize: type.size.body,
                color: "rgba(43,44,48,0.7)",
              }}
            >
              All of them collapse into {experiments.confirmationBandDisplay}. The one that
              won on validation finishes last.
            </div>
          </Build>
        </div>
      </div>
    </AbsoluteFill>
  );
};
