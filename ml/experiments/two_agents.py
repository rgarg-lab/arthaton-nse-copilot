"""Two independent agents, and whether their agreement is worth anything.

## The idea being tested

Train two models that cannot see each other's data:

* **technical** — 34 features about the stock itself: returns, moving-average deviations,
  RSI, MACD, realised volatility, volume, cross-sectional ranks, calendar, sentiment.
* **macro** — 24 features about the world around it: Nifty, Nifty Energy, India VIX, Brent,
  USD/INR, gold, S&P 500, Nasdaq, and relative strength against market and sector.

Then ask what happens when they agree. If two models looking at disjoint information reach
the same conclusion, that agreement should carry information the pooled model's single
probability does not — and the sessions where they disagree should be measurably worse.

This is a real technique (ensemble disagreement as an uncertainty estimate) and it is also
the architecture the original version of this project used, where a main agent and a macro
agent were combined and conflicts resolved by confidence.

## What would make it a genuine improvement

Not a higher number on its own — a higher number *on a usefully large subset*, that survives
the confirmation fold. The pooled model already reaches ~63% on the 16% of sessions above
its gate; agreement is only interesting if it beats that trade-off, either by covering more
sessions at the same accuracy or by being more accurate at the same coverage.

## What is measured

Per fold, out-of-sample:

* each agent alone,
* accuracy when they agree on direction, and on what share of sessions,
* accuracy when they disagree — the number that says whether disagreement is a real warning
  or just noise,
* and agreement *plus* conviction, which is the original design's "both agree and both
  confident" case.

Selection on folds 1-3, confirmation once on fold 4, holdout never touched.
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
    _assert_no_holdout,
    _auc,
    _prepare,
    load_pre_holdout,
    make_model,
)
from copilot.features import feature_columns  # noqa: E402
from copilot.validation import purged_walk_forward  # noqa: E402

OUT = Path(__file__).resolve().parent / "results"
OUT.mkdir(exist_ok=True)

# The pooled model's own settings, so a difference is attributable to the split rather than
# to one agent having been tuned harder than the other.
PARAMS = dict(num_leaves=7, learning_rate=0.03, min_child_samples=200, n_estimators=300)


def split_features(columns: list[str]) -> tuple[list[str], list[str]]:
    """Macro features versus everything else. Disjoint by construction."""
    macro = [c for c in columns if c.startswith("mac_") or c.startswith("rs_")]
    technical = [c for c in columns if c not in macro]
    return technical, macro


def _fit_predict(Xtr, ytr, Xva, cols: list[str]) -> np.ndarray:
    model = make_model("lgbm", PARAMS)
    model.fit(Xtr[cols], ytr)
    return model.predict_proba(Xva[cols])[:, 1]


def run(panel: pd.DataFrame, folds: list) -> dict:
    cols = feature_columns(panel)
    cand = Candidate("agents", "lgbm")

    acc = {"technical": [], "macro": [], "pooled": []}
    rows = []
    ys, p_tech, p_macro, p_pool = [], [], [], []

    for fold in folds:
        train = panel.iloc[fold.train_idx]
        val = panel.iloc[fold.val_idx]
        _assert_no_holdout(train, "two_agents/train")
        _assert_no_holdout(val, "two_agents/val")

        Xtr, Xva, use = _prepare(train, val, cols, cand)
        tech_cols, macro_cols = split_features(use)
        ytr = train["y_dir"].to_numpy(dtype=float)
        y = val["y_dir"].to_numpy(dtype=float)

        pt = _fit_predict(Xtr, ytr, Xva, tech_cols)
        pm = _fit_predict(Xtr, ytr, Xva, macro_cols)
        pp = _fit_predict(Xtr, ytr, Xva, use)

        ys.append(y)
        p_tech.append(pt)
        p_macro.append(pm)
        p_pool.append(pp)
        for name, p in (("technical", pt), ("macro", pm), ("pooled", pp)):
            acc[name].append(float(((p > 0.5).astype(float) == y).mean()))
        rows.append({"fold": fold.name, "n": int(len(y))})

    y = np.concatenate(ys)
    pt, pm, pp = (np.concatenate(x) for x in (p_tech, p_macro, p_pool))

    agree = (pt > 0.5) == (pm > 0.5)
    # When they agree, the agreed direction is either model's sign; average the two
    # probabilities for a combined conviction.
    combined = (pt + pm) / 2.0
    conviction = np.maximum(combined, 1 - combined)

    def score(mask: np.ndarray, p: np.ndarray) -> dict:
        n = int(mask.sum())
        if n < 50:
            return {"n": n, "coverage": float(mask.mean()), "accuracy": None}
        return {
            "n": n,
            "coverage": float(mask.mean()),
            "accuracy": float(((p[mask] > 0.5).astype(float) == y[mask]).mean()),
        }

    out = {
        "n": int(len(y)),
        "solo": {
            name: {
                "accuracy": float(((p > 0.5).astype(float) == y).mean()),
                "auc": _auc(y, p),
                "per_fold": acc[name],
            }
            for name, p in (("technical", pt), ("macro", pm), ("pooled", pp))
        },
        "agreement_rate": float(agree.mean()),
        "agree": score(agree, combined),
        "disagree": score(~agree, pp),
        # The original design's case: both agree *and* the combined conviction clears a gate.
        "agree_and_confident": {
            f"{gate:.2f}": score(agree & (conviction >= gate), combined)
            for gate in (0.52, 0.55, 0.58, 0.60, 0.62, 0.65)
        },
        "folds": rows,
    }
    return out


def report(label: str, r: dict) -> None:
    print(f"\n=== {label} ===")
    print(f"  rows {r['n']:,}   agreement rate {r['agreement_rate'] * 100:.1f}%")
    print(f"  {'agent':<12} {'accuracy':>9} {'auc':>8}")
    for name, s in r["solo"].items():
        print(f"  {name:<12} {s['accuracy'] * 100:8.2f}% {s['auc']:8.4f}")
    a, d = r["agree"], r["disagree"]
    print(
        f"\n  when they AGREE    : {a['accuracy'] * 100:.2f}% on {a['coverage'] * 100:.1f}% "
        f"of sessions ({a['n']:,} rows)"
        if a["accuracy"] is not None
        else "\n  when they AGREE    : too few rows"
    )
    print(
        f"  when they DISAGREE : {d['accuracy'] * 100:.2f}% on {d['coverage'] * 100:.1f}% "
        f"of sessions ({d['n']:,} rows)"
        if d["accuracy"] is not None
        else "  when they DISAGREE : too few rows"
    )
    print(f"\n  agree AND combined conviction over a gate:")
    print(f"    {'gate':>5} {'coverage':>9} {'n':>7} {'accuracy':>9}")
    for gate, s in r["agree_and_confident"].items():
        if s["accuracy"] is None:
            continue
        flag = "  <= 60%+" if s["accuracy"] >= 0.60 else ""
        print(
            f"    {gate:>5} {s['coverage'] * 100:8.2f}% {s['n']:7d} "
            f"{s['accuracy'] * 100:8.2f}%{flag}"
        )


def main() -> int:
    panel = load_pre_holdout()
    folds = list(purged_walk_forward(panel["date"]))
    sel, confirm = folds[:SELECTION_FOLDS], folds[SELECTION_FOLDS:]

    print(f"pre-holdout rows {len(panel):,} — holdout never read")
    tech, macro = split_features(feature_columns(panel))
    print(f"technical agent: {len(tech)} features · macro agent: {len(macro)} features")

    selection = run(panel, sel)
    report("SELECTION folds (2022, 2023, 2024)", selection)

    confirmation = run(panel, confirm)
    report("CONFIRMATION fold (2025 H1) — chose nothing", confirmation)

    (OUT / "two_agents.json").write_text(
        json.dumps({"selection": selection, "confirmation": confirmation}, indent=1)
    )
    print(f"\nwritten: {OUT / 'two_agents.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
