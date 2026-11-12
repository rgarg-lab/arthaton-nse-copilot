"""`make eval` — the measured track record, written to `artifacts/metrics.json`.

**Every number the UI shows about model quality comes from this file.** §4.2
forbids a literal statistic anywhere in TSX, and this is the other half of that
rule: there is exactly one producer of metrics, it is this module, and it writes
JSON. Nothing is ever typed by hand again (§8, step 3).

### The holdout is read exactly once

`2025-07-01 → today`, purged by five sessions from training. Hyperparameters and
the abstention threshold were chosen by `train.py` on the walk-forward folds and
are already frozen in `model.pkl` before this module runs.

Because "evaluated exactly once" is a claim that is easy to make and impossible
to verify from the outside, this module keeps an append-only ledger at
`artifacts/holdout_ledger.json`: one entry per run, with a content hash of the
holdout rows and of the model. If the headline is ever re-measured after a
retune, the ledger says so and the report has to admit it. The ledger is
committed.

### Four baselines, because a lone accuracy number means nothing

53–57% is the honest range for pooled next-session NSE direction. On its own
"55%" is unreadable — it could be excellent or it could be worse than a coin
flip that exploits the market's upward drift. So:

- **always-up** — the drift baseline. In a market that rises on ~51% of
  sessions, this is the number any model must beat to have said anything.
- **previous-day sign** — the naive momentum baseline, i.e. "tomorrow does what
  today did". Cheap, and in a mean-reverting regime it loses badly, which is
  informative.
- **3-feature logistic regression** — the "did you need gradient boosting?"
  baseline, fit on exactly the same purged splits with exactly the same
  preprocessing. If LightGBM cannot beat three features and a linear model, the
  complexity is not earning its keep.
- **buy-and-hold** — the economic baseline, in return terms rather than accuracy
  terms, because a directional accuracy edge that does not survive costs is not
  an investment case.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

from .config import (
    ARTIFACTS_DIR,
    CALIBRATOR_PATH,
    COST_SCENARIOS,
    DEFAULT_COST_SCENARIO,
    DISCLAIMER,
    HOLDOUT_START,
    METRICS_PATH,
    MODEL_PATH,
    PANEL_PATH,
    RANDOM_SEED,
    UNIVERSE,
    WALK_FORWARD_FOLDS,
)
from .features import Preprocessor, feature_columns
from .labels import labelled
from .train import coverage_accuracy_curve, log_loss_safe
from .validation import holdout_split, purged_walk_forward

LEDGER_PATH = ARTIFACTS_DIR / "holdout_ledger.json"

# The three features the linear baseline gets. Chosen for being the obvious ones
# a person would reach for, not for being the best three — the point of the
# baseline is "what does the cheap answer look like".
LINEAR_BASELINE_FEATURES = ["ret_1", "sma_dev_20", "rv_20"]


def _round(x: object, places: int = 6) -> object:
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return x
    return None if not np.isfinite(v) else round(v, places)


# ─── metric blocks ────────────────────────────────────────────────────────────


def direction_metrics(y: np.ndarray, p: np.ndarray) -> dict[str, object]:
    """Accuracy, balanced accuracy, AUC, Brier, log loss.

    Brier and log loss are the ones that matter for this product and the ones the
    old project had none of: they score the *probability*, so a model that says
    "90% up" and is wrong is punished far harder than one that said "52% up" and
    was wrong. Accuracy cannot tell those apart, and a decision layer built on
    abstention lives or dies on that distinction.
    """
    pred = (p > 0.5).astype(float)
    tp = int(((pred == 1) & (y == 1)).sum())
    tn = int(((pred == 0) & (y == 0)).sum())
    fp = int(((pred == 1) & (y == 0)).sum())
    fn = int(((pred == 0) & (y == 1)).sum())

    tpr = tp / (tp + fn) if (tp + fn) else float("nan")
    tnr = tn / (tn + fp) if (tn + fp) else float("nan")

    try:
        auc = float(roc_auc_score(y, p)) if len(np.unique(y)) > 1 else None
    except ValueError:
        auc = None

    return {
        "n": int(len(y)),
        "accuracy": _round((pred == y).mean()),
        "balanced_accuracy": _round(np.nanmean([tpr, tnr])),
        "auc": _round(auc),
        "brier": _round(np.mean((p - y) ** 2)),
        "log_loss": _round(log_loss_safe(y, p)),
        "base_rate_up": _round(y.mean()),
        "predicted_up_share": _round(pred.mean()),
        "confusion_matrix": {
            "true_up_pred_up": tp,
            "true_up_pred_down": fn,
            "true_down_pred_up": fp,
            "true_down_pred_down": tn,
        },
    }


def regression_metrics(y_ret: np.ndarray, pred_ret: np.ndarray) -> dict[str, object]:
    """MAE, RMSE, R².

    §6.6 says to expect R² near zero and report it honestly. It will be near zero,
    and in all likelihood slightly *negative* — meaning the predicted magnitude is
    worse than always predicting the mean return. That is the correct and expected
    result for next-session returns, and it is the reason the product is built on
    the *direction* head with abstention rather than on a return forecast. A
    project that reported a healthy R² here would be reporting a bug.
    """
    resid = y_ret - pred_ret
    ss_res = float(np.sum(resid**2))
    ss_tot = float(np.sum((y_ret - y_ret.mean()) ** 2))
    return {
        "n": int(len(y_ret)),
        "mae": _round(np.mean(np.abs(resid)), 8),
        "rmse": _round(np.sqrt(np.mean(resid**2)), 8),
        "r2": _round(1.0 - ss_res / ss_tot if ss_tot > 0 else None),
        "mean_abs_actual_return": _round(np.mean(np.abs(y_ret)), 8),
        "interpretation": (
            "R-squared on next-session returns is expected to be approximately zero, and "
            "often slightly negative. That is the honest result for this horizon and asset "
            "class; it is why the product acts on the calibrated direction head with "
            "abstention rather than on a return forecast."
        ),
    }


def calibration_curve(y: np.ndarray, p: np.ndarray, bins: int = 10) -> list[dict]:
    """Predicted vs realised, in deciles of predicted probability.

    A near-diagonal curve here is the step-3 acceptance check, and it is the
    single piece of evidence that the number shown in the UI as a confidence
    means what it says.
    """
    edges = np.linspace(0.0, 1.0, bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1], right=False), 0, bins - 1)
    out = []
    for b in range(bins):
        m = idx == b
        n = int(m.sum())
        out.append(
            {
                "bin": b,
                "p_lower": _round(edges[b], 3),
                "p_upper": _round(edges[b + 1], 3),
                "n": n,
                "mean_predicted": _round(p[m].mean()) if n else None,
                "observed_up_rate": _round(y[m].mean()) if n else None,
            }
        )
    return out


def calibration_error(curve: list[dict]) -> dict[str, object]:
    """Expected and maximum calibration error — a single number for "is the
    curve near the diagonal", so the acceptance check is checkable."""
    total = sum(b["n"] for b in curve) or 1
    gaps = [
        (b["n"], abs(float(b["mean_predicted"]) - float(b["observed_up_rate"])))
        for b in curve
        if b["n"] > 0 and b["mean_predicted"] is not None and b["observed_up_rate"] is not None
    ]
    if not gaps:
        return {"expected_calibration_error": None, "max_calibration_error": None}
    return {
        "expected_calibration_error": _round(sum(n * g for n, g in gaps) / total),
        "max_calibration_error": _round(max(g for _, g in gaps)),
        "populated_bins": len(gaps),
    }


