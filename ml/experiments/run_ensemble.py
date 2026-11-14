"""Stage 4: ensembling, the last lever, plus the rank-transform variants that failed.

Why ensembling is tried last and separately: averaging several decorrelated models is the
one technique that reliably adds a little accuracy without adding information, so it is the
honest ceiling-finder. If an ensemble of the best families cannot reach the target, no
amount of further tuning of a single family will.

Everything here is still selection-fold only. The confirmation fold stays untouched.
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
    _auc,
    _logloss,
    _prepare,
    FEATURE_SETS,
    coverage_curve,
    load_pre_holdout,
    make_model,
    run_candidate,
)
from copilot.features import feature_columns  # noqa: E402
from copilot.validation import purged_walk_forward  # noqa: E402

OUT = Path(__file__).resolve().parent / "results"
OUT.mkdir(exist_ok=True)

MEMBERS = [
    ("et", dict(n_estimators=500, min_samples_leaf=50, max_features="sqrt")),
    ("rf", dict(n_estimators=500, min_samples_leaf=50, max_features="sqrt")),
    ("lgbm", dict(num_leaves=31, learning_rate=0.02, min_child_samples=300, n_estimators=600)),
    ("hgb", dict(max_iter=300, learning_rate=0.03, max_leaf_nodes=15, min_samples_leaf=200, l2_regularization=1.0)),
    ("logit", dict(C=0.01)),
]


def ensemble_oof(panel: pd.DataFrame, folds: list, features: str = "baseline") -> dict:
    """Average the members' probabilities, out of fold."""
    built, extra = FEATURE_SETS[features](panel)
    cols = list(dict.fromkeys(feature_columns(built) + extra))
    cand = Candidate("ens", "et", features=features)

    ys, per_member, mean_ps = [], {name: [] for name, _ in MEMBERS}, []
    for fold in folds:
        train = built.iloc[fold.train_idx]
        val = built.iloc[fold.val_idx]
        Xtr, Xva, use = _prepare(train, val, cols, cand)
        ytr = train["y_dir"].to_numpy(dtype=float)
        ys.append(val["y_dir"].to_numpy(dtype=float))

        preds = []
        for name, params in MEMBERS:
            model = make_model(name, params)
            model.fit(Xtr[use], ytr)
            p = model.predict_proba(Xva[use])[:, 1]
            per_member[name].append(p)
            preds.append(p)
        mean_ps.append(np.mean(preds, axis=0))

    y = np.concatenate(ys)
    p = np.concatenate(mean_ps)
    out = {
        "name": "ensemble-mean",
        "n": int(len(y)),
        "accuracy": float(((p > 0.5).astype(float) == y).mean()),
        "auc": _auc(y, p),
        "logloss": _logloss(y, p),
        "members": {},
        "coverage_curve": coverage_curve(y, p),
    }
    for name in per_member:
        mp = np.concatenate(per_member[name])
        out["members"][name] = {
            "accuracy": float(((mp > 0.5).astype(float) == y).mean()),
            "auc": _auc(y, mp),
        }
    # How decorrelated the members are: a high mean correlation means averaging cannot help.
    mat = np.vstack([np.concatenate(per_member[n]) for n in per_member])
    corr = np.corrcoef(mat)
    out["mean_member_correlation"] = float(
        corr[np.triu_indices_from(corr, k=1)].mean()
    )
    return out


def main() -> int:
    panel = load_pre_holdout()
    folds = list(purged_walk_forward(panel["date"]))
    sel = folds[:SELECTION_FOLDS]
    print(f"selection folds: {', '.join(f.name for f in sel)}\n")

    rows = []

    # The two rank-transform variants that failed on a missing `date` column.
    for cand in (
        Candidate("nr-rank", "et", params=MEMBERS[0][1], rank_transform=True),
        Candidate("nr-rank-winsor", "et", params=MEMBERS[0][1], rank_transform=True, winsorize=0.01),
    ):
        print(f"  [{cand.name}]", flush=True)
        started = time.time()
        try:
            res = run_candidate(panel, cand, sel)
            res["seconds"] = round(time.time() - started, 1)
            rows.append(res)
            print(f"      -> acc {res['accuracy'] * 100:.2f}%  auc {res['auc']:.4f}", flush=True)
        except Exception as exc:
            print(f"      FAILED: {type(exc).__name__}: {exc}", flush=True)

    print("\n  [ensemble-mean] 5 families averaged", flush=True)
    started = time.time()
    ens = ensemble_oof(panel, sel)
    ens["seconds"] = round(time.time() - started, 1)
    print(f"      -> acc {ens['accuracy'] * 100:.2f}%  auc {ens['auc']:.4f}", flush=True)
    print(f"      mean member correlation: {ens['mean_member_correlation']:.3f}")
    for name, m in ens["members"].items():
        print(f"        {name:<6} {m['accuracy'] * 100:6.2f}%  auc {m['auc']:.4f}")

    print("\n  coverage curve for the ensemble (accuracy if it only calls the confident ones):")
    print(f"    {'thr':>5} {'coverage':>9} {'n':>7} {'accuracy':>9}")
    for r in ens["coverage_curve"]:
        print(f"    {r['threshold']:5.2f} {r['coverage'] * 100:8.2f}% {r['n']:7d} {r['accuracy'] * 100:8.2f}%")

    rows.append(ens)
    (OUT / "stage4.json").write_text(json.dumps(rows, indent=1))
    print(f"\nwritten: {OUT / 'stage4.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
