"""Single source of truth for the universe, the date ranges, the split
boundaries and the cost assumptions.

Nothing downstream hardcodes a ticker, a date or a basis-point figure. If a
number about *the experiment* needs to change, it changes here — and because the
model is frozen after step 3 (BUILD_SPEC.md §6.5), changing the split boundaries
or the universe after that point invalidates the headline metric.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# ─── paths ────────────────────────────────────────────────────────────────────

ML_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ML_DIR / "data"
RAW_DIR = DATA_DIR / "raw"  # gitignored yfinance cache
PROCESSED_DIR = DATA_DIR / "processed"  # committed
ARTIFACTS_DIR = ML_DIR / "artifacts"  # committed
NEWS_DIR = DATA_DIR / "news"  # committed FinBERT-scored corpus

PANEL_PATH = PROCESSED_DIR / "panel.parquet"
SENTIMENT_DAILY_PATH = PROCESSED_DIR / "sentiment_daily.csv"

MODEL_PATH = ARTIFACTS_DIR / "model.pkl"
CALIBRATOR_PATH = ARTIFACTS_DIR / "calibrator.pkl"
METRICS_PATH = ARTIFACTS_DIR / "metrics.json"
SIGNALS_PATH = ARTIFACTS_DIR / "latest_signals.json"
IMPORTANCE_PATH = ARTIFACTS_DIR / "feature_importance.json"
NEIGHBORS_INDEX_PATH = ARTIFACTS_DIR / "neighbors_index.npz"

for _d in (RAW_DIR, PROCESSED_DIR, ARTIFACTS_DIR, NEWS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# ─── universe ─────────────────────────────────────────────────────────────────
# Fixed at these 18 NSE large-caps (BUILD_SPEC.md §6.1). Not a substitute for
# Nifty-50: ingestion and FinBERT are the slow serial steps, and 18 names still
# give ~40k rows and a genuine cross-section.
#
# SURVIVORSHIP BIAS: these are *current* constituents. A name that was a
# large-cap in 2015 and fell out is absent, which biases backtest returns
# upward. Named in the README; it is not fixable without a point-in-time
# constituent history, which is not freely available.

UNIVERSE: tuple[str, ...] = (
    "RELIANCE.NS",
    "HDFCBANK.NS",
    "ICICIBANK.NS",
    "INFY.NS",
    "TCS.NS",
    "LT.NS",
    "ITC.NS",
    "SBIN.NS",
    "AXISBANK.NS",
    "BHARTIARTL.NS",
    "KOTAKBANK.NS",
    "HINDUNILVR.NS",
    "MARUTI.NS",
    "SUNPHARMA.NS",
    "TATAMOTORS.NS",
    "ASIANPAINT.NS",
    "BAJFINANCE.NS",
    "NTPC.NS",
)

# Human-readable names, so the UI never has to carry a ticker→name map of its own.
TICKER_NAMES: dict[str, str] = {
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

# Sector grouping, used only for the relative-strength-vs-sector feature.
SECTOR_OF: dict[str, str] = {
    "RELIANCE.NS": "ENERGY",
    "NTPC.NS": "ENERGY",
    "HDFCBANK.NS": "FIN",
    "ICICIBANK.NS": "FIN",
    "SBIN.NS": "FIN",
    "AXISBANK.NS": "FIN",
    "KOTAKBANK.NS": "FIN",
    "BAJFINANCE.NS": "FIN",
    "INFY.NS": "IT",
    "TCS.NS": "IT",
    "ITC.NS": "FMCG",
    "HINDUNILVR.NS": "FMCG",
    "ASIANPAINT.NS": "FMCG",
    "MARUTI.NS": "AUTO",
    "TATAMOTORS.NS": "AUTO",
    "LT.NS": "INFRA",
    "BHARTIARTL.NS": "TELECOM",
    "SUNPHARMA.NS": "PHARMA",
}

# ─── macro series ─────────────────────────────────────────────────────────────
# key -> yfinance symbol. Keys become feature-name prefixes, so they are short.

MACRO_SERIES: dict[str, str] = {
    "nifty": "^NSEI",
    "niftyenergy": "^CNXENERGY",
    "vix": "^INDIAVIX",
    "brent": "BZ=F",
    "usdinr": "USDINR=X",
    "gold": "GC=F",
    "spx": "^GSPC",
    "ndx": "^IXIC",
}

MARKET_INDEX = "nifty"  # relative strength benchmark

# Sector index per sector, for relative-strength-vs-sector. Only ENERGY has a
# dedicated series ingested; the rest fall back to the broad index, and the
# feature is then identical to rel-strength-vs-market for those names. That is
# honest and cheap; adding six more index downloads is not worth the runtime.
SECTOR_INDEX: dict[str, str] = {
    "ENERGY": "niftyenergy",
}

# ─── dates ────────────────────────────────────────────────────────────────────

START_DATE = "2015-01-01"

# Purged walk-forward folds (BUILD_SPEC.md §6.4). (train_end, val_start, val_end).
# Validation years are contiguous; the embargo is applied by the splitter, not by
# shifting these dates, so the boundaries stay readable.
WALK_FORWARD_FOLDS: tuple[tuple[str, str, str], ...] = (
    ("2021-12-31", "2022-01-01", "2022-12-31"),
    ("2022-12-31", "2023-01-01", "2023-12-31"),
    ("2023-12-31", "2024-01-01", "2024-12-31"),
    ("2024-12-31", "2025-01-01", "2025-06-30"),
)

# The final holdout. Touched EXACTLY ONCE, by evaluate.py, at the very end.
# Every hyperparameter and the abstention threshold are chosen on the folds above.
HOLDOUT_START = "2025-07-01"

EMBARGO_SESSIONS = 5  # purge gap between train and validation

# ─── labels ───────────────────────────────────────────────────────────────────

HORIZON_SESSIONS = int(os.environ.get("COPILOT_HORIZON", "1"))

# ─── cost assumptions ─────────────────────────────────────────────────────────
# Used by the paper-trading simulation only. Never by the model.
# Indian cash-equity delivery round trip, conservative: brokerage + STT +
# exchange + GST + stamp + slippage. Three scenarios so the equity curve can be
# shown as a band rather than a single optimistic line.


@dataclass(frozen=True)
class CostModel:
    label: str
    round_trip_bps: float
    slippage_bps: float

    @property
    def total_bps(self) -> float:
        return self.round_trip_bps + self.slippage_bps


COST_SCENARIOS: tuple[CostModel, ...] = (
    CostModel("optimistic", 5.0, 2.0),
    CostModel("realistic", 10.0, 3.0),
    CostModel("pessimistic", 20.0, 5.0),
)
DEFAULT_COST_SCENARIO = "realistic"

# ─── model ────────────────────────────────────────────────────────────────────

RANDOM_SEED = 20260112
MAX_FEATURES = 60  # a ceiling, not a target (BUILD_SPEC.md §6.2)

# Candidate abstention thresholds, scanned on validation only.
ABSTENTION_GRID: tuple[float, ...] = tuple(round(0.50 + 0.005 * i, 3) for i in range(0, 21))

# A threshold is only acceptable if it still emits a signal on at least this
# fraction of sessions — otherwise "abstain always" trivially maximises accuracy.
MIN_COVERAGE = 0.10

# ─── service ──────────────────────────────────────────────────────────────────


def cors_origins() -> list[str]:
    """Env-driven, never hardcoded (the old project pinned localhost:5173)."""
    raw = os.environ.get("COPILOT_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    return [o.strip() for o in raw.split(",") if o.strip()]


def api_host() -> str:
    return os.environ.get("COPILOT_HOST", "127.0.0.1")


def api_port() -> int:
    return int(os.environ.get("COPILOT_PORT", "8000"))


DISCLAIMER = (
    "Historical and paper-trading analysis only. Not investment advice. "
    "Past measured accuracy does not predict future results."
)