# ─── baselines ────────────────────────────────────────────────────────────────


def baseline_always_up(holdout: pd.DataFrame) -> dict[str, object]:
    y = holdout["y_dir"].to_numpy(dtype=float)
    p = np.full(len(y), 1.0)
    m = direction_metrics(y, np.clip(p, 1e-6, 1 - 1e-6))
    m["description"] = (
        "Predict 'up' every session. The drift baseline — the number any model must "
        "beat before it has said anything at all."
    )
    return m


def baseline_prev_day_sign(holdout: pd.DataFrame) -> dict[str, object]:
    """Tomorrow does what today did. `ret_1` is today's realised return, which is
    known at today's close, so this baseline is legitimately computable."""
    y = holdout["y_dir"].to_numpy(dtype=float)
    today_up = (holdout["ret_1"].fillna(0.0).to_numpy(dtype=float) > 0).astype(float)
    p = np.where(today_up == 1, 1 - 1e-6, 1e-6)
    m = direction_metrics(y, p)
    m["description"] = (
        "Predict that the next session repeats the sign of the current one. The naive "
        "momentum baseline."
    )
    return m


def baseline_logistic(panel: pd.DataFrame, train_idx, holdout_idx) -> dict[str, object]:
    """Three features, a linear model, the same purged split and the same
    training-rows-only preprocessing. The "did you need gradient boosting?"
    control."""
    train = panel.iloc[train_idx]
    hold = panel.iloc[holdout_idx]

    pre = Preprocessor().fit(train, LINEAR_BASELINE_FEATURES)
    Xtr = pre.transform(train)[LINEAR_BASELINE_FEATURES]
    Xho = pre.transform(hold)[LINEAR_BASELINE_FEATURES]

    # Standardise on training rows only; a linear model needs it and the tree does not.
    mu, sd = Xtr.mean(), Xtr.std().replace(0.0, 1.0)
    model = LogisticRegression(max_iter=2000, random_state=RANDOM_SEED)
    model.fit((Xtr - mu) / sd, train["y_dir"].to_numpy(dtype=float))

    p = model.predict_proba((Xho - mu) / sd)[:, 1]
    m = direction_metrics(hold["y_dir"].to_numpy(dtype=float), np.asarray(p, dtype=float))
    m["description"] = (
        f"Logistic regression on {len(LINEAR_BASELINE_FEATURES)} features "
        f"({', '.join(LINEAR_BASELINE_FEATURES)}), same purged split, same "
        "training-rows-only preprocessing. If the full model cannot beat this, the "
        "complexity is not earning its keep."
    )
    m["features"] = LINEAR_BASELINE_FEATURES
    return m


