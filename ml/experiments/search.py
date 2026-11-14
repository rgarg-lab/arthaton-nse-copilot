"""Accuracy search: algorithms, features, noise reduction — on validation only.

## The rule this whole file exists to respect

The final holdout (``>= HOLDOUT_START``, 2025-07-01) has been read **once**, and
``ml/artifacts/holdout_ledger.json`` is the committed proof. Nothing here may touch it.
``_assert_no_holdout`` is called on every frame that reaches a model, so a mistake raises
instead of quietly spending the one measurement the project's credibility rests on.

## The experimental design, and why it is not just "best on validation"

Searching dozens of configurations and reporting the best validation score is how people
produce numbers that evaporate out of sample — the maximum over many noisy estimates is
biased upward, and the more you search the worse it gets.

So the pre-holdout data is split again:

* **Selection folds** — the first three walk-forward folds (validation years 2022, 2023,
  2024). Every candidate is scored here, and this is the only signal used to choose.
* **Confirmation fold** — the fourth fold (2025 H1). Scored **once**, for the winner only,
  after selection is finished. It is the honest estimate of what the winner actually does on
  data that played no part in choosing it.

A gap between the two is the measure of how much of the gain was search noise. Reporting
both is the point.

## What "without changing core functionality" means here

Nothing in this file is imported by the shipped pipeline. `train.py`, the committed
`model.pkl`, the frozen threshold and the served artifacts are untouched; this is a
laboratory beside them. Same target (next-session direction), same universe, same purged
walk-forward with the same embargo, same per-fold refit of the preprocessor.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from copilot.config import HOLDOUT_START, PANEL_PATH, RANDOM_SEED  # noqa: E402
from copilot.features import Preprocessor, feature_columns  # noqa: E402
from copilot.labels import labelled  # noqa: E402
from copilot.validation import purged_walk_forward  # noqa: E402

SELECTION_FOLDS = 3  # folds 1-3 choose; fold 4 confirms, once.


def _assert_no_holdout(df: pd.DataFrame, where: str) -> None:
    """Hard stop if a frame contains a holdout row. Called on every model input."""
    if len(df) == 0:
        return
    latest = pd.Timestamp(df["date"].max())
    if latest >= pd.Timestamp(HOLDOUT_START):
        raise RuntimeError(
            f"{where}: frame reaches {latest.date()}, at or past the holdout boundary "
            f"{HOLDOUT_START}. The holdout is read exactly once and not here."
        )


def load_pre_holdout() -> pd.DataFrame:
    panel = labelled(pd.read_parquet(PANEL_PATH))
    pre = panel[panel["date"] < pd.Timestamp(HOLDOUT_START)].reset_index(drop=True)
    _assert_no_holdout(pre, "load_pre_holdout")
    return pre


# ─────────────────────────── feature engineering ───────────────────────────
#
# Each builder takes the panel and returns (frame, extra_column_names). They only ever add
# columns derived from data available *at* the row's own session — same discipline as
# features.py, because a feature that peeks is how you get 60% that means nothing.


def feats_baseline(panel: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    return panel, []


def feats_cross_sectional(panel: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Dispersion and breadth across the basket, per session.

    The intuition: on a day when the whole market moves together, one name's own momentum
    says less than on a day when names are decoupled. Both are computed within the session
    across the 18 tickers, so no future information enters.
    """
    out = panel.copy()
    g = out.groupby("date")
    out["xs_dispersion"] = g["ret_1"].transform("std")
    out["xs_breadth"] = g["ret_1"].transform(lambda s: (s > 0).mean())
    out["xs_ret_demean"] = out["ret_1"] - g["ret_1"].transform("mean")
    # How extreme this name is relative to the day's spread, which is scale-free by
    # construction and therefore safe across regimes.
    out["xs_ret_z"] = out["xs_ret_demean"] / out["xs_dispersion"].replace(0, np.nan)
    return out, ["xs_dispersion", "xs_breadth", "xs_ret_demean", "xs_ret_z"]


