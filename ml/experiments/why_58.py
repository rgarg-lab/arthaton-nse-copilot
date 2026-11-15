"""Reproduce the old 58%, on purpose, to show exactly where it came from.

The question this answers is a fair one: the earlier version of this project reported above
58% accuracy, and ~70% on its high-confidence subset. This one reports 51.37%. Something
changed, and "the old number was leaky" is an assertion until it is measured.

So this measures it. Starting from the current honest setup, the two documented differences
of the old pipeline are added back one at a time:

1. **A row-wise random split** instead of splitting on dates. The panel is 18 tickers
   sharing the same ~2,900 sessions, so a random split puts 2022-03-11 Reliance in train
   and 2022-03-11 Infosys in test. The cross-sectional rank features make same-date rows
   directly informative about each other, and there is no embargo, so feature windows
   overlap across the boundary too.

2. **Raw price levels and close lags** as features. A tree splitting on an absolute rupee
   price is really splitting on *time* — a ₹2,400 Reliance is 2024 Reliance. Combined with a
   random split, where those same dates appear in training, the model can look up the
   neighbourhood of the answer rather than predict it.

Each run reports accuracy and, for the high-confidence subset, the accuracy at the
conviction levels where the old project quoted ~70%.

Nothing here is a result. Every row in the output table except the first is a demonstration
of a specific way to inflate a number, and the gap between the first row and the last is the
answer to "why is it this low right now".

Holdout untouched throughout.
"""

from __future__ import annotations

import json
import sys
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
    _prepare,
    load_pre_holdout,
    make_model,
)
from copilot.features import feature_columns  # noqa: E402
from copilot.validation import purged_walk_forward  # noqa: E402

OUT = Path(__file__).resolve().parent / "results"
MODEL = ("lgbm", dict(num_leaves=31, learning_rate=0.03, min_child_samples=100, n_estimators=400))
SEED = 7


def add_price_features(panel: pd.DataFrame, lags: int = 30) -> tuple[pd.DataFrame, list[str]]:
    """The absolute close and 30 raw close lags — the old project's feature block."""
    out = panel.sort_values(["ticker", "date"]).copy()
    names = ["px_close"]
    out["px_close"] = out["close"]
    for k in range(1, lags + 1):
        col = f"px_close_lag{k}"
        out[col] = out.groupby("ticker")["close"].shift(k)
        names.append(col)
    return out, names


def conviction_table(y: np.ndarray, p: np.ndarray) -> list[dict]:
    rows = []
    for thr in (0.5, 0.6, 0.7, 0.8, 0.9):
        mask = (p >= thr) | (p <= 1 - thr)
        n = int(mask.sum())
        if n < 20:
            continue
        rows.append(
            {
                "threshold": thr,
                "coverage": float(mask.mean()),
                "n": n,
                "accuracy": float(((p[mask] > 0.5).astype(float) == y[mask]).mean()),
            }
        )
    return rows


def evaluate(
    panel: pd.DataFrame, label: str, *, random_split: bool, with_prices: bool
) -> dict:
    built = panel
    extra: list[str] = []
    if with_prices:
        built, extra = add_price_features(built)
    _assert_no_holdout(built, f"why58/{label}")

    cols = list(dict.fromkeys(feature_columns(built) + extra))
    # `close` is in the panel but is never a feature in the honest setup; only the
    # with_prices variant may use it, via px_close.
    cols = [c for c in cols if c not in ("close", "y_dir", "y_ret") and not c.startswith("y_")]
    cand = Candidate(label, MODEL[0])

    if random_split:
        # The old pipeline's split: shuffle rows, take 80/20, no dates involved, no embargo.
        rng = np.random.default_rng(SEED)
        idx = rng.permutation(len(built))
        cut = int(len(built) * 0.8)
        splits = [(idx[:cut], idx[cut:])]
    else:
        folds = list(purged_walk_forward(built["date"]))[:SELECTION_FOLDS]
        splits = [(f.train_idx, f.val_idx) for f in folds]

    ys, ps = [], []
    for train_idx, val_idx in splits:
        train = built.iloc[train_idx]
        val = built.iloc[val_idx]
        Xtr, Xva, use = _prepare(train, val, cols, cand)
        use = [c for c in use if not c.startswith("y_")]
        model = make_model(MODEL[0], MODEL[1])
        model.fit(Xtr[use], train["y_dir"].to_numpy(dtype=float))
        ps.append(model.predict_proba(Xva[use])[:, 1])
        ys.append(val["y_dir"].to_numpy(dtype=float))

    y, p = np.concatenate(ys), np.concatenate(ps)
    return {
        "label": label,
        "random_split": random_split,
        "with_prices": with_prices,
        "n": int(len(y)),
        "accuracy": float(((p > 0.5).astype(float) == y).mean()),
        "auc": _auc(y, p),
        "conviction": conviction_table(y, p),
    }


def main() -> int:
    panel = load_pre_holdout()
    print(f"pre-holdout rows: {len(panel):,}   (holdout never read)\n")

    runs = [
        ("1. honest setup (date split, no prices)", False, False),
        ("2. + raw prices and 30 close lags", False, True),
        ("3. + row-wise random split", True, False),
        ("4. BOTH (the old pipeline)", True, True),
    ]

    results = []
    for label, random_split, with_prices in runs:
        print(f"  [{label}]", flush=True)
        res = evaluate(panel, label, random_split=random_split, with_prices=with_prices)
        results.append(res)
        print(f"      accuracy {res['accuracy'] * 100:.2f}%   auc {res['auc']:.4f}", flush=True)

    print(f"\n{'setup':<42} {'accuracy':>9} {'auc':>8}")
    print("-" * 62)
    for r in results:
        print(f"{r['label']:<42} {r['accuracy'] * 100:8.2f}% {r['auc']:8.4f}")

    print("\nhigh-confidence subsets (where the old project quoted ~70%):")
    for r in results:
        print(f"\n  {r['label']}")
        print(f"    {'thr':>5} {'coverage':>9} {'n':>7} {'accuracy':>9}")
        for c in r["conviction"]:
            print(
                f"    {c['threshold']:5.2f} {c['coverage'] * 100:8.2f}% {c['n']:7d} "
                f"{c['accuracy'] * 100:8.2f}%"
            )

    OUT.mkdir(exist_ok=True)
    (OUT / "why_58.json").write_text(json.dumps(results, indent=1))
    print(f"\nwritten: {OUT / 'why_58.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
