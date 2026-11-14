"""Run the accuracy search and print a leaderboard.

    python ml/experiments/run_search.py --stage 1     # algorithms, baseline features
    python ml/experiments/run_search.py --stage 2     # feature sets on the best algorithm
    python ml/experiments/run_search.py --stage 3     # noise reduction on the best of those
    python ml/experiments/run_search.py --confirm NAME   # fold 4, once, for one candidate

Staged rather than one giant grid so each stage's conclusion is readable, and so the number
of configurations scored on the selection folds stays countable — which matters, because
that count is exactly how much the winning validation score is inflated.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd

from search import (
    SELECTION_FOLDS,
    Candidate,
    coverage_curve,
    load_pre_holdout,
    run_candidate,
)
from copilot.validation import purged_walk_forward

OUT = Path(__file__).resolve().parent / "results"
OUT.mkdir(exist_ok=True)


def stage1() -> list[Candidate]:
    """Algorithms, on the existing features. Which model family suits this signal at all."""
    return [
        Candidate("lgbm-shipped", "lgbm", params=dict(num_leaves=7, learning_rate=0.03, min_child_samples=200, n_estimators=300)),
        Candidate("lgbm-deeper", "lgbm", params=dict(num_leaves=31, learning_rate=0.02, min_child_samples=300, n_estimators=600)),
        Candidate("lgbm-stumps", "lgbm", params=dict(num_leaves=3, learning_rate=0.02, min_child_samples=500, n_estimators=800)),
        Candidate("lgbm-heavyreg", "lgbm", params=dict(num_leaves=7, learning_rate=0.01, min_child_samples=1000, n_estimators=800, reg_lambda=10.0, subsample=0.7, subsample_freq=1, colsample_bytree=0.6)),
        Candidate("hgb-default", "hgb", params=dict(max_iter=300, learning_rate=0.03, max_leaf_nodes=15, min_samples_leaf=200, l2_regularization=1.0)),
        Candidate("rf-500", "rf", params=dict(n_estimators=500, min_samples_leaf=50, max_features="sqrt")),
        Candidate("et-500", "et", params=dict(n_estimators=500, min_samples_leaf=50, max_features="sqrt")),
        Candidate("logit-l2", "logit", params=dict(C=0.1)),
        Candidate("logit-tight", "logit", params=dict(C=0.01)),
    ]


def stage2(best_model: str, best_params: dict) -> list[Candidate]:
    """Feature sets, on whichever algorithm stage 1 liked."""
    return [
        Candidate(f"{best_model}-{fs}", best_model, features=fs, params=best_params)
        for fs in ("baseline", "xsection", "volstruct", "reversal", "all")
    ]


def stage3(model: str, params: dict, features: str) -> list[Candidate]:
    """Noise reduction, on the best model+features so far."""
    return [
        Candidate("nr-none", model, features=features, params=params),
        Candidate("nr-winsor-01", model, features=features, params=params, winsorize=0.01),
        Candidate("nr-winsor-05", model, features=features, params=params, winsorize=0.05),
        Candidate("nr-rank", model, features=features, params=params, rank_transform=True),
        Candidate("nr-rank-winsor", model, features=features, params=params, rank_transform=True, winsorize=0.01),
        Candidate("nr-top20", model, features=features, params=params, drop_weak=20),
        Candidate("nr-top30-winsor", model, features=features, params=params, drop_weak=30, winsorize=0.01),
    ]


def leaderboard(rows: list[dict]) -> None:
    rows = sorted(rows, key=lambda r: -r["accuracy"])
    print()
    print(f"{'candidate':<24} {'model':<7} {'features':<10} {'acc':>8} {'auc':>7} {'logloss':>8} {'fold sd':>8}")
    print("-" * 80)
    for r in rows:
        print(
            f"{r['name']:<24} {r['model']:<7} {r['features']:<10} "
            f"{r['accuracy'] * 100:7.2f}% {r['auc']:7.4f} {r['logloss']:8.5f} "
            f"{r['fold_accuracy_std'] * 100:7.2f}%"
        )
    print()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", type=int, default=1)
    ap.add_argument("--confirm", type=str, default=None)
    ap.add_argument("--model", type=str, default="lgbm")
    ap.add_argument("--features", type=str, default="baseline")
    ap.add_argument("--params", type=str, default="{}")
    args = ap.parse_args()

    panel = load_pre_holdout()
    all_folds = list(purged_walk_forward(panel["date"]))
    sel = all_folds[:SELECTION_FOLDS]
    confirm_fold = all_folds[SELECTION_FOLDS:]

    print(f"pre-holdout rows : {len(panel):,}")
    print(f"selection folds  : {', '.join(f.name for f in sel)}")
    print(f"confirmation     : {', '.join(f.name for f in confirm_fold)} (untouched until --confirm)")

    params = json.loads(args.params)

    if args.confirm:
        cand = Candidate(args.confirm, args.model, features=args.features, params=params)
        print(f"\n=== CONFIRMATION on {confirm_fold[0].name}, one shot ===")
        res = run_candidate(panel, cand, confirm_fold, verbose=True)
        print(json.dumps({k: v for k, v in res.items() if k != "per_fold"}, indent=1))
        (OUT / f"confirm-{args.confirm}.json").write_text(json.dumps(res, indent=1))
        return 0

    if args.stage == 1:
        cands = stage1()
    elif args.stage == 2:
        cands = stage2(args.model, params)
    else:
        cands = stage3(args.model, params, args.features)

    rows = []
    for cand in cands:
        started = time.time()
        print(f"\n  [{cand.name}] model={cand.model} features={cand.features}", flush=True)
        try:
            res = run_candidate(panel, cand, sel, verbose=True)
        except Exception as exc:  # one bad candidate must not end the search
            print(f"      FAILED: {type(exc).__name__}: {exc}", flush=True)
            continue
        res["seconds"] = round(time.time() - started, 1)
        rows.append(res)
        print(f"      -> acc {res['accuracy'] * 100:.2f}%  auc {res['auc']:.4f}  ({res['seconds']}s)", flush=True)

    leaderboard(rows)
    (OUT / f"stage{args.stage}.json").write_text(json.dumps(rows, indent=1))
    print(f"written: {OUT / f'stage{args.stage}.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
