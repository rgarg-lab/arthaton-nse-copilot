"""How stable is "60% on the sessions it is most confident about"?

The confirmation fold put the shipped model at 62.50% on the 19.1% of sessions it calls, and
the final holdout put the same model and the same threshold at 55.50%. One of those is
flattering and one is not, and a single pair of numbers cannot say which is typical.

So this measures the identical claim — accuracy at the frozen 0.60 threshold — independently
in every walk-forward window, each one out-of-sample for a model refitted on only the data
preceding it. Four windows plus the already-published holdout gives five measurements of one
quantity, which is enough to report a range instead of a point.

This is not a search. Nothing is selected here; the model and the threshold are the frozen
shipped ones. It only asks how much the published number moves between windows, because a
claim of "60%" is worth very little without that.
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

OUT = Path(__file__).resolve().parent / "results"
SHIPPED = ("lgbm", dict(num_leaves=7, learning_rate=0.03, min_child_samples=200, n_estimators=300))
THRESHOLD = 0.60  # the frozen one, not re-chosen here


def main() -> int:
    panel = load_pre_holdout()
    built, extra = FEATURE_SETS["baseline"](panel)
    cols = list(dict.fromkeys(feature_columns(built) + extra))
    cand = Candidate("robust", SHIPPED[0])

    print("Shipped configuration, frozen 0.60 threshold, measured in each window")
    print("Each window is out-of-sample for a model fitted only on data before it.\n")
    print(f"{'window':<18} {'val n':>7} {'full acc':>9} {'calls':>7} {'coverage':>9} {'acc on calls':>13}")
    print("-" * 70)

    rows = []
    for fold in purged_walk_forward(panel["date"]):
        train = built.iloc[fold.train_idx]
        val = built.iloc[fold.val_idx]
        _assert_no_holdout(train, "robustness/train")
        _assert_no_holdout(val, "robustness/val")

        Xtr, Xva, use = _prepare(train, val, cols, cand)
        model = make_model(*SHIPPED)
        model.fit(Xtr[use], train["y_dir"].to_numpy(dtype=float))
        p = model.predict_proba(Xva[use])[:, 1]
        y = val["y_dir"].to_numpy(dtype=float)

        called = (p >= THRESHOLD) | (p <= 1 - THRESHOLD)
        n_called = int(called.sum())
        acc_called = (
            float(((p[called] > 0.5).astype(float) == y[called]).mean()) if n_called else float("nan")
        )
        row = {
            "window": fold.name,
            "n": int(len(y)),
            "full_accuracy": float(((p > 0.5).astype(float) == y).mean()),
            "calls": n_called,
            "coverage": float(called.mean()),
            "accuracy_on_calls": acc_called,
            "auc": _auc(y, p),
        }
        rows.append(row)
        print(
            f"{row['window']:<18} {row['n']:7d} {row['full_accuracy'] * 100:8.2f}% "
            f"{row['calls']:7d} {row['coverage'] * 100:8.2f}% {acc_called * 100:12.2f}%"
        )

    # The published holdout figure, for comparison. Read from the artifact, not recomputed —
    # recomputing it would be a second authoritative read.
    metrics = json.loads((Path(__file__).resolve().parents[1] / "artifacts" / "metrics.json").read_text(encoding="utf-8"))
    ab = metrics["abstention"]
    print(
        f"{'FINAL HOLDOUT':<18} {metrics['direction']['n']:7d} "
        f"{metrics['direction']['accuracy'] * 100:8.2f}% {ab['signals_emitted']:7d} "
        f"{ab['coverage'] * 100:8.2f}% {ab['accuracy_when_signalling'] * 100:12.2f}%"
    )

    on_calls = [r["accuracy_on_calls"] for r in rows] + [ab["accuracy_when_signalling"]]
    full = [r["full_accuracy"] for r in rows] + [metrics["direction"]["accuracy"]]
    print()
    print(f"accuracy on called sessions, across {len(on_calls)} windows:")
    print(f"  min {min(on_calls) * 100:.2f}%   median {float(np.median(on_calls)) * 100:.2f}%   max {max(on_calls) * 100:.2f}%")
    print(f"  windows at or above 60%: {sum(1 for a in on_calls if a >= 0.60)} of {len(on_calls)}")
    print(f"full-coverage accuracy, same windows:")
    print(f"  min {min(full) * 100:.2f}%   median {float(np.median(full)) * 100:.2f}%   max {max(full) * 100:.2f}%")

    OUT.mkdir(exist_ok=True)
    (OUT / "robustness.json").write_text(
        json.dumps(
            {
                "threshold": THRESHOLD,
                "windows": rows,
                "holdout_published": {
                    "n": metrics["direction"]["n"],
                    "full_accuracy": metrics["direction"]["accuracy"],
                    "calls": ab["signals_emitted"],
                    "coverage": ab["coverage"],
                    "accuracy_on_calls": ab["accuracy_when_signalling"],
                },
                "summary": {
                    "on_calls_min": min(on_calls),
                    "on_calls_median": float(np.median(on_calls)),
                    "on_calls_max": max(on_calls),
                    "windows_at_or_above_60pct": sum(1 for a in on_calls if a >= 0.60),
                    "windows_total": len(on_calls),
                },
            },
            indent=1,
        )
    )
    print(f"\nwritten: {OUT / 'robustness.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
