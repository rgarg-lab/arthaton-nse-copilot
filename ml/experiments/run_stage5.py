"""Stage 5: the two levers stages 1-4 did not touch.

Both are motivated by patterns already visible in the measurements rather than by hope:

* **Recency weighting.** Selection accuracy falls monotonically by fold — 56.6% (2022),
  54.4% (2023), 52.3% (2024). Either the market got more efficient or the exploitable
  structure is recent. If old rows are actively misleading, down-weighting them should help;
  if the decline is just noise, it will not.

* **Regime-specialised models.** The holdout breakdown spreads ten points across volatility
  terciles (calm 50.5%, normal 48.2%, stressed 58.1%) and the normal tercile has an AUC
  below 0.5. One model fitted across all three may be averaging incompatible regimes.

Still selection folds only. The confirmation fold and the holdout stay untouched.
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

BEST = ("et", dict(n_estimators=500, min_samples_leaf=50, max_features="sqrt"))
SHIPPED = ("lgbm", dict(num_leaves=7, learning_rate=0.03, min_child_samples=200, n_estimators=300))


def _oof(panel, folds, fit_fn, label: str) -> dict:
    """Generic out-of-fold runner; `fit_fn(Xtr, ytr, tr, Xva, va, use) -> p`."""
    built, extra = FEATURE_SETS["baseline"](panel)
    cols = list(dict.fromkeys(feature_columns(built) + extra))
    cand = Candidate(label, BEST[0])
    ys, ps = [], []
    for fold in folds:
        train = built.iloc[fold.train_idx]
        val = built.iloc[fold.val_idx]
        _assert_no_holdout(train, f"{label}/train")
        _assert_no_holdout(val, f"{label}/val")
        Xtr, Xva, use = _prepare(train, val, cols, cand)
        ytr = train["y_dir"].to_numpy(dtype=float)
        ps.append(fit_fn(Xtr, ytr, train, Xva, val, use))
        ys.append(val["y_dir"].to_numpy(dtype=float))
    y, p = np.concatenate(ys), np.concatenate(ps)
    res = {
        "name": label,
        "n": int(len(y)),
        "accuracy": float(((p > 0.5).astype(float) == y).mean()),
        "auc": _auc(y, p),
        "logloss": _logloss(y, p),
        "coverage_curve": coverage_curve(y, p),
    }
    print(f"      -> acc {res['accuracy'] * 100:.2f}%  auc {res['auc']:.4f}", flush=True)
    return res


def recency(halflife_days: float, kind=BEST):
    """Exponential decay on sample weight by row age, in calendar days."""

    def fit(Xtr, ytr, tr, Xva, va, use):
        age = (tr["date"].max() - tr["date"]).dt.days.to_numpy(dtype=float)
        w = np.exp(-np.log(2) * age / halflife_days)
        model = make_model(kind[0], kind[1])
        model.fit(Xtr[use], ytr, sample_weight=w)
        return model.predict_proba(Xva[use])[:, 1]

    return fit


def per_regime(kind=BEST):
    """One model per VIX tercile, each fitted only on that regime's training rows.

    Falls back to the pooled model for a regime with too few rows to fit — which is the
    honest failure mode, not an error.
    """

    def fit(Xtr, ytr, tr, Xva, va, use):
        reg_tr = Xtr["vix_regime"].to_numpy()
        reg_va = Xva["vix_regime"].to_numpy()
        pooled = make_model(kind[0], kind[1])
        pooled.fit(Xtr[use], ytr)
        p = pooled.predict_proba(Xva[use])[:, 1]

        for r in np.unique(reg_tr):
            m_tr = reg_tr == r
            m_va = reg_va == r
            if m_va.sum() == 0 or m_tr.sum() < 2000 or len(np.unique(ytr[m_tr])) < 2:
                continue
            sub = make_model(kind[0], kind[1])
            sub.fit(Xtr.loc[m_tr, use], ytr[m_tr])
            p[m_va] = sub.predict_proba(Xva.loc[m_va, use])[:, 1]
        return p

    return fit


def plain(kind=BEST):
    def fit(Xtr, ytr, tr, Xva, va, use):
        model = make_model(kind[0], kind[1])
        model.fit(Xtr[use], ytr)
        return model.predict_proba(Xva[use])[:, 1]

    return fit


def main() -> int:
    panel = load_pre_holdout()
    folds = list(purged_walk_forward(panel["date"]))
    sel = folds[:SELECTION_FOLDS]
    print(f"selection folds: {', '.join(f.name for f in sel)}\n")

    jobs = [
        ("baseline-et", plain()),
        ("recency-hl-365", recency(365.0)),
        ("recency-hl-730", recency(730.0)),
        ("recency-hl-1460", recency(1460.0)),
        ("per-regime-et", per_regime()),
        ("per-regime-lgbm", per_regime(SHIPPED)),
    ]

    rows = []
    for label, fn in jobs:
        print(f"  [{label}]", flush=True)
        started = time.time()
        try:
            res = _oof(panel, sel, fn, label)
            res["seconds"] = round(time.time() - started, 1)
            rows.append(res)
        except Exception as exc:
            print(f"      FAILED: {type(exc).__name__}: {exc}", flush=True)

    rows.sort(key=lambda r: -r["accuracy"])
    print(f"\n{'candidate':<20} {'acc':>8} {'auc':>8}")
    print("-" * 38)
    for r in rows:
        print(f"{r['name']:<20} {r['accuracy'] * 100:7.2f}% {r['auc']:8.4f}")

    (OUT / "stage5.json").write_text(json.dumps(rows, indent=1))
    print(f"\nwritten: {OUT / 'stage5.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
