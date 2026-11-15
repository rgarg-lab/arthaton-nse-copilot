"""Is the volatility model's 60% stable across windows, or one lucky fold?

The direction model's low-coverage accuracy swung seven points between adjacent windows
(62.50% then 55.50%), which is why its headline stayed the full-coverage figure. The same
question has to be asked here before anything is claimed, and with the same method: fix the
model and the threshold, then measure in every window independently.

Threshold 0.56 is the one being tested, because that is where the confirmation fold crossed
60% while still calling half of all sessions. It is not re-chosen per window — re-choosing
it is how you manufacture a stable-looking number out of an unstable one.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from search import (  # noqa: E402
    Candidate,
    FEATURE_SETS,
    _assert_no_holdout,
    _auc,
    _prepare,
    load_pre_holdout,
    make_model,
)
from copilot.features import feature_columns  # noqa: E402
from copilot.validation import purged_walk_forward  # noqa: E402
from run_volatility import LABEL_COLUMNS, _without_labels, add_magnitude_label  # noqa: E402

OUT = Path(__file__).resolve().parent / "results"
MODEL = ("lgbm", dict(num_leaves=7, learning_rate=0.03, min_child_samples=500, n_estimators=400))
THRESHOLD = 0.56


def main() -> int:
    panel = add_magnitude_label(load_pre_holdout())
    built, extra = FEATURE_SETS["baseline"](panel)
    cols = _without_labels(list(dict.fromkeys(feature_columns(built) + extra)))
    cand = Candidate("volrob", MODEL[0])

    print(f"Volatility model, fixed threshold {THRESHOLD}, measured in every window")
    print("Threshold is NOT re-chosen per window.\n")
    print(f"{'window':<18} {'n':>6} {'base':>7} {'full acc':>9} {'calls':>7} {'coverage':>9} {'acc on calls':>13} {'auc':>8}")
    print("-" * 84)

    rows = []
    for fold in purged_walk_forward(panel["date"]):
        train = built.iloc[fold.train_idx]
        val = built.iloc[fold.val_idx]
        _assert_no_holdout(train, "volrob/train")
        _assert_no_holdout(val, "volrob/val")

        Xtr, Xva, use = _prepare(train, val, cols, cand)
        use = _without_labels(use)
        leaked = [c for c in use if c in LABEL_COLUMNS or c.startswith("y_")]
        if leaked:
            raise RuntimeError(f"label columns reached the feature matrix: {leaked}")

        model = make_model(MODEL[0], MODEL[1])
        model.fit(Xtr[use], train["y_big"].to_numpy(dtype=float))
        p = model.predict_proba(Xva[use])[:, 1]
        y = val["y_big"].to_numpy(dtype=float)

        called = (p >= THRESHOLD) | (p <= 1 - THRESHOLD)
        n_called = int(called.sum())
        acc_called = (
            float(((p[called] > 0.5).astype(float) == y[called]).mean()) if n_called else float("nan")
        )
        row = {
            "window": fold.name,
            "n": int(len(y)),
            "base_rate": float(y.mean()),
            "full_accuracy": float(((p > 0.5).astype(float) == y).mean()),
            "calls": n_called,
            "coverage": float(called.mean()),
            "accuracy_on_calls": acc_called,
            "auc": _auc(y, p),
        }
        rows.append(row)
        print(
            f"{row['window']:<18} {row['n']:6d} {row['base_rate'] * 100:6.1f}% "
            f"{row['full_accuracy'] * 100:8.2f}% {row['calls']:7d} {row['coverage'] * 100:8.2f}% "
            f"{acc_called * 100:12.2f}% {row['auc']:8.4f}"
        )

    on_calls = [r["accuracy_on_calls"] for r in rows]
    full = [r["full_accuracy"] for r in rows]
    cov = [r["coverage"] for r in rows]
    print()
    print(f"accuracy on called sessions across {len(rows)} windows:")
    print(f"  min {min(on_calls) * 100:.2f}%   median {float(np.median(on_calls)) * 100:.2f}%   max {max(on_calls) * 100:.2f}%")
    print(f"  at or above 60%: {sum(1 for a in on_calls if a >= 0.60)} of {len(on_calls)}")
    print(f"  spread (max-min): {(max(on_calls) - min(on_calls)) * 100:.2f} points")
    print(f"coverage: min {min(cov) * 100:.1f}%  max {max(cov) * 100:.1f}%")
    print(f"full-coverage accuracy: min {min(full) * 100:.2f}%  median {float(np.median(full)) * 100:.2f}%  max {max(full) * 100:.2f}%")

    OUT.mkdir(exist_ok=True)
    (OUT / "vol_robustness.json").write_text(
        json.dumps(
            {
                "threshold": THRESHOLD,
                "model": {"kind": MODEL[0], "params": MODEL[1]},
                "windows": rows,
                "summary": {
                    "on_calls_min": min(on_calls),
                    "on_calls_median": float(np.median(on_calls)),
                    "on_calls_max": max(on_calls),
                    "on_calls_spread": max(on_calls) - min(on_calls),
                    "windows_at_or_above_60pct": sum(1 for a in on_calls if a >= 0.60),
                    "windows_total": len(on_calls),
                },
            },
            indent=1,
        )
    )
    print(f"\nwritten: {OUT / 'vol_robustness.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
