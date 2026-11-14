"""The confirmation run: fold 4 (2025 H1), scored once, for the winners only.

## Why this file is separate and why it runs last

Stages 1-4 scored 23 configurations on the selection folds. The maximum over 23 noisy
estimates is biased upward — that is arithmetic, not pessimism — so the best validation
number is not an estimate of anything. Fold 4 played no part in choosing anything, so its
number is honest.

What this measures, concretely:

* the shipped configuration, as a reference point on the same fold;
* the best single model found (ExtraTrees);
* the five-family ensemble, which was the only thing whose coverage curve crossed 60%;
* and the full coverage curve for each, because "60% accuracy" turned out to be reachable
  only by abstaining, and the honest version of that claim has to state the coverage.

The true holdout (>= 2025-07-01) is still untouched. `search._assert_no_holdout` runs on
every frame here as well.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from search import (  # noqa: E402
    SELECTION_FOLDS,
    Candidate,
    FEATURE_SETS,
    _assert_no_holdout,
    _auc,
    _logloss,
    _prepare,
    coverage_curve,
    load_pre_holdout,
    make_model,
)
from copilot.features import feature_columns  # noqa: E402
from copilot.validation import purged_walk_forward  # noqa: E402
from run_ensemble import MEMBERS  # noqa: E402

OUT = Path(__file__).resolve().parent / "results"


def fit_predict(panel, fold, members, features="baseline", cand=None):
    """Fit on the fold's training rows, predict its validation rows. Returns (y, {name: p})."""
    built, extra = FEATURE_SETS[features](panel)
    cols = list(dict.fromkeys(feature_columns(built) + extra))
    cand = cand or Candidate("confirm", members[0][0], features=features)

    train = built.iloc[fold.train_idx]
    val = built.iloc[fold.val_idx]
    _assert_no_holdout(train, "confirm/train")
    _assert_no_holdout(val, "confirm/val")

    Xtr, Xva, use = _prepare(train, val, cols, cand)
    ytr = train["y_dir"].to_numpy(dtype=float)
    y = val["y_dir"].to_numpy(dtype=float)

    out = {}
    for name, params in members:
        model = make_model(name, params)
        model.fit(Xtr[use], ytr)
        out[name] = model.predict_proba(Xva[use])[:, 1]
    return y, out


def report(label: str, y: np.ndarray, p: np.ndarray) -> dict:
    res = {
        "name": label,
        "n": int(len(y)),
        "accuracy": float(((p > 0.5).astype(float) == y).mean()),
        "auc": _auc(y, p),
        "logloss": _logloss(y, p),
        "coverage_curve": coverage_curve(y, p),
    }
    print(f"\n=== {label} ===")
    print(f"  n {res['n']:,}   accuracy {res['accuracy'] * 100:.2f}%   auc {res['auc']:.4f}")
    print(f"  {'thr':>5} {'coverage':>9} {'n':>7} {'accuracy':>9}")
    for r in res["coverage_curve"]:
        flag = "  <= 60%+" if r["accuracy"] >= 0.60 else ""
        print(
            f"  {r['threshold']:5.2f} {r['coverage'] * 100:8.2f}% {r['n']:7d} "
            f"{r['accuracy'] * 100:8.2f}%{flag}"
        )
    return res


def main() -> int:
    panel = load_pre_holdout()
    folds = list(purged_walk_forward(panel["date"]))
    confirm = folds[SELECTION_FOLDS]
    print(f"CONFIRMATION FOLD: {confirm.name}  (never used for selection)")
    print(f"  train rows {len(confirm.train_idx):,}   val rows {len(confirm.val_idx):,}")
    print(f"  the true holdout (>= 2025-07-01) remains untouched\n")

    shipped = [("lgbm", dict(num_leaves=7, learning_rate=0.03, min_child_samples=200, n_estimators=300))]

    started = time.time()
    y, shipped_p = fit_predict(panel, confirm, shipped)
    results = [report("shipped config (lgbm, as deployed)", y, shipped_p["lgbm"])]

    y, member_p = fit_predict(panel, confirm, MEMBERS)
    results.append(report("ExtraTrees (best single on validation)", y, member_p["et"]))

    ens = np.mean([member_p[name] for name, _ in MEMBERS], axis=0)
    results.append(report("5-family ensemble (best coverage curve on validation)", y, ens))

    print(f"\ntotal {time.time() - started:.0f}s")
    OUT.mkdir(exist_ok=True)
    (OUT / "confirmation.json").write_text(json.dumps(results, indent=1))
    print(f"written: {OUT / 'confirmation.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