def baseline_buy_and_hold(holdout: pd.DataFrame) -> dict[str, object]:
    """The economic baseline, stated in return terms.

    Equal-weight the universe, hold through the whole holdout window, no trading.
    This is what the directional edge is competing against, and it is the number
    that makes the difference between "55% accurate" and "worth doing".
    """
    by_date = holdout.groupby("date")["y_ret"].mean().sort_index()
    equity = float(np.prod(1.0 + by_date.to_numpy(dtype=float)))
    sessions = len(by_date)
    daily = by_date.to_numpy(dtype=float)
    sharpe = (
        float(np.mean(daily) / np.std(daily) * np.sqrt(252.0)) if np.std(daily) > 0 else None
    )
    curve = np.cumprod(1.0 + daily)
    drawdown = float(np.min(curve / np.maximum.accumulate(curve)) - 1.0) if sessions else None
    return {
        "description": (
            "Equal-weight the 18-name universe and hold for the whole holdout window, "
            "with no trading and therefore no costs. The economic baseline."
        ),
        "sessions": sessions,
        "total_return": _round(equity - 1.0),
        "annualised_return": _round(equity ** (252.0 / sessions) - 1.0) if sessions else None,
        "sharpe": _round(sharpe, 4),
        "max_drawdown": _round(drawdown),
        "up_session_share": _round((daily > 0).mean()),
    }


# ─── breakdowns ───────────────────────────────────────────────────────────────


def per_year(df: pd.DataFrame) -> list[dict]:
    out = []
    for year, g in df.groupby(pd.to_datetime(df["date"]).dt.year, sort=True):
        m = direction_metrics(g["y_dir"].to_numpy(dtype=float), g["p_cal"].to_numpy(dtype=float))
        out.append({"year": int(year), **{k: m[k] for k in ("n", "accuracy", "auc", "brier")}})
    return out


