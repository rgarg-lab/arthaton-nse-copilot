"""The magnitude model: will tomorrow be a big move?

## Why this exists beside the direction model rather than instead of it

Next-session *direction* on NSE large-caps is close to a martingale. The direction model
gets 51.37% on the holdout, and `ml/experiments/RESULTS.md` records 29 configurations —
five algorithm families, five feature sets, five noise-reduction schemes, recency weighting,
regime specialisation, a five-model ensemble — none of which beat it on data that had not
selected them.

*Volatility* is a different matter. Volatility clusters: a turbulent session is followed by
a turbulent session far more often than chance. That is one of the most robust facts in
empirical finance, and it is why this head reaches a median of 60.2% on the sessions it
calls while covering roughly 45% of them, against the direction head needing to drop to
~10% coverage for a comparable figure.

It is also the better question for the user this product names. "A salaried investor
deciding whether today is a day to act or wait" is asking about magnitude, not sign.

## The label, and why it cannot leak

    y_big = 1 if |next session return| > median(|return|) over the trailing MAGNITUDE_WINDOW

The label looks one session forward — that is the thing being predicted. The *threshold* it
is compared against is computed from the trailing window up to and including today, so it is
known at decision time. The base rate lands near 50% because it is a median split, which is
deliberate: a target with a 70% base rate would make 70% accuracy meaningless.

`drop_label_columns` exists because this bit me. `features.feature_columns()` discovers
columns by pattern, so it happily returned `y_big` itself into the feature matrix on the
first run and every one of five algorithms reported 100.00% accuracy with an AUC of 1.0000.
A number that good is a leak until proven otherwise.

## What this module must not do

Touch the direction model, its calibrator, its threshold, or the final holdout. All three
are frozen (§6.5) and the holdout has been read exactly once, with a committed ledger. This
trains on pre-holdout rows only and writes its own artifacts.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime

import numpy as np
import pandas as pd

from .config import (
    HOLDOUT_START,
    MAGNITUDE_METRICS_PATH,
    MAGNITUDE_MODEL_PATH,
    MAGNITUDE_THRESHOLD,
    MAGNITUDE_WINDOW,
    PANEL_PATH,
    RANDOM_SEED,
)
from .features import Preprocessor, feature_columns
from .labels import labelled
from .validation import purged_walk_forward

# Chosen in ml/experiments/run_volatility.py: the most regularised of five candidates, and
# the only one whose confirmation-fold score came in *above* its selection score.
PARAMS = dict(
    objective="binary",
    num_leaves=7,
    learning_rate=0.03,
    min_child_samples=500,
    n_estimators=400,
    random_state=RANDOM_SEED,
    n_jobs=-1,
    verbose=-1,
)

LABEL_COLUMNS = ("y_big", "y_dir", "y_ret", "typical_move")


def drop_label_columns(columns: list[str]) -> list[str]:
    """Remove anything that is a label or was used to build one. See the module docstring."""
    return [c for c in columns if c not in LABEL_COLUMNS and not c.startswith("y_")]


def add_magnitude_label(panel: pd.DataFrame, window: int = MAGNITUDE_WINDOW) -> pd.DataFrame:
    """Attach `y_big` and the trailing threshold it is defined against."""
    out = panel.sort_values(["ticker", "date"]).copy()
    typical = out.groupby("ticker")["ret_1"].transform(
        lambda s: s.abs().rolling(window, min_periods=window).median()
    )
    out["typical_move"] = typical
    out["y_big"] = (out["y_ret"].abs() > typical).astype(float)
    return out[typical.notna()].reset_index(drop=True)


@dataclass
class MagnitudeModel:
    """A fitted magnitude head, with everything needed to score a new row."""

    booster: object
    columns: list[str]
    preprocessor: Preprocessor
    threshold: float
    trained_at: str
    train_rows: int
    train_end: str
    window: int

    def probability_big(self, df: pd.DataFrame) -> np.ndarray:
        X = self.preprocessor.transform(df)
        for c in self.columns:
            if c not in X.columns:
                X[c] = 0.0
            if str(X[c].dtype) in {"category", "object"}:
                X[c] = pd.to_numeric(X[c], errors="coerce")
        frame = X[self.columns].replace([np.inf, -np.inf], np.nan).fillna(0.0)
        return self.booster.predict_proba(frame)[:, 1]


def _fit(X: pd.DataFrame, y: np.ndarray, columns: list[str]):
    from lightgbm import LGBMClassifier

    model = LGBMClassifier(**PARAMS)
    model.fit(X[columns], y)
    return model


def _prepare(train: pd.DataFrame, score: pd.DataFrame, cols: list[str]):
    pre = Preprocessor().fit(train, cols)
    Xtr, Xsc = pre.transform(train), pre.transform(score)
    use = drop_label_columns([c for c in pre.model_columns if c in Xtr.columns])
    for frame in (Xtr, Xsc):
        for c in use:
            if str(frame[c].dtype) in {"category", "object"}:
                frame[c] = pd.to_numeric(frame[c], errors="coerce")
        frame[use] = frame[use].replace([np.inf, -np.inf], np.nan).fillna(0.0)
    return pre, Xtr, Xsc, use


def walk_forward_windows(panel: pd.DataFrame) -> list[dict]:
    """Measure the frozen threshold in every window, each out-of-sample.

    This is the model's reported performance. There is no single holdout number for this
    head: the final holdout is governed by the direction model's ledger and is not read
    here, so stability across four independent windows is the evidence offered instead.
    """
    cols = drop_label_columns(feature_columns(panel))
    rows = []
    for fold in purged_walk_forward(panel["date"]):
        train = panel.iloc[fold.train_idx]
        val = panel.iloc[fold.val_idx]
        if pd.Timestamp(val["date"].max()) >= pd.Timestamp(HOLDOUT_START):
            raise RuntimeError("magnitude evaluation reached the holdout boundary")

        _, Xtr, Xva, use = _prepare(train, val, cols)
        model = _fit(Xtr, train["y_big"].to_numpy(dtype=float), use)
        p = model.predict_proba(Xva[use])[:, 1]
        y = val["y_big"].to_numpy(dtype=float)

        called = (p >= MAGNITUDE_THRESHOLD) | (p <= 1 - MAGNITUDE_THRESHOLD)
        n_called = int(called.sum())
        rows.append(
            {
                "window": fold.name,
                "n": int(len(y)),
                "base_rate": float(y.mean()),
                "accuracy": float(((p > 0.5).astype(float) == y).mean()),
                "calls": n_called,
                "coverage": float(called.mean()),
                "accuracy_when_calling": (
                    float(((p[called] > 0.5).astype(float) == y[called]).mean())
                    if n_called
                    else None
                ),
            }
        )
    return rows


def train() -> MagnitudeModel:
    """Fit on every pre-holdout row and write the artifacts."""
    panel = add_magnitude_label(labelled(pd.read_parquet(PANEL_PATH)))
    pre_holdout = panel[panel["date"] < pd.Timestamp(HOLDOUT_START)].reset_index(drop=True)
    if len(pre_holdout) == 0:
        raise RuntimeError("no pre-holdout rows with a magnitude label")

    windows = walk_forward_windows(pre_holdout)

    cols = drop_label_columns(feature_columns(pre_holdout))
    pre, Xtr, _, use = _prepare(pre_holdout, pre_holdout.head(1), cols)
    booster = _fit(Xtr, pre_holdout["y_big"].to_numpy(dtype=float), use)

    on_calls = [w["accuracy_when_calling"] for w in windows if w["accuracy_when_calling"]]
    metrics = {
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S"),
        "generated_by": "ml/src/copilot/magnitude.py — the only producer of magnitude metrics",
        "target": (
            "y_big = 1 if |next session return| > trailing "
            f"{MAGNITUDE_WINDOW}-session median |return|. The threshold is known at decision "
            "time; only the return being compared is in the future."
        ),
        "why_this_head": (
            "Next-session direction is close to a martingale (51.37% on the holdout, and 29 "
            "configurations failed to beat it). Volatility clusters and is predictable. This "
            "head answers the question the product's user actually asks."
        ),
        "threshold": MAGNITUDE_THRESHOLD,
        "threshold_note": (
            "Chosen once on the walk-forward confirmation fold, then measured unchanged in "
            "every window. Never tuned on the final holdout, which this head does not read."
        ),
        "holdout_note": (
            "Not evaluated on the final holdout: those rows are governed by the direction "
            "model's committed ledger. The evidence offered is stability across four "
            "independent out-of-sample walk-forward windows."
        ),
        "train_rows": int(len(pre_holdout)),
        "train_end": str(pre_holdout["date"].max())[:10],
        "feature_count": len(use),
        "base_rate": float(pre_holdout["y_big"].mean()),
        "windows": windows,
        "summary": {
            "accuracy_when_calling_min": min(on_calls),
            "accuracy_when_calling_median": float(np.median(on_calls)),
            "accuracy_when_calling_max": max(on_calls),
            "windows_at_or_above_60pct": sum(1 for a in on_calls if a >= 0.60),
            "windows_total": len(on_calls),
            "coverage_min": min(w["coverage"] for w in windows),
            "coverage_max": max(w["coverage"] for w in windows),
            "full_coverage_accuracy_median": float(np.median([w["accuracy"] for w in windows])),
        },
    }

    bundle = MagnitudeModel(
        booster=booster,
        columns=use,
        preprocessor=pre,
        threshold=MAGNITUDE_THRESHOLD,
        trained_at=metrics["generated_at"],
        train_rows=int(len(pre_holdout)),
        train_end=metrics["train_end"],
        window=MAGNITUDE_WINDOW,
    )

    import joblib

    joblib.dump(bundle, MAGNITUDE_MODEL_PATH)
    MAGNITUDE_METRICS_PATH.write_text(json.dumps(metrics, indent=1), encoding="utf-8")
    return bundle


def main() -> int:
    bundle = train()
    metrics = json.loads(MAGNITUDE_METRICS_PATH.read_text(encoding="utf-8"))
    s = metrics["summary"]
    print(
        f"magnitude model: {bundle.train_rows:,} rows to {bundle.train_end}, "
        f"{len(bundle.columns)} features"
    )
    print(f"  base rate {metrics['base_rate']:.4f}  threshold {bundle.threshold}")
    print(f"  {'window':<18} {'full acc':>9} {'coverage':>9} {'acc on calls':>13}")
    for w in metrics["windows"]:
        called = w["accuracy_when_calling"]
        print(
            f"  {w['window']:<18} {w['accuracy'] * 100:8.2f}% {w['coverage'] * 100:8.2f}% "
            f"{(called or 0) * 100:12.2f}%"
        )
    print(
        f"  accuracy on calls: min {s['accuracy_when_calling_min'] * 100:.2f}%  "
        f"median {s['accuracy_when_calling_median'] * 100:.2f}%  "
        f"max {s['accuracy_when_calling_max'] * 100:.2f}%  "
        f"({s['windows_at_or_above_60pct']}/{s['windows_total']} at or above 60%)"
    )
    return 0


if __name__ == "__main__":
    from copilot.magnitude import main as _main

    raise SystemExit(_main())
