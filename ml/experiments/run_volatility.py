"""Stage 7: predict whether tomorrow is a BIG MOVE, instead of which way it moves.

## Why this is the right question to ask of the same data

Direction is close to a martingale — 29 configurations said so, all landing near 51.5% on
data that had not selected them. Volatility is not. Volatility *clusters*: a turbulent
session is followed by a turbulent session far more often than chance, and that is one of
the most robust facts in empirical finance.

It is also a better fit for the user this product names. "A salaried investor deciding
whether today is a day to act or wait" is asking about *magnitude*, not sign — whether
tomorrow is likely to be a session where anything happens at all. A direction model answers
a question they did not ask; this answers the one they did.

## The target, and why it cannot leak

    y_big = 1 if |next session return| > median(|return|) over the trailing 20 sessions

The label looks one session forward — that is the thing being predicted. The *threshold* it
is compared against is computed from the trailing window up to and including today, so it is
known at decision time. Nothing in the feature matrix sees tomorrow.

Base rate is near 50% by construction (it is a median split), so accuracy is directly
comparable to the direction model's and to a coin flip. That is deliberate: a target with a
70% base rate would make 70% accuracy meaningless, and the point of this file is a number
that can be compared to the 51% it is being offered against.

## Same discipline as everything else

Selection on folds 1-3, confirmation once on fold 4, holdout never touched. The shipped
direction model is not modified — this is a candidate for an *additional* output, measured
before anything is claimed about it.
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

OUT = Path(__file__).resolve().parent / "results"
OUT.mkdir(exist_ok=True)

CANDIDATES = [
    ("lgbm", dict(num_leaves=31, learning_rate=0.03, min_child_samples=200, n_estimators=400)),
    ("lgbm-reg", dict(num_leaves=7, learning_rate=0.03, min_child_samples=500, n_estimators=400)),
    ("et", dict(n_estimators=500, min_samples_leaf=50, max_features="sqrt")),
    ("hgb", dict(max_iter=300, learning_rate=0.03, max_leaf_nodes=31, min_samples_leaf=100)),
    ("logit", dict(C=0.1)),
]


def add_magnitude_label(panel: pd.DataFrame, window: int = 20) -> pd.DataFrame:
    """`y_big`: is tomorrow's absolute move larger than the recent typical one?

    The comparison threshold is a trailing median of |ret_1| per ticker, shifted so it uses
    only sessions up to and including today. `y_ret` is the next session's return, which is
    the label's one and only look forward.
    """
    out = panel.sort_values(["ticker", "date"]).copy()
    typical = (
        out.groupby("ticker")["ret_1"]
        .transform(lambda s: s.abs().rolling(window, min_periods=window).median())
    )
    out["typical_move"] = typical
    out["y_big"] = (out["y_ret"].abs() > typical).astype(float)
    # Rows with no trailing window yet have no threshold and therefore no label.
    out = out[typical.notna()].reset_index(drop=True)
    return out


# Columns that exist to build or hold a label, and must never be features.
#
# `feature_columns()` discovers columns by pattern, so it happily returned `y_big` — the
# label — and `typical_move`, the threshold it is defined against. Handing a model its own
# label produces exactly what it produced here on the first run: 100.00% accuracy and an
# AUC of 1.0000 on every one of five algorithms, which is the signature of a leak and not
# of a result. It is the same mistake, in miniature, that this project exists as a reaction
# to.
LABEL_COLUMNS = ("y_big", "y_dir", "y_ret", "typical_move")


def _without_labels(columns: list[str]) -> list[str]:
    return [c for c in columns if c not in LABEL_COLUMNS and not c.startswith("y_")]


def run(panel: pd.DataFrame, folds: list, kind: str, params: dict) -> dict:
    built, extra = FEATURE_SETS["baseline"](panel)
    cols = _without_labels(list(dict.fromkeys(feature_columns(built) + extra)))
    cand = Candidate("vol", kind)
    _assert_no_holdout(built, "volatility")

    ys, ps, per_fold = [], [], []
    for fold in folds:
        train = built.iloc[fold.train_idx]
        val = built.iloc[fold.val_idx]
        _assert_no_holdout(train, "volatility/train")
        _assert_no_holdout(val, "volatility/val")

        Xtr, Xva, use = _prepare(train, val, cols, cand)
        use = _without_labels(use)
        # A guard, not a comment: if a label ever reaches the matrix again, stop rather
        # than report the 100% that follows.
        leaked = [c for c in use if c in LABEL_COLUMNS or c.startswith("y_")]
        if leaked:
            raise RuntimeError(f"label columns reached the feature matrix: {leaked}")
        ytr = train["y_big"].to_numpy(dtype=float)
        yva = val["y_big"].to_numpy(dtype=float)

        model = make_model(kind.replace("-reg", ""), params)
        model.fit(Xtr[use], ytr)
        p = model.predict_proba(Xva[use])[:, 1]

        ys.append(yva)
        ps.append(p)
        per_fold.append(
            {
                "fold": fold.name,
                "n": int(len(yva)),
                "accuracy": float(((p > 0.5).astype(float) == yva).mean()),
                "base_rate": float(yva.mean()),
            }
        )

    y, p = np.concatenate(ys), np.concatenate(ps)
    return {
        "name": f"vol-{kind}",
        "n": int(len(y)),
        "base_rate": float(y.mean()),
        "accuracy": float(((p > 0.5).astype(float) == y).mean()),
        "auc": _auc(y, p),
        "logloss": _logloss(y, p),
        "per_fold": per_fold,
        "coverage_curve": coverage_curve(y, p),
    }


def main() -> int:
    raw = load_pre_holdout()
    panel = add_magnitude_label(raw)
    folds = list(purged_walk_forward(panel["date"]))
    sel = folds[:SELECTION_FOLDS]
    confirm = folds[SELECTION_FOLDS]

    print(f"rows with a magnitude label : {len(panel):,}")
    print(f"base rate (big move)        : {panel['y_big'].mean():.4f}  <- near 0.5 by construction")
    print(f"selection folds             : {', '.join(f.name for f in sel)}")
    print(f"confirmation                : {confirm.name}\n")

    rows = []
    for kind, params in CANDIDATES:
        print(f"  [{kind}]", flush=True)
        started = time.time()
        try:
            res = run(panel, sel, kind, params)
            res["seconds"] = round(time.time() - started, 1)
            rows.append(res)
            print(
                f"      -> acc {res['accuracy'] * 100:.2f}%  auc {res['auc']:.4f}  "
                f"(base {res['base_rate'] * 100:.1f}%)",
                flush=True,
            )
        except Exception as exc:
            print(f"      FAILED: {type(exc).__name__}: {exc}", flush=True)

    if not rows:
        print("no candidate completed")
        return 1

    rows.sort(key=lambda r: -r["accuracy"])
    print(f"\n{'candidate':<14} {'acc':>8} {'auc':>8} {'base':>7}")
    print("-" * 42)
    for r in rows:
        print(f"{r['name']:<14} {r['accuracy'] * 100:7.2f}% {r['auc']:8.4f} {r['base_rate'] * 100:6.1f}%")

    best = rows[0]
    print(f"\n  coverage curve, {best['name']} (selection folds):")
    print(f"    {'thr':>5} {'coverage':>9} {'n':>7} {'accuracy':>9}")
    for r in best["coverage_curve"]:
        print(f"    {r['threshold']:5.2f} {r['coverage'] * 100:8.2f}% {r['n']:7d} {r['accuracy'] * 100:8.2f}%")

    # One confirmation run for the winner, on the fold that chose nothing.
    kind = best["name"].replace("vol-", "")
    params = dict(CANDIDATES)[kind]
    print(f"\n=== CONFIRMATION on {confirm.name}, once, for {best['name']} ===")
    conf = run(panel, [confirm], kind, params)
    print(f"  accuracy {conf['accuracy'] * 100:.2f}%   auc {conf['auc']:.4f}   base {conf['base_rate'] * 100:.1f}%")
    print(f"    {'thr':>5} {'coverage':>9} {'n':>7} {'accuracy':>9}")
    for r in conf["coverage_curve"]:
        flag = "  <= 60%+" if r["accuracy"] >= 0.60 else ""
        print(
            f"    {r['threshold']:5.2f} {r['coverage'] * 100:8.2f}% {r['n']:7d} "
            f"{r['accuracy'] * 100:8.2f}%{flag}"
        )

    (OUT / "volatility.json").write_text(
        json.dumps({"selection": rows, "confirmation": conf}, indent=1)
    )
    print(f"\nwritten: {OUT / 'volatility.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