def feats_vol_structure(panel: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Ratios between realised-volatility horizons: is vol rising or falling?

    Ratios rather than levels, so the feature means the same thing in 2015 and 2026.
    """
    out = panel.copy()
    eps = 1e-8
    out["rv_ratio_5_20"] = out["rv_5"] / (out["rv_20"] + eps)
    out["rv_ratio_20_60"] = out["rv_20"] / (out["rv_60"] + eps)
    out["rv_accel"] = out["rv_ratio_5_20"] - out["rv_ratio_20_60"]
    return out, ["rv_ratio_5_20", "rv_ratio_20_60", "rv_accel"]


def feats_reversal(panel: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Short-horizon reversal, the most documented daily equity effect there is.

    Yesterday's move scaled by recent volatility, and its interaction with where the name
    sits in the day's cross-section. If anything in this search is going to work, the prior
    literature says it is this.
    """
    out = panel.copy()
    eps = 1e-8
    out["rev_1"] = -out["ret_1"] / (out["rv_20"] + eps)
    out["rev_5"] = -out["ret_5"] / (out["rv_20"] + eps)
    g = out.groupby("date")
    out["rev_1_xs_rank"] = g["rev_1"].rank(pct=True)
    return out, ["rev_1", "rev_5", "rev_1_xs_rank"]


def feats_all(panel: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    extra: list[str] = []
    out = panel
    for builder in (feats_cross_sectional, feats_vol_structure, feats_reversal):
        out, cols = builder(out)
        extra.extend(cols)
    return out, extra


FEATURE_SETS: dict[str, Callable[[pd.DataFrame], tuple[pd.DataFrame, list[str]]]] = {
    "baseline": feats_baseline,
    "xsection": feats_cross_sectional,
    "volstruct": feats_vol_structure,
    "reversal": feats_reversal,
    "all": feats_all,
}


# ─────────────────────────── models ───────────────────────────


def make_model(kind: str, params: dict):
    """A fresh classifier. Imported lazily so a missing optional dep fails one candidate."""
    if kind == "lgbm":
        from lightgbm import LGBMClassifier

        return LGBMClassifier(
            objective="binary", random_state=RANDOM_SEED, n_jobs=-1, verbose=-1, **params
        )
    if kind == "hgb":
        from sklearn.ensemble import HistGradientBoostingClassifier

        return HistGradientBoostingClassifier(random_state=RANDOM_SEED, **params)
    if kind == "rf":
        from sklearn.ensemble import RandomForestClassifier

        return RandomForestClassifier(random_state=RANDOM_SEED, n_jobs=-1, **params)
    if kind == "et":
        from sklearn.ensemble import ExtraTreesClassifier

        return ExtraTreesClassifier(random_state=RANDOM_SEED, n_jobs=-1, **params)
    if kind == "logit":
        from sklearn.linear_model import LogisticRegression
        from sklearn.pipeline import make_pipeline
        from sklearn.preprocessing import StandardScaler

        return make_pipeline(
            StandardScaler(),
            LogisticRegression(random_state=RANDOM_SEED, max_iter=2000, **params),
        )
    raise ValueError(f"unknown model kind {kind!r}")


@dataclass
class Candidate:
    name: str
    model: str
    features: str = "baseline"
    params: dict = field(default_factory=dict)
    # Noise reduction, applied inside each fold using training rows only.
    winsorize: float | None = None
    rank_transform: bool = False
    drop_weak: int | None = None


# ─────────────────────────── evaluation ───────────────────────────


def _prepare(
    train: pd.DataFrame, val: pd.DataFrame, cols: list[str], cand: Candidate
) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
    """Per-fold preprocessing. Every statistic is fit on training rows only."""
    pre = Preprocessor().fit(train, cols)
    Xtr, Xva = pre.transform(train), pre.transform(val)
    # `model_columns` is a property, not a method.
    use = [c for c in pre.model_columns if c in Xtr.columns]

    # Categorical columns become plain codes: the sklearn models cannot take pandas
    # categoricals, and LightGBM is fine either way.
    for frame in (Xtr, Xva):
        for c in use:
            if str(frame[c].dtype) in {"category", "object"}:
                frame[c] = pd.to_numeric(frame[c], errors="coerce")

    if cand.winsorize:
        # Clip the tails at training quantiles. Daily returns have fat tails and a tree
        # splitting on a one-off spike learns that spike; clipping is the cheapest
        # noise reduction that cannot leak, as long as the bounds come from train.
        q = cand.winsorize
        lo = Xtr[use].quantile(q)
        hi = Xtr[use].quantile(1 - q)
        Xtr[use] = Xtr[use].clip(lo, hi, axis=1)
        Xva[use] = Xva[use].clip(lo, hi, axis=1)

    if cand.rank_transform:
        # Cross-sectional percentile within each session. Makes every feature
        # distribution-free and regime-stable, at the cost of losing absolute level.
        #
        # The session key comes from the source frames, not from `Xtr`: `Preprocessor`
        # returns feature columns only and drops `date`, so grouping on `frame["date"]`
        # raised KeyError. Taking it from `train`/`val` keeps the alignment exact because
        # `transform` preserves row order.
        for frame, src in ((Xtr, train), (Xva, val)):
            key = pd.Series(src["date"].to_numpy(), index=frame.index)
            frame[use] = frame[use].groupby(key).rank(pct=True)

    Xtr[use] = Xtr[use].replace([np.inf, -np.inf], np.nan).fillna(0.0)
    Xva[use] = Xva[use].replace([np.inf, -np.inf], np.nan).fillna(0.0)
    return Xtr, Xva, use


def run_candidate(
    panel: pd.DataFrame, cand: Candidate, folds: list, verbose: bool = False
) -> dict:
    """Out-of-fold metrics for one candidate over the given folds."""
    built, extra = FEATURE_SETS[cand.features](panel)
    # Deduplicated: `feature_columns` discovers columns by pattern, so it already returns
    # the ones a builder just added. Concatenating blindly passed them to the model twice.
    cols = list(dict.fromkeys(feature_columns(built) + extra))
    _assert_no_holdout(built, f"run_candidate[{cand.name}]")

    ys, ps, fold_rows = [], [], []
    for fold in folds:
        train = built.iloc[fold.train_idx]
        val = built.iloc[fold.val_idx]
        _assert_no_holdout(train, f"{cand.name}/{fold.name}/train")
        _assert_no_holdout(val, f"{cand.name}/{fold.name}/val")

        Xtr, Xva, use = _prepare(train, val, cols, cand)
        ytr = train["y_dir"].to_numpy(dtype=float)
        yva = val["y_dir"].to_numpy(dtype=float)

        features = use
        if cand.drop_weak:
            # Fit once, keep the strongest columns, refit. Selection uses training rows
            # of this fold only, so it cannot see the validation window.
            probe = make_model(cand.model, cand.params)
            probe.fit(Xtr[use], ytr)
            importance = getattr(probe, "feature_importances_", None)
            if importance is not None:
                order = np.argsort(importance)[::-1]
                features = [use[i] for i in order[: cand.drop_weak]]

        model = make_model(cand.model, cand.params)
        model.fit(Xtr[features], ytr)
        p = model.predict_proba(Xva[features])[:, 1]

        ys.append(yva)
        ps.append(p)
        acc = float(((p > 0.5).astype(float) == yva).mean())
        fold_rows.append({"fold": fold.name, "n": int(len(yva)), "accuracy": acc})
        if verbose:
            print(f"      {fold.name}: acc {acc:.4f}", flush=True)

    y = np.concatenate(ys)
    p = np.concatenate(ps)
    return {
        "name": cand.name,
        "model": cand.model,
        "features": cand.features,
        "n": int(len(y)),
        "accuracy": float(((p > 0.5).astype(float) == y).mean()),
        "auc": _auc(y, p),
        "logloss": _logloss(y, p),
        "per_fold": fold_rows,
        "fold_accuracy_std": float(np.std([f["accuracy"] for f in fold_rows])),
    }


def _auc(y: np.ndarray, p: np.ndarray) -> float:
    from sklearn.metrics import roc_auc_score

    try:
        return float(roc_auc_score(y, p))
    except ValueError:
        return float("nan")


def _logloss(y: np.ndarray, p: np.ndarray) -> float:
    eps = 1e-15
    p = np.clip(p, eps, 1 - eps)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


def coverage_curve(y: np.ndarray, p: np.ndarray) -> list[dict]:
    """Accuracy against coverage, so "60% on the calls it makes" is answerable."""
    rows = []
    for thr in [0.5, 0.52, 0.54, 0.56, 0.58, 0.6, 0.62, 0.65, 0.7]:
        mask = (p >= thr) | (p <= 1 - thr)
        n = int(mask.sum())
        if n == 0:
            continue
        acc = float(((p[mask] > 0.5).astype(float) == y[mask]).mean())
        rows.append(
            {"threshold": thr, "coverage": float(mask.mean()), "n": n, "accuracy": acc}
        )
    return rows