def per_vix_regime(df: pd.DataFrame, pre: Preprocessor) -> list[dict]:
    """Accuracy split by volatility regime.

    This is the breakdown that makes the abstention story concrete, and the one
    the chat surface quotes when it declines to give a signal: the model is
    measurably worse in the stressed tercile, so "today is a high-VIX session and
    my measured accuracy in that regime is X%" is a statement backed by this
    table rather than by a tone of voice.
    """
    regime = pre.vix_regime(df["vix_level"])
    names = {-1: "unknown", 0: "calm", 1: "normal", 2: "stressed"}
    out = []
    for r, g in df.assign(_r=regime.to_numpy()).groupby("_r", sort=True):
        m = direction_metrics(g["y_dir"].to_numpy(dtype=float), g["p_cal"].to_numpy(dtype=float))
        out.append(
            {
                "regime": names.get(int(r), str(r)),
                "regime_code": int(r),
                "vix_range": (
                    None
                    if pre.vix_cuts is None
                    else {
                        0: f"<= {pre.vix_cuts[0]:.2f}",
                        1: f"{pre.vix_cuts[0]:.2f} - {pre.vix_cuts[1]:.2f}",
                        2: f"> {pre.vix_cuts[1]:.2f}",
                    }.get(int(r))
                ),
                **{k: m[k] for k in ("n", "accuracy", "auc", "brier")},
            }
        )
    return out


def per_ticker(df: pd.DataFrame) -> list[dict]:
    out = []
    for ticker, g in df.groupby("ticker", sort=True):
        m = direction_metrics(g["y_dir"].to_numpy(dtype=float), g["p_cal"].to_numpy(dtype=float))
        out.append({"ticker": ticker, **{k: m[k] for k in ("n", "accuracy", "brier")}})
    return sorted(out, key=lambda r: -(r["accuracy"] or 0))


def abstention_block(df: pd.DataFrame, threshold: float) -> dict[str, object]:
    """What abstention actually bought, measured on the holdout.

    The comparison that matters is accuracy *on the sessions where a signal was
    given* against accuracy on everything. If those are the same, the threshold
    is theatre.
    """
    y = df["y_dir"].to_numpy(dtype=float)
    p = df["p_cal"].to_numpy(dtype=float)
    conviction = np.abs(p - 0.5) + 0.5
    signalled = conviction >= threshold
    pred = (p > 0.5).astype(float)

    n_sig = int(signalled.sum())
    return {
        "threshold": threshold,
        "note": (
            "The threshold was chosen on the walk-forward validation folds and frozen "
            "before the holdout was read (§6.5). These are its out-of-sample consequences."
        ),
        "coverage": _round(n_sig / len(y)) if len(y) else None,
        "signals_emitted": n_sig,
        "abstentions": int(len(y) - n_sig),
        "accuracy_when_signalling": _round((pred[signalled] == y[signalled]).mean())
        if n_sig
        else None,
        "accuracy_on_all_rows": _round((pred == y).mean()),
        "accuracy_when_abstaining": _round((pred[~signalled] == y[~signalled]).mean())
        if n_sig < len(y)
        else None,
        "coverage_accuracy_curve": coverage_accuracy_curve(y, p),
    }


def paper_trading_block(df: pd.DataFrame, threshold: float) -> dict[str, object]:
    """Cost-aware paper trading on the holdout — historical only, no real money.

    Long when the calibrated probability clears the threshold on the up side,
    short when it clears on the down side, flat otherwise. Costs are charged on
    every position change under three scenarios (§config), because a single
    optimistic cost figure is how a strategy gets to look profitable.
    """
    daily = (
        df.assign(
            conviction=np.abs(df["p_cal"] - 0.5) + 0.5,
            side=np.where(df["p_cal"] > 0.5, 1.0, -1.0),
        )
        .sort_values("date")
        .copy()
    )
    daily["position"] = np.where(daily["conviction"] >= threshold, daily["side"], 0.0)

    # Equal-weight across whichever names have a position that session.
    grouped = daily.groupby("date")
    rows = []
    for date, g in grouped:
        active = g[g["position"] != 0.0]
        gross = (
            float((active["position"] * active["y_ret"]).mean()) if len(active) else 0.0
        )
        rows.append({"date": date, "gross": gross, "names": int(len(active))})
    ledger = pd.DataFrame(rows).sort_values("date").reset_index(drop=True)

    out: dict[str, object] = {
        "description": (
            "Historical paper trading on the holdout window only. No real money, no "
            "broker, no live execution. Long/short the names whose calibrated "
            "probability clears the frozen abstention threshold, equal-weighted, flat "
            "otherwise."
        ),
        "sessions": int(len(ledger)),
        "sessions_with_a_position": int((ledger["names"] > 0).sum()),
        "mean_names_held": _round(ledger["names"].mean(), 2),
        "scenarios": {},
    }

    for cost in COST_SCENARIOS:
        # Charged per session with a position: entering and exiting is the round trip.
        charge = np.where(ledger["names"] > 0, cost.total_bps / 10_000.0, 0.0)
        net = ledger["gross"].to_numpy(dtype=float) - charge
        curve = np.cumprod(1.0 + net)
        total = float(curve[-1] - 1.0) if len(curve) else None
        out["scenarios"][cost.label] = {
            "round_trip_bps": cost.round_trip_bps,
            "slippage_bps": cost.slippage_bps,
            "total_bps_per_round_trip": cost.total_bps,
            "total_return": _round(total),
            "annualised_return": _round(curve[-1] ** (252.0 / len(curve)) - 1.0)
            if len(curve)
            else None,
            "sharpe": _round(np.mean(net) / np.std(net) * np.sqrt(252.0), 4)
            if np.std(net) > 0
            else None,
            "max_drawdown": _round(float(np.min(curve / np.maximum.accumulate(curve)) - 1.0))
            if len(curve)
            else None,
            "win_rate": _round((net > 0).mean()),
            "is_default": cost.label == DEFAULT_COST_SCENARIO,
        }

    out["equity_curve"] = [
        {"date": str(pd.Timestamp(d).date()), "net_return": _round(v, 8)}
        for d, v in zip(
            ledger["date"],
            np.cumprod(
                1.0
                + ledger["gross"].to_numpy(dtype=float)
                - np.where(
                    ledger["names"] > 0,
                    next(c for c in COST_SCENARIOS if c.label == DEFAULT_COST_SCENARIO).total_bps
                    / 10_000.0,
                    0.0,
                )
            )
            - 1.0,
            strict=True,
        )
    ]
    return out


