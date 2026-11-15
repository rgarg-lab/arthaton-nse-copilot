"""Confidence tiers: how accurate the model is at each level of conviction.

## What this is for

"51.37%" is the model's accuracy if it were forced to call every session, and it is the
number the headline has always carried. It is also not the number a user meets, because the
product abstains: when it *does* speak, it speaks from the confident tail, and the tail is
measurably better than the average.

This produces that ladder so a prediction can be labelled — high confidence, very high
confidence — with the measured accuracy of its own band beside it, rather than the average
of a distribution the prediction is not drawn from.

## Where the numbers come from, and the gap that must travel with them

Out-of-fold predictions from the purged walk-forward (`oof_predictions.parquet`,
2022-01-03 → 2025-06-30, 14,654 rows). Every row is out-of-sample for a model fitted only
on data preceding its fold, and `p_cal` is the calibrated probability — the same quantity
the UI shows as conviction.

**These are validation numbers, not holdout numbers, and the difference is large.** At the
frozen 0.60 gate the out-of-fold accuracy is around 63% while the final holdout records
55.50% at that same gate. That ~7.5-point gap is the validation-optimism tax measured
across this project repeatedly (`ml/experiments/RESULTS.md` puts it at 2.6–4.6 points for a
searched configuration), and a tier table that reported 63% without it would be the most
misleading artifact in the repository.

So `holdout_comparison` is written into the artifact itself rather than left to the UI to
remember, and every consumer is expected to show both.

## What it must never become

A dial. The bands are read off the frozen threshold; they are not re-chosen to make a tier
look better, and nothing here touches the model, the calibrator, the threshold or the
holdout.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import numpy as np
import pandas as pd

from .config import ARTIFACTS_DIR, METRICS_PATH

OOF_PATH = ARTIFACTS_DIR / "oof_predictions.parquet"
CONFIDENCE_PATH = ARTIFACTS_DIR / "confidence_tiers.json"

# Cumulative gates, for "accuracy on everything at least this confident".
GATES = (0.50, 0.55, 0.60, 0.65, 0.70)

# Bands an individual prediction falls into. The 0.60 boundary is the frozen abstention
# threshold, so everything below it is a session the product declines to call.
BANDS: tuple[tuple[float, float, str, str], ...] = (
    (0.50, 0.55, "no call", "Conviction barely off a coin flip. The model declines."),
    (0.55, 0.60, "no call", "Leaning, but under the frozen gate. The model still declines."),
    (0.60, 0.65, "high", "Clears the frozen gate. This is a call the model stands behind."),
    (0.65, 1.01, "very high", "The most confident band the model produces."),
)

# A band needs enough rows for its accuracy to mean anything. Below this it is reported as
# present but unscored rather than given a number that is mostly sampling noise.
MIN_ROWS = 100


def _accuracy(y: np.ndarray, p: np.ndarray) -> float:
    return float(((p > 0.5).astype(float) == y).mean())


def build() -> dict:
    oof = pd.read_parquet(OOF_PATH)
    y = oof["y_dir"].to_numpy(dtype=float)
    p = oof["p_cal"].to_numpy(dtype=float)
    conviction = np.maximum(p, 1 - p)
    folds = oof["fold"].to_numpy()

    def per_fold(mask: np.ndarray) -> list[float]:
        out = []
        for f in sorted(set(folds)):
            m = mask & (folds == f)
            if m.sum() >= 20:
                out.append(_accuracy(y[m], p[m]))
        return out

    gates = []
    for gate in GATES:
        mask = conviction >= gate
        if mask.sum() < MIN_ROWS:
            continue
        spread = per_fold(mask)
        gates.append(
            {
                "gate": gate,
                "coverage": float(mask.mean()),
                "n": int(mask.sum()),
                "accuracy": _accuracy(y[mask], p[mask]),
                "per_fold_min": min(spread) if spread else None,
                "per_fold_max": max(spread) if spread else None,
            }
        )

    bands = []
    for lo, hi, label, description in BANDS:
        mask = (conviction >= lo) & (conviction < hi)
        scored = mask.sum() >= MIN_ROWS
        bands.append(
            {
                "from": lo,
                "to": None if hi > 1 else hi,
                "label": label,
                "description": description,
                "calls": label != "no call",
                "coverage": float(mask.mean()),
                "n": int(mask.sum()),
                "accuracy": _accuracy(y[mask], p[mask]) if scored else None,
                "note": None if scored else f"fewer than {MIN_ROWS} rows; not scored",
            }
        )

    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    ab = metrics["abstention"]
    gate_row = next((g for g in gates if abs(g["gate"] - ab["threshold"]) < 1e-9), None)

    return {
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S"),
        "generated_by": "ml/src/copilot/confidence.py — the only producer of confidence tiers",
        "source": (
            "Out-of-fold predictions from the purged walk-forward, "
            f"{str(oof['date'].min())[:10]} to {str(oof['date'].max())[:10]}, "
            f"{len(oof):,} rows. Calibrated probabilities (p_cal). Validation, not holdout."
        ),
        "basis": "validation",
        "threshold": ab["threshold"],
        "gates": gates,
        "bands": bands,
        "holdout_comparison": {
            "note": (
                "The same frozen gate, measured on the final holdout instead of the "
                "validation folds. The difference is the validation-optimism tax and must "
                "be displayed wherever a tier figure is displayed."
            ),
            "gate": ab["threshold"],
            "validation_accuracy": gate_row["accuracy"] if gate_row else None,
            "validation_coverage": gate_row["coverage"] if gate_row else None,
            "holdout_accuracy": ab["accuracy_when_signalling"],
            "holdout_coverage": ab["coverage"],
            "gap": (
                gate_row["accuracy"] - ab["accuracy_when_signalling"] if gate_row else None
            ),
            "full_coverage_holdout_accuracy": metrics["direction"]["accuracy"],
        },
    }


def main() -> int:
    tiers = build()
    CONFIDENCE_PATH.write_text(json.dumps(tiers, indent=1), encoding="utf-8")

    print(f"confidence tiers -> {CONFIDENCE_PATH.name}")
    print(f"  source: {tiers['basis']}\n")
    print(f"  {'gate':>5} {'coverage':>9} {'n':>7} {'accuracy':>9}  per-fold range")
    for g in tiers["gates"]:
        rng = (
            f"{g['per_fold_min'] * 100:.1f}%-{g['per_fold_max'] * 100:.1f}%"
            if g["per_fold_min"] is not None
            else "n/a"
        )
        print(
            f"  {g['gate']:5.2f} {g['coverage'] * 100:8.2f}% {g['n']:7d} "
            f"{g['accuracy'] * 100:8.2f}%  {rng}"
        )

    print(f"\n  {'band':>12} {'coverage':>9} {'n':>7} {'accuracy':>9}  label")
    for b in tiers["bands"]:
        hi = "+" if b["to"] is None else f"{b['to']:.2f}"
        acc = f"{b['accuracy'] * 100:8.2f}%" if b["accuracy"] is not None else "       —"
        print(
            f"  {b['from']:.2f}-{hi:>5} {b['coverage'] * 100:8.2f}% {b['n']:7d} {acc}  {b['label']}"
        )

    h = tiers["holdout_comparison"]
    print(
        f"\n  AT THE FROZEN GATE: validation {h['validation_accuracy'] * 100:.2f}% "
        f"vs holdout {h['holdout_accuracy'] * 100:.2f}% — a gap of {h['gap'] * 100:.2f} points."
    )
    print("  Both must be shown together wherever either is shown.")
    return 0


if __name__ == "__main__":
    from copilot.confidence import main as _main

    raise SystemExit(_main())
