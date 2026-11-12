"""`make train` — pooled LightGBM, isotonic calibration, abstention threshold.

The whole design here is a reaction to three specific defects in my earlier
project, and it is worth naming them because the fix is the contribution:

1. **The displayed confidence was a function default argument.** The old UI's
   "60%" came from `def predict(..., confidence=60)`. Here the number shown to a
   user is the output of an isotonic regression fit on *out-of-fold* predictions,
   which is what makes "68%" mean "of the times I said 68%, about 68% went up".
2. **Model selection looked at the test set.** Hyperparameters here are chosen
   inside the walk-forward folds, scored by mean fold log loss, and the final
   holdout is not read by this module at all — `evaluate.py` touches it once.
3. **Preprocessing was fit on everything.** `Preprocessor` is re-fit from scratch
   inside every fold.

### Two heads, and why the classifier is the product

A return regressor and a direction classifier are trained on the same matrix.
The regressor exists to produce the *predicted range* the dashboard shows and to
make the honest point that R² on next-session returns is approximately zero —
§6.6 asks for that to be reported, not hidden. The classifier plus its calibrator
is what the product actually acts on.

### Abstention

The threshold is picked on validation only: scan candidate thresholds, keep the
ones that still emit a signal on ≥10% of sessions, and take the one with the best
balance of accuracy and coverage. It is then **frozen** (§6.5). It is written
into `model.pkl` rather than left in a config file precisely so that it cannot
quietly become a dial for making the coverage-accuracy curve look better later.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

import joblib
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression

from .config import (
    ABSTENTION_GRID,
    CALIBRATOR_PATH,
    IMPORTANCE_PATH,
    MIN_COVERAGE,
    MODEL_PATH,
    PANEL_PATH,
    RANDOM_SEED,
)
from .features import Preprocessor, feature_columns
from .labels import labelled
from .validation import holdout_split, purged_walk_forward

# Hyperparameter candidates. Deliberately a small, conservative grid: on ~40k
# rows of daily returns with a signal-to-noise ratio this low, a large search is
# a way to overfit the validation folds rather than to find a better model.
# Every candidate is heavily regularised for the same reason.
PARAM_GRID: tuple[dict[str, object], ...] = (
    {"num_leaves": 7, "learning_rate": 0.03, "min_child_samples": 200, "n_estimators": 300},
    {"num_leaves": 15, "learning_rate": 0.03, "min_child_samples": 300, "n_estimators": 400},
    {"num_leaves": 31, "learning_rate": 0.02, "min_child_samples": 500, "n_estimators": 500},
)

BASE_PARAMS: dict[str, object] = {
    "objective": "binary",
    "subsample": 0.8,
    "subsample_freq": 1,
    "colsample_bytree": 0.7,
    "reg_alpha": 0.5,
    "reg_lambda": 5.0,
    "random_state": RANDOM_SEED,
    "n_jobs": -1,
    "verbose": -1,
}

CATEGORICAL = ["cal_dow", "cal_month", "vix_regime"]


def categorical_levels(X: pd.DataFrame) -> dict[str, list]:
    """The category values present in a training matrix, per categorical column.

    These have to be captured at fit time and reapplied at predict time.
    LightGBM encodes a pandas `category` column by its *categories list*, not by
    the values, so a frame whose categories differ from the training frame's is
    rejected outright — `ValueError: train and valid dataset categorical_feature
    do not match` — and that failure appears at the first prediction, long after
    training looked fine. Carrying the levels inside the artifact is what makes
    the pickle self-sufficient.
    """
    return {
        c: sorted(pd.Series(X[c]).dropna().unique().tolist()) for c in CATEGORICAL if c in X.columns
    }


def as_model_frame(X: pd.DataFrame, levels: dict[str, list]) -> pd.DataFrame:
    """Apply the stored categorical levels. The single conversion both fitting and
    prediction go through, so the two cannot disagree.

    A value not seen during training (a `vix_regime` of -1 in a fold where VIX was
    never missing, say) becomes NaN here, which LightGBM treats as a missing
    categorical and routes down its default branch. That is the right behaviour —
    better than inventing a level the trees have never split on — and it is
    silent, hence this note.
    """
    Xc = X.copy()
    for col, lv in levels.items():
        if col in Xc.columns:
            Xc[col] = pd.Categorical(Xc[col], categories=lv)
    return Xc


@dataclass
class TrainedModel:
    """Everything `api.py` needs, in one picklable object.

    Carrying the preprocessor and the threshold *inside* the artifact rather than
    beside it means a loaded model cannot be paired with the wrong transform or a
    re-tuned threshold — the failure that produces a confidently wrong number.
    """

    classifier: object
    regressor: object
    preprocessor: Preprocessor
    threshold: float
    params: dict[str, object] = field(default_factory=dict)
    trained_at: str = ""
    train_rows: int = 0
    train_end: str = ""
    feature_names: list[str] = field(default_factory=list)
    horizon_sessions: int = 1
    # The categorical levels the boosters were fit with (see `as_model_frame`).
    categorical_levels: dict[str, list] = field(default_factory=dict)

    def model_matrix(self, df: pd.DataFrame) -> pd.DataFrame:
        return as_model_frame(self.preprocessor.transform(df), self.categorical_levels)

    def raw_proba_up(self, df: pd.DataFrame) -> np.ndarray:
        X = self.model_matrix(df)
        return np.asarray(self.classifier.predict_proba(X)[:, 1], dtype=float)

    def predicted_return(self, df: pd.DataFrame) -> np.ndarray:
        X = self.model_matrix(df)
        return np.asarray(self.regressor.predict(X), dtype=float)


def _fit_pair(
    X: pd.DataFrame, y_dir: np.ndarray, y_ret: np.ndarray, params: dict[str, object]
) -> tuple[object, object, dict[str, list]]:
    """Fit both heads on one matrix. Returns the models and the categorical levels
    they were fit with — every later prediction must reuse those exact levels."""
    import lightgbm as lgb

    levels = categorical_levels(X)
    cats = list(levels)
    Xc = as_model_frame(X, levels)

    clf = lgb.LGBMClassifier(**{**BASE_PARAMS, **params})
    clf.fit(Xc, y_dir, categorical_feature=cats)

    # L1 for the return head: next-session returns have fat tails, and squared
    # error lets a handful of 8% days dominate the fit. Slower to train, and the
    # right trade for a model whose output is a displayed range.
    reg_params = {**BASE_PARAMS, **params, "objective": "regression_l1"}
    reg = lgb.LGBMRegressor(**reg_params)
    reg.fit(Xc, y_ret, categorical_feature=cats)
    return clf, reg, levels


def _predict_proba(clf, X: pd.DataFrame, levels: dict[str, list]) -> np.ndarray:
    return np.asarray(clf.predict_proba(as_model_frame(X, levels))[:, 1], dtype=float)


def _predict_return(reg, X: pd.DataFrame, levels: dict[str, list]) -> np.ndarray:
    return np.asarray(reg.predict(as_model_frame(X, levels)), dtype=float)


def log_loss_safe(y: np.ndarray, p: np.ndarray) -> float:
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))


# ─── walk-forward: hyperparameters, out-of-fold predictions, threshold ────────


def walk_forward_oof(panel: pd.DataFrame, params: dict[str, object]) -> pd.DataFrame:
    """Out-of-fold predictions for one hyperparameter set.

    Returns a frame of validation rows with `p_raw` (uncalibrated) attached. Each
    fold refits the model *and* the preprocessor from scratch on that fold's
    training rows only.
    """
    cols = feature_columns(panel)
    pieces = []

    for fold in purged_walk_forward(panel["date"]):
        train = panel.iloc[fold.train_idx]
        val = panel.iloc[fold.val_idx]

        pre = Preprocessor().fit(train, cols)
        Xtr, Xva = pre.transform(train), pre.transform(val)

        clf, reg, levels = _fit_pair(
            Xtr,
            train["y_dir"].to_numpy(dtype=float),
            train["y_ret"].to_numpy(dtype=float),
            params,
        )

        pieces.append(
            pd.DataFrame(
                {
                    "date": val["date"].to_numpy(),
                    "ticker": val["ticker"].to_numpy(),
                    "fold": fold.name,
                    "y_dir": val["y_dir"].to_numpy(dtype=float),
                    "y_ret": val["y_ret"].to_numpy(dtype=float),
                    "p_raw": _predict_proba(clf, Xva, levels),
                    "pred_ret": _predict_return(reg, Xva, levels),
                    "vix_level": val["vix_level"].to_numpy(dtype=float),
                }
            )
        )

    return pd.concat(pieces, ignore_index=True)


def select_hyperparameters(panel: pd.DataFrame) -> tuple[dict[str, object], pd.DataFrame, list[dict]]:
    """Pick the parameter set with the best mean per-fold log loss.

    Log loss, not accuracy: the product shows a *probability*, so the thing worth
    optimising is how well-calibrated and sharp that probability is, not how often
    its argmax happens to be right. Scored per fold and averaged, so a single
    easy year cannot dominate.
    """
    scoreboard: list[dict] = []
    best: tuple[float, dict[str, object], pd.DataFrame] | None = None

    for i, params in enumerate(PARAM_GRID, start=1):
        oof = walk_forward_oof(panel, params)
        per_fold = [
            log_loss_safe(g["y_dir"].to_numpy(), g["p_raw"].to_numpy())
            for _, g in oof.groupby("fold", sort=True)
        ]
        mean_ll = float(np.mean(per_fold))
        acc = float(((oof["p_raw"] > 0.5).astype(float) == oof["y_dir"]).mean())
        scoreboard.append(
            {
                "candidate": i,
                "params": params,
                "mean_fold_log_loss": round(mean_ll, 6),
                "per_fold_log_loss": [round(v, 6) for v in per_fold],
                "pooled_oof_accuracy": round(acc, 6),
            }
        )
        print(f"  candidate {i}: mean fold log loss {mean_ll:.5f}  (oof acc {acc:.4f})", flush=True)

        if best is None or mean_ll < best[0]:
            best = (mean_ll, params, oof)

    assert best is not None
    for row in scoreboard:
        row["selected"] = row["params"] == best[1]
    return best[1], best[2], scoreboard


def fit_calibrator(y: np.ndarray, p_raw: np.ndarray) -> IsotonicRegression:
    """Isotonic regression on out-of-fold predictions.

    Out-of-fold is the non-negotiable part. Calibrating on in-sample predictions
    produces a calibrator that maps an overconfident model onto its own training
    labels, which looks perfect on the training set and is worthless live.

    Isotonic rather than Platt scaling: it is non-parametric, so it can correct
    the specific S-shape a boosted tree ensemble produces without assuming the
    distortion is logistic.
    """
    iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    iso.fit(p_raw, y)
    return iso


def coverage_accuracy_curve(
    y: np.ndarray, p_cal: np.ndarray, grid: tuple[float, ...] = ABSTENTION_GRID
) -> list[dict]:
    """For each candidate threshold: what fraction of rows get a signal, and how
    often that signal is right.

    `conviction` is the distance from 0.5 — the model emits a signal when it is
    confident in *either* direction, so abstention is symmetric. A product that
    only abstained on down-days would be a long-only bias dressed up as caution.
    """
    rows = []
    conviction = np.abs(p_cal - 0.5) + 0.5
    direction = (p_cal > 0.5).astype(float)

    for thr in grid:
        signalled = conviction >= thr
        n = int(signalled.sum())
        if n == 0:
            rows.append(
                {
                    "threshold": thr,
                    "coverage": 0.0,
                    "signals": 0,
                    "accuracy": None,
                    "up_share": None,
                }
            )
            continue
        acc = float((direction[signalled] == y[signalled]).mean())
        rows.append(
            {
                "threshold": thr,
                "coverage": round(float(n / len(y)), 6),
                "signals": n,
                "accuracy": round(acc, 6),
                "up_share": round(float(direction[signalled].mean()), 6),
            }
        )
    return rows


def choose_threshold(curve: list[dict], min_coverage: float = MIN_COVERAGE) -> tuple[float, str]:
    """Pick the abstention threshold from the validation curve.

    Maximising accuracy alone selects "abstain almost always", which scores well
    and is a useless product — hence the coverage floor. Among the thresholds
    that clear it, this takes the highest accuracy, breaking ties toward *more*
    coverage, because a signal that is given more often is more useful at equal
    accuracy.

    Returns the threshold and a one-line rationale, which goes into metrics.json
    so the choice is auditable rather than asserted.
    """
    eligible = [r for r in curve if r["accuracy"] is not None and r["coverage"] >= min_coverage]
    if not eligible:
        return 0.5, (
            f"no threshold kept coverage above {min_coverage:.0%}; fell back to 0.50, "
            "which abstains on nothing"
        )
    best = max(eligible, key=lambda r: (r["accuracy"], r["coverage"]))
    return float(best["threshold"]), (
        f"chosen on validation out-of-fold predictions: highest accuracy "
        f"({best['accuracy']:.4f}) among thresholds keeping coverage above "
        f"{min_coverage:.0%}; this one covers {best['coverage']:.1%} of rows "
        f"({best['signals']:,} signals). Frozen per §6.5."
    )


# ─── the entry point ──────────────────────────────────────────────────────────


def main() -> int:
    if not PANEL_PATH.exists():
        print(f"✗ {PANEL_PATH} missing — run `python ml/tasks.py data` first")
        return 1

    panel = labelled(pd.read_parquet(PANEL_PATH))
    cols = feature_columns(panel)
    print(f"panel: {len(panel):,} labelled rows, {len(cols)} features\n")

    # Everything from here to the threshold is chosen on the walk-forward folds.
    # The holdout is not read in this module.
    print("[1/4] hyperparameter selection on purged walk-forward folds")
    params, oof, scoreboard = select_hyperparameters(panel)
    print(f"      selected: {params}\n")

    print("[2/4] isotonic calibration on out-of-fold predictions")
    calibrator = fit_calibrator(oof["y_dir"].to_numpy(dtype=float), oof["p_raw"].to_numpy())
    p_cal = np.asarray(calibrator.predict(oof["p_raw"].to_numpy()), dtype=float)
    print(
        f"      raw log loss {log_loss_safe(oof['y_dir'].to_numpy(), oof['p_raw'].to_numpy()):.5f}"
        f" -> calibrated {log_loss_safe(oof['y_dir'].to_numpy(), p_cal):.5f}\n"
    )

    print("[3/4] abstention threshold from the validation coverage-accuracy curve")
    curve = coverage_accuracy_curve(oof["y_dir"].to_numpy(dtype=float), p_cal)
    threshold, rationale = choose_threshold(curve)
    print(f"      threshold {threshold:.3f}\n      {rationale}\n")

    # The shipped model is refit on everything up to the holdout embargo, with
    # the parameters the folds chose. Using more history for the final fit is
    # standard and does not touch the holdout: `holdout_split` purges it.
    print("[4/4] final fit on all pre-holdout rows")
    train_idx, _ = holdout_split(panel["date"])
    train = panel.iloc[train_idx]
    pre = Preprocessor().fit(train, cols)
    Xtr = pre.transform(train)
    clf, reg, levels = _fit_pair(
        Xtr,
        train["y_dir"].to_numpy(dtype=float),
        train["y_ret"].to_numpy(dtype=float),
        params,
    )
    print(f"      {len(train):,} rows, up to {pd.to_datetime(train['date']).max().date()}")

    bundle = TrainedModel(
        classifier=clf,
        regressor=reg,
        preprocessor=pre,
        threshold=threshold,
        params=dict(params),
        trained_at=pd.Timestamp.now().isoformat(timespec="seconds"),
        train_rows=int(len(train)),
        train_end=str(pd.to_datetime(train["date"]).max().date()),
        feature_names=pre.model_columns,
        horizon_sessions=1,
        categorical_levels=levels,
    )

    joblib.dump(bundle, MODEL_PATH)
    joblib.dump(calibrator, CALIBRATOR_PATH)

    # Real gain-based importance from the fitted model — not an invented ranking.
    importance = sorted(
        (
            {"feature": f, "gain": float(g)}
            for f, g in zip(pre.model_columns, clf.booster_.feature_importance("gain"), strict=True)
        ),
        key=lambda r: -r["gain"],
    )
    total = sum(r["gain"] for r in importance) or 1.0
    for r in importance:
        r["share"] = round(r["gain"] / total, 6)
        r["gain"] = round(r["gain"], 4)

    IMPORTANCE_PATH.write_text(
        json.dumps(
            {
                "source": "LightGBM booster feature_importance(gain) from the shipped classifier",
                "trained_at": bundle.trained_at,
                "features": importance,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    # Out-of-fold predictions are kept: evaluate.py needs them for the
    # calibration curve, and neighbors.py needs the fitted preprocessor.
    oof = oof.assign(p_cal=p_cal)
    oof.to_parquet(MODEL_PATH.parent / "oof_predictions.parquet", index=False)
    (MODEL_PATH.parent / "selection.json").write_text(
        json.dumps(
            {
                "selected_params": params,
                "scoreboard": scoreboard,
                "threshold": threshold,
                "threshold_rationale": rationale,
                "coverage_accuracy_curve_validation": curve,
                "note": (
                    "Everything in this file was chosen on purged walk-forward validation "
                    "folds. The final holdout is not read by train.py."
                ),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print("\n✓ wrote model.pkl, calibrator.pkl, feature_importance.json, selection.json")
    print("  these are FROZEN once step 3's acceptance check passes (§6.5)")
    return 0


if __name__ == "__main__":
    # Re-import ourselves under the proper module name before running.
    #
    # `python -m copilot.train` executes this file as the module `__main__`, so
    # `TrainedModel` defined above gets `__module__ == "__main__"` — and pickle
    # stores the class by module path. The artifact then only unpickles inside
    # another `__main__` that happens to define a class of the same name, which
    # means `evaluate.py` and `api.py` both fail with a bare
    # `AttributeError: Can't get attribute 'TrainedModel'`.
    #
    # Importing `copilot.train` here creates the module a second time under its
    # real name and runs *that* copy's `main`, so the class pickle records is
    # `copilot.train.TrainedModel`, which every consumer can resolve.
    from copilot.train import main as _main

    raise SystemExit(_main())