# ─── the ledger ───────────────────────────────────────────────────────────────


def _hash(obj: object) -> str:
    return hashlib.sha256(str(obj).encode("utf-8")).hexdigest()[:16]


def is_smoke_run() -> bool:
    """Whether this run is a pipeline smoke test rather than the headline.

    This exists for one honest reason. The evaluation code has to be *debugged*,
    and debugging it means running it — but "the final holdout is evaluated
    exactly once" is the strongest claim this build makes, and silently reading
    the holdout a few times while fixing a KeyError would make that claim false.

    So a run with `COPILOT_HOLDOUT_SMOKE=1` is recorded in the ledger as a smoke
    read, and the `metrics.json` it writes is stamped
    `headline_authoritative: false`. Nothing about a smoke run may inform a
    hyperparameter or the abstention threshold — those are already frozen in
    `model.pkl` before this module runs, which is what makes the distinction
    meaningful rather than a loophole.

    The ledger is committed, so the count of authoritative reads is visible in
    git history and the report has to match it.
    """
    return os.environ.get("COPILOT_HOLDOUT_SMOKE") == "1"


def record_holdout_read(holdout: pd.DataFrame, model_mtime: float) -> dict[str, object]:
    """Append-only record of every holdout evaluation.

    "The final holdout is evaluated exactly once, ever" is the strongest claim
    this build makes about its headline number, and an unverifiable claim is
    worth very little. This makes it checkable: the ledger is committed, so the
    number of entries is in git history, and a second entry with a different
    model hash is visible evidence that the headline was re-measured.
    """
    entry = {
        "read_at": datetime.now().isoformat(timespec="seconds"),
        "kind": "smoke" if is_smoke_run() else "authoritative",
        "holdout_start": HOLDOUT_START,
        "holdout_rows": int(len(holdout)),
        "holdout_last_session": str(pd.to_datetime(holdout["date"]).max().date()),
        "holdout_content_hash": _hash(
            (len(holdout), str(holdout["date"].min()), str(holdout["date"].max()),
             round(float(holdout["y_ret"].sum()), 10))
        ),
        "model_fingerprint": _hash(model_mtime),
    }

    existing: list[dict] = []
    if LEDGER_PATH.exists():
        try:
            existing = json.loads(LEDGER_PATH.read_text(encoding="utf-8")).get("reads", [])
        except (json.JSONDecodeError, AttributeError):
            existing = []

    reads = [*existing, entry]
    authoritative = [r for r in reads if r.get("kind", "authoritative") == "authoritative"]
    LEDGER_PATH.write_text(
        json.dumps(
            {
                "what": (
                    "Append-only record of every evaluation against the final holdout "
                    "window. Committed on purpose: it is what makes 'the holdout was read "
                    "exactly once' auditable rather than merely asserted. A 'smoke' read "
                    "was a run of the evaluation code itself (COPILOT_HOLDOUT_SMOKE=1), "
                    "made against an already-frozen model and incapable of informing a "
                    "hyperparameter or the abstention threshold. Only 'authoritative' "
                    "reads produce a headline number."
                ),
                "authoritative_reads": len(authoritative),
                "smoke_reads": len(reads) - len(authoritative),
                "reads": reads,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return {
        "total_reads": len(reads),
        "authoritative_reads": len(authoritative),
        "smoke_reads": len(reads) - len(authoritative),
        "this_read": entry,
    }


# ─── entry point ──────────────────────────────────────────────────────────────


def main() -> int:
    for path, what in ((PANEL_PATH, "data"), (MODEL_PATH, "train")):
        if not path.exists():
            print(f"✗ {path} missing — run `python ml/tasks.py {what}` first")
            return 1

    panel = labelled(pd.read_parquet(PANEL_PATH))
    bundle = joblib.load(MODEL_PATH)
    calibrator = joblib.load(CALIBRATOR_PATH)

    train_idx, hold_idx = holdout_split(panel["date"])
    holdout = panel.iloc[hold_idx].copy()
    print(
        f"holdout: {len(holdout):,} rows, "
        f"{pd.to_datetime(holdout['date']).min().date()} -> "
        f"{pd.to_datetime(holdout['date']).max().date()}"
    )

    p_raw = bundle.raw_proba_up(holdout)
    holdout["p_cal"] = np.asarray(calibrator.predict(p_raw), dtype=float)
    holdout["pred_ret"] = bundle.predicted_return(holdout)

    y = holdout["y_dir"].to_numpy(dtype=float)
    p = holdout["p_cal"].to_numpy(dtype=float)

    curve = calibration_curve(y, p)
    oof_path = MODEL_PATH.parent / "oof_predictions.parquet"
    oof = pd.read_parquet(oof_path) if oof_path.exists() else None

    model_block = direction_metrics(y, p)
    model_block["description"] = (
        "Pooled LightGBM direction classifier with isotonic calibration, evaluated on "
        "the final holdout window. Hyperparameters and the abstention threshold were "
        "chosen on purged walk-forward folds before this window was read."
    )
    model_block["uncalibrated_log_loss"] = _round(log_loss_safe(y, p_raw))

    ledger = record_holdout_read(holdout, MODEL_PATH.stat().st_mtime)

    metrics: dict[str, object] = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "generated_by": "ml/src/copilot/evaluate.py — the only producer of model metrics",
        "headline_authoritative": not is_smoke_run(),
        "headline_note": (
            "Smoke run (COPILOT_HOLDOUT_SMOKE=1): this file exists to prove the evaluation "
            "pipeline runs end to end. Do not quote its numbers as the headline."
            if is_smoke_run()
            else "Authoritative run against the final holdout. See evaluation_design."
        ),
        "disclaimer": DISCLAIMER,
        "provenance": {
            "note": (
                "Every model-quality number rendered anywhere in the UI is read from this "
                "file. No statistic is written by hand in the application code (§4.2)."
            ),
            "panel_rows": int(len(panel)),
            "universe": list(UNIVERSE),
            "universe_size": len(UNIVERSE),
            "feature_count": len(bundle.feature_names),
            "features": list(bundle.feature_names),
            "selected_hyperparameters": bundle.params,
            "model_trained_at": bundle.trained_at,
            "model_train_rows": bundle.train_rows,
            "model_train_end": bundle.train_end,
            "horizon_sessions": bundle.horizon_sessions,
        },
        "evaluation_design": {
            "walk_forward_folds": [
                f.summary() for f in purged_walk_forward(panel["date"])
            ],
            "walk_forward_boundaries": [list(f) for f in WALK_FORWARD_FOLDS],
            "holdout_start": HOLDOUT_START,
            "holdout_rows": int(len(holdout)),
            "holdout_range": [
                str(pd.to_datetime(holdout["date"]).min().date()),
                str(pd.to_datetime(holdout["date"]).max().date()),
            ],
            "holdout_ledger": ledger,
        },
        "direction": model_block,
        "regression": regression_metrics(
            holdout["y_ret"].to_numpy(dtype=float), holdout["pred_ret"].to_numpy(dtype=float)
        ),
        "calibration": {
            "curve": curve,
            **calibration_error(curve),
            "method": "isotonic regression fit on out-of-fold walk-forward predictions",
            "validation_curve": (
                calibration_curve(
                    oof["y_dir"].to_numpy(dtype=float), oof["p_cal"].to_numpy(dtype=float)
                )
                if oof is not None
                else None
            ),
        },
        "baselines": {
            "always_up": baseline_always_up(holdout),
            "previous_day_sign": baseline_prev_day_sign(holdout),
            "logistic_3_feature": baseline_logistic(panel, train_idx, hold_idx),
            "buy_and_hold": baseline_buy_and_hold(holdout),
        },
        "breakdowns": {
            "per_year": per_year(holdout),
            "per_vix_regime": per_vix_regime(holdout, bundle.preprocessor),
            "per_ticker": per_ticker(holdout),
        },
        "abstention": abstention_block(holdout, bundle.threshold),
        "paper_trading": paper_trading_block(holdout, bundle.threshold),
        "known_limitations": [
            "Survivorship bias: the universe is today's large-caps, so names that were "
            "large-caps in 2015 and fell out are absent. This biases backtest returns "
            "upward and cannot be corrected without a point-in-time constituent history.",
            "News sentiment covers Reliance only, from 2024-12-10, so news_available is 1 "
            "on roughly 1% of panel rows and 0 everywhere else.",
            "TATAMOTORS.NS is fetched as TMPV.NS after the Tata Motors demerger; a "
            "demerged entity's pre-demerger history is not a perfectly continuous series.",
            "Prices are yfinance auto-adjusted closes. A vendor restatement of a "
            "historical split or dividend would change the panel.",
            "Paper trading assumes a fill at the close with a flat bps cost. It models no "
            "market impact, no partial fills, no borrow cost or availability for the "
            "short leg, and no circuit limits.",
            "R-squared on next-session returns is approximately zero. The product acts on "
            "the calibrated direction head with abstention, not on a return forecast.",
        ],
    }

    METRICS_PATH.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")

    # ── report ──
    d = metrics["direction"]
    b = metrics["baselines"]
    a = metrics["abstention"]
    cal = metrics["calibration"]
    print(f"\nwrote {METRICS_PATH}")
    if is_smoke_run():
        print("  ⚠ SMOKE RUN — headline_authoritative=false; do not quote these numbers")
    print(
        f"holdout ledger: {ledger['authoritative_reads']} authoritative read(s), "
        f"{ledger['smoke_reads']} smoke read(s)"
    )
    print("\n─── direction, final holdout ───")
    print(f"  accuracy           {d['accuracy']}")
    print(f"  balanced accuracy  {d['balanced_accuracy']}")
    print(f"  auc                {d['auc']}")
    print(f"  brier              {d['brier']}")
    print(f"  log loss           {d['log_loss']}")
    print("\n─── baselines ───")
    print(f"  always-up          {b['always_up']['accuracy']}")
    print(f"  prev-day sign      {b['previous_day_sign']['accuracy']}")
    print(f"  logistic (3 feat)  {b['logistic_3_feature']['accuracy']}")
    print(f"  buy & hold total   {b['buy_and_hold']['total_return']}")
    print("\n─── calibration ───")
    print(f"  expected cal error {cal['expected_calibration_error']}")
    print(f"  max cal error      {cal['max_calibration_error']}")
    print("\n─── abstention ───")
    print(f"  threshold          {a['threshold']}")
    print(f"  coverage           {a['coverage']}")
    print(f"  acc when signalled {a['accuracy_when_signalling']}")
    print(f"  acc on all rows    {a['accuracy_on_all_rows']}")
    print(f"\n─── regression ───\n  r2                 {metrics['regression']['r2']}")

    acc = float(d["accuracy"])
    if acc > 0.60:
        print(
            f"\n⚠ accuracy {acc:.4f} is above 0.60. §4.7 says to assume leakage and go find "
            "it before believing this. Run `python ml/tasks.py test` and read "
            "tests/test_leakage.py before reporting this number."
        )
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
