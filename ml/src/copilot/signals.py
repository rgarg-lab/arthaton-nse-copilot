"""`make signals` — today's calibrated call for every name, written to
`artifacts/latest_signals.json`.

Scores the panel's most recent row per ticker: the row that has features but no
outcome yet, which is exactly the live prediction target. Nothing here trains,
fits or fetches — it loads the frozen model and the committed panel (§4.3).

Three fields are worth explaining, because each one is a place where a stock
predictor normally overclaims.

**`probability_up`** is the isotonic-calibrated probability. It is a real
probability: of the sessions where this model said 0.62, about 62% went up, and
`metrics.json`'s calibration curve is the evidence. §4.6 forbids presenting an
uncalibrated number as a confidence, so the raw model output is carried too,
labelled as raw, and the UI shows the calibrated one.

**`abstain`** is true when conviction does not clear the frozen threshold, and
when it is true there is **no direction field to render**. The abstention is the
product, not a degraded mode of it.

**`predicted_range`** is a volatility-implied band, *not* a model confidence
interval, and it says so in its own payload. The regressor supplies the centre;
the width is ±1 realised-volatility standard deviation for one session, computed
from `rv_20`. Calling it a confidence interval would imply the model quantified
its own uncertainty about magnitude, which it has not — R² on next-session
returns is approximately zero and `metrics.json` reports that.
"""

from __future__ import annotations

import json
from datetime import datetime

import joblib
import numpy as np
import pandas as pd

from .config import (
    CALIBRATOR_PATH,
    DISCLAIMER,
    MODEL_PATH,
    PANEL_PATH,
    SIGNALS_PATH,
    TICKER_NAMES,
    UNIVERSE,
)
from .ingest import data_freshness

REGIME_NAMES = {-1: "unknown", 0: "calm", 1: "normal", 2: "stressed"}


def latest_rows(panel: pd.DataFrame) -> pd.DataFrame:
    """The most recent row per ticker — the live prediction target."""
    return (
        panel.sort_values("date")
        .groupby("ticker", as_index=False, sort=True)
        .tail(1)
        .sort_values("ticker")
        .reset_index(drop=True)
    )


def build_signals(panel: pd.DataFrame, bundle, calibrator) -> dict[str, object]:
    rows = latest_rows(panel)

    p_raw = bundle.raw_proba_up(rows)
    p_cal = np.asarray(calibrator.predict(p_raw), dtype=float)
    pred_ret = bundle.predicted_return(rows)
    regimes = bundle.preprocessor.vix_regime(rows["vix_level"]).to_numpy()

    threshold = float(bundle.threshold)
    conviction = np.abs(p_cal - 0.5) + 0.5

    # One session of realised volatility, from the annualised 20-day figure.
    sigma = rows["rv_20"].astype(float).to_numpy() / np.sqrt(252.0)

    signals = []
    for i, row in rows.iterrows():
        abstains = bool(conviction[i] < threshold)
        direction = "up" if p_cal[i] > 0.5 else "down"
        s: dict[str, object] = {
            "ticker": str(row["ticker"]),
            "name": TICKER_NAMES.get(str(row["ticker"]), str(row["ticker"])),
            "as_of_session": str(pd.Timestamp(row["date"]).date()),
            "predicts_session_after": str(pd.Timestamp(row["date"]).date()),
            "abstain": abstains,
            "probability_up": round(float(p_cal[i]), 6),
            "conviction": round(float(conviction[i]), 6),
            "threshold": threshold,
            "raw_model_output": {
                "value": round(float(p_raw[i]), 6),
                "note": (
                    "Uncalibrated classifier output. Shown for transparency only; never "
                    "present this as a confidence (§4.6)."
                ),
            },
            "volatility_regime": REGIME_NAMES.get(int(regimes[i]), "unknown"),
            "predicted_range": {
                "centre": round(float(pred_ret[i]), 6),
                "low": round(float(pred_ret[i] - sigma[i]), 6),
                "high": round(float(pred_ret[i] + sigma[i]), 6),
                "basis": (
                    "Centre is the return regressor's point estimate. The band is "
                    "plus/minus one session of realised volatility from rv_20. This is a "
                    "volatility-implied range, NOT a model confidence interval — the "
                    "regressor's R-squared on next-session returns is approximately zero "
                    "(see metrics.json)."
                ),
            },
            "latest_close": round(float(row["close"]), 2),
            "disclaimer": DISCLAIMER,
        }
        if abstains:
            # No direction field at all when abstaining: a client cannot render a
            # call it was not given, which is a stronger guarantee than a flag.
            s["abstain_reason"] = (
                f"Calibrated conviction {conviction[i]:.3f} is below the frozen "
                f"abstention threshold {threshold:.3f}. In the "
                f"{REGIME_NAMES.get(int(regimes[i]), 'unknown')} volatility regime this "
                "model's measured edge does not justify a directional call today."
            )
        else:
            s["direction"] = direction
        signals.append(s)

    emitted = [s for s in signals if not s["abstain"]]
    return {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "generated_by": "ml/src/copilot/signals.py from the frozen model in artifacts/",
        "disclaimer": DISCLAIMER,
        "model": {
            "trained_at": bundle.trained_at,
            "train_end": bundle.train_end,
            "train_rows": bundle.train_rows,
            "threshold": threshold,
            "horizon_sessions": bundle.horizon_sessions,
            "calibration": "isotonic regression on out-of-fold walk-forward predictions",
        },
        "data": data_freshness(panel),
        "universe_size": len(UNIVERSE),
        "summary": {
            "signals_emitted": len(emitted),
            "abstained": len(signals) - len(emitted),
            "up_calls": sum(1 for s in emitted if s.get("direction") == "up"),
            "down_calls": sum(1 for s in emitted if s.get("direction") == "down"),
            "mean_probability_up": round(float(np.mean(p_cal)), 6),
        },
        "signals": signals,
    }


def main() -> int:
    for path, what in ((PANEL_PATH, "data"), (MODEL_PATH, "train")):
        if not path.exists():
            print(f"✗ {path} missing — run `python ml/tasks.py {what}` first")
            return 1

    panel = pd.read_parquet(PANEL_PATH)
    bundle = joblib.load(MODEL_PATH)
    calibrator = joblib.load(CALIBRATOR_PATH)

    payload = build_signals(panel, bundle, calibrator)
    SIGNALS_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    s = payload["summary"]
    print(f"wrote {SIGNALS_PATH}")
    print(f"  as of        : {payload['data']['last_session']}")
    print(f"  signals      : {s['signals_emitted']} ({s['up_calls']} up, {s['down_calls']} down)")
    print(f"  abstained    : {s['abstained']} of {len(payload['signals'])}")
    print(f"  mean p(up)   : {s['mean_probability_up']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
