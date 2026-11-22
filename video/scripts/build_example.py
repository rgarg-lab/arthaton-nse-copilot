"""Find one real, correct, high-conviction call and write it out as an artifact.

The film needed a concrete case — "on this day it said X, it was this sure, and
it was right". The temptation is to invent one. There is no need: the committed
walk-forward predictions contain 14,654 real out-of-fold calls with their actual
outcomes, so the example is **queried, not authored**.

Sources, both committed:
  ml/artifacts/oof_predictions.parquet   date, ticker, p_cal, y_dir, y_ret
  ml/data/processed/panel.parquet        closing prices

What makes a case worth showing, in priority order:
  1. conviction clears the frozen gate              (it is a call the model stands behind)
  2. the call was correct
  3. the move was large                             (it is legible on screen)
  4. the calibrated probability is not degenerate   (p_cal of exactly 0 or 1 is an
     isotonic edge artifact and looks fabricated even though it is not)

This is **validation** data, not the final holdout, and the artifact says so in
a field the scene is required to display. The holdout has been read once and is
governed by a committed ledger; it is not re-opened to decorate a video.

Re-runnable. The assertions at the end mean a future run cannot silently swap in
a losing example or a weaker one.
"""
import json
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REPO = ROOT.parent

OOF = REPO / "ml" / "artifacts" / "oof_predictions.parquet"
PANEL = REPO / "ml" / "data" / "processed" / "panel.parquet"
METRICS = REPO / "ml" / "artifacts" / "metrics.json"
DEST = ROOT / "analysis" / "worked_example.json"

# The frozen abstention gate. Read from the artifact rather than assumed.
metrics = json.loads(METRICS.read_text(encoding="utf-8"))
GATE = metrics["abstention"]["threshold"]

NAMES = {
    "RELIANCE.NS": "Reliance Industries",
    "HDFCBANK.NS": "HDFC Bank",
    "ICICIBANK.NS": "ICICI Bank",
    "INFY.NS": "Infosys",
    "TCS.NS": "Tata Consultancy Services",
    "LT.NS": "Larsen & Toubro",
    "ITC.NS": "ITC",
    "SBIN.NS": "State Bank of India",
    "AXISBANK.NS": "Axis Bank",
    "BHARTIARTL.NS": "Bharti Airtel",
    "KOTAKBANK.NS": "Kotak Mahindra Bank",
    "HINDUNILVR.NS": "Hindustan Unilever",
    "MARUTI.NS": "Maruti Suzuki",
    "SUNPHARMA.NS": "Sun Pharmaceutical",
    "TATAMOTORS.NS": "Tata Motors",
    "ASIANPAINT.NS": "Asian Paints",
    "BAJFINANCE.NS": "Bajaj Finance",
    "NTPC.NS": "NTPC",
}


def main() -> None:
    d = pd.read_parquet(OOF)
    d["conviction"] = d["p_cal"].apply(lambda p: max(p, 1 - p))
    d["call_up"] = d["p_cal"] > 0.5
    d["correct"] = d["call_up"].astype(int) == d["y_dir"].astype(int)

    cand = d[
        (d["conviction"] >= GATE)
        & (d["correct"])
        # Exclude the degenerate ends of the isotonic fit.
        & (d["p_cal"] > 0.01)
        & (d["p_cal"] < 0.99)
    ].copy()
    if cand.empty:
        raise SystemExit("no correct high-conviction call found — refusing to invent one")

    cand["mag"] = cand["y_ret"].abs()
    pick = cand.sort_values(["mag", "conviction"], ascending=False).iloc[0]

    ticker = str(pick["ticker"])
    date = pd.Timestamp(pick["date"])

    # The prices either side, so the move is shown rather than asserted.
    panel = pd.read_parquet(PANEL)
    tk = panel[panel["ticker"] == ticker].sort_values("date").reset_index(drop=True)
    idx = tk.index[tk["date"] == date]
    if len(idx) == 0:
        raise SystemExit(f"{ticker} {date.date()} missing from the panel")
    i = int(idx[0])
    close_before = float(tk.loc[i, "close"])
    close_after = float(tk.loc[i + 1, "close"])
    next_date = pd.Timestamp(tk.loc[i + 1, "date"])

    # The calibration bin this call came from. This is the part that turns an
    # anecdote into evidence: across every validation day the model gave this
    # probability, did that share actually happen?
    p = float(pick["p_cal"])
    lo = min(int(p * 10) / 10, 0.9)
    bins = [
        b
        for b in metrics["calibration"]["validation_curve"]
        if b["n"] and abs(b["p_lower"] - lo) < 1e-9
    ]
    if not bins:
        raise SystemExit(f"no populated validation calibration bin for p={p:.4f}")
    b = bins[0]

    called_up = bool(pick["call_up"])
    ret = float(pick["y_ret"])

    out = {
        "generated_by": "video/scripts/build_example.py — queried, never authored",
        "basis": "walk-forward validation (out-of-fold)",
        "basis_label": "VALIDATION · OUT-OF-FOLD",
        "not_holdout": (
            "This is validation data. The final holdout was read once under a "
            "committed ledger and is not re-opened to illustrate a video."
        ),
        "fold": str(pick["fold"]),
        "ticker": ticker,
        "name": NAMES.get(ticker, ticker.replace(".NS", "")),
        "date": date.strftime("%Y-%m-%d"),
        # `%-d` is a POSIX directive and raises on Windows; build the
        # day-without-leading-zero by hand so this runs on either platform.
        "date_display": f"{date.day} {date.strftime('%B %Y')}",
        "next_date": next_date.strftime("%Y-%m-%d"),
        "next_date_display": f"{next_date.day} {next_date.strftime('%B %Y')}",
        "p_cal": round(p, 6),
        "called": "up" if called_up else "down",
        "conviction": round(max(p, 1 - p), 6),
        "conviction_display": f"{max(p, 1 - p) * 100:.1f}%",
        "gate": GATE,
        "gate_display": f"{GATE * 100:.0f}%",
        "close_before": round(close_before, 2),
        "close_after": round(close_after, 2),
        "close_before_display": f"₹{close_before:,.2f}",
        "close_after_display": f"₹{close_after:,.2f}",
        "actual_return": round(ret, 6),
        "actual_return_display": f"{ret * 100:+.2f}%",
        "correct": bool(pick["correct"]),
        "vix_level": round(float(pick["vix_level"]), 2),
        "calibration_bin": {
            "range_display": f"{b['p_lower']:.0%}–{b['p_upper']:.0%}",
            "n": b["n"],
            "mean_predicted": round(b["mean_predicted"], 6),
            "observed_up_rate": round(b["observed_up_rate"], 6),
            "mean_predicted_display": f"{b['mean_predicted'] * 100:.1f}%",
            "observed_up_display": f"{b['observed_up_rate'] * 100:.1f}%",
            "observed_down_display": f"{(1 - b['observed_up_rate']) * 100:.1f}%",
        },
    }

    # Guard rails. A future re-run must not quietly produce a weaker example.
    assert out["correct"], "picked example is not a correct call"
    assert out["conviction"] >= GATE, "picked example is below the frozen gate"
    assert abs(out["actual_return"]) > 0.02, "picked move is too small to read"
    assert out["calibration_bin"]["n"] >= 50, "calibration bin too sparse to cite"

    DEST.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in out.items() if k != "not_holdout"}, indent=2))


if __name__ == "__main__":
    main()
