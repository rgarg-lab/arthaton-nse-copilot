"""Leakage-safe, scale-free features.

Two rules govern this module, and between them they are the single biggest
difference from my earlier predictor.

**Scale-free.** No raw prices and no raw close lags. The old pipeline fed trees
the absolute rupee close plus thirty raw close lags; the tree then partitioned on
"is the price above ₹2,400", learned that from 2017–2024 levels, and was asked
about 2026 levels it had never seen. Trees cannot extrapolate past the edge of
their training range, so that model's view of a new price regime was whatever its
rightmost leaf happened to say. Everything here is a ratio, a z-score, a rank or
a bounded oscillator, which is also what makes *pooling across 18 tickers* valid:
a 1.2% move means the same thing in HDFCBANK and in NTPC, a ₹1,600 close does not.

**Leakage-safe.** Every feature for row *t* is computable at the close of session
*t*. The label is the *t → t+1* return. Specifically:
- no `.shift(-n)` anywhere in this file, on any column;
- rolling windows are backward-looking (pandas' default);
- cross-sectional ranks use only other tickers on the *same* date, which is
  information available at that close;
- sentiment is shifted forward by one session (see `sentiment.py`);
- anything that must be *fitted* — the VIX regime cut-points, the imputation
  medians — is not computed here at all. It lives in `Preprocessor`, which is fit
  on training rows only and applied inside each walk-forward fold.

`tests/test_leakage.py` asserts the first two mechanically rather than trusting
this docstring.

### The ≤60 ceiling, and where the spec was trimmed

§6.2 caps the feature count at 60 and §9.1 restates it as "a ceiling, not a
target". Taken literally, §6.2's own list over-subscribes it: eight macro series
× (returns at 1/3/7d + 7d realised vol) is 32 macro features on its own, and the
per-ticker, cross-sectional, calendar and sentiment blocks come to 38. That is
70. The ceiling is the harder constraint — it is restated twice and it is the
thing that protects a 40k-row pooled model from being fit to noise — so the macro
block is what gave way:

- four **primary** series (Nifty 50, India VIX, USD/INR, S&P 500) get the full
  four features each, because they are the ones a next-session Indian equity move
  actually keys off;
- four **secondary** series (Nifty Energy, Brent, Gold, Nasdaq) get 1-day return
  only. Nifty Energy still earns its download: it is the sector benchmark for the
  relative-strength feature regardless of how many of its own returns are used.

That is 20 macro features instead of 32, for a total of **58**. Every feature
*class* §6.2 asks for is present; two macro series contribute fewer horizons.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from .config import MACRO_SERIES, MARKET_INDEX, SECTOR_INDEX, SECTOR_OF
from .sentiment import DECAY

# ─── which macro series get which horizons (see the docstring) ────────────────

MACRO_PRIMARY: tuple[str, ...] = ("nifty", "vix", "usdinr", "spx")
MACRO_SECONDARY: tuple[str, ...] = ("niftyenergy", "brent", "gold", "ndx")

RETURN_HORIZONS = (1, 3, 5, 10, 20, 60)
SMA_WINDOWS = (10, 20, 50, 200)
VOL_WINDOWS = (5, 10, 20, 60)

# Identity columns and labels — present in the panel, never fed to the model.
ID_COLUMNS = ["date", "ticker", "close", "vix_level"]
LABEL_COLUMNS = ["y_ret", "y_dir"]


# ─── per-ticker technical block ───────────────────────────────────────────────


def _rsi(close: pd.Series, window: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    # Wilder's smoothing, which is what RSI actually specifies; the ported version
    # used a simple rolling mean, which is a slightly different indicator.
    avg_gain = gain.ewm(alpha=1 / window, adjust=False, min_periods=window).mean()
    avg_loss = loss.ewm(alpha=1 / window, adjust=False, min_periods=window).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    return 100.0 - (100.0 / (1.0 + rs))


def _ticker_features(g: pd.DataFrame) -> pd.DataFrame:
    """Features for one ticker's own price history. `g` is sorted by date."""
    close = g["close"].astype(float)
    out = pd.DataFrame(index=g.index)

    # Returns at several horizons — a fraction, not a percent (§6.3: one unit).
    for h in RETURN_HORIZONS:
        out[f"ret_{h}"] = close.pct_change(h)

    # Moving-average *deviations*, not the averages themselves.
    for w in SMA_WINDOWS:
        out[f"sma_dev_{w}"] = close / close.rolling(w).mean() - 1.0

    out["rsi_14"] = _rsi(close) / 100.0  # bounded to [0,1] for consistency

    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    # Normalised by price, so it is comparable across a ₹200 and a ₹4,000 stock.
    out["macd_norm"] = macd / close

    sma20 = close.rolling(20).mean()
    sd20 = close.rolling(20).std()
    # Bollinger %B: 0 at the lower band, 1 at the upper. Already scale-free.
    out["bb_pctb_20"] = (close - (sma20 - 2 * sd20)) / (4 * sd20).replace(0.0, np.nan)

    daily = close.pct_change()
    for w in VOL_WINDOWS:
        # Annualised realised vol — 252 sessions.
        out[f"rv_{w}"] = daily.rolling(w).std() * np.sqrt(252.0)
    out["vol_of_vol"] = out["rv_20"].rolling(20).std()
    out["ret_skew_20"] = daily.rolling(20).skew()

    volume = g["volume"].astype(float)
    vol_mean = volume.rolling(20).mean()
    vol_sd = volume.rolling(20).std()
    out["vol_z_20"] = (volume - vol_mean) / vol_sd.replace(0.0, np.nan)
    out["vol_chg"] = volume.pct_change().clip(-5.0, 5.0)

    # Intraday spreads as fractions of close.
    out["hl_spread"] = (g["high"].astype(float) - g["low"].astype(float)) / close
    out["oc_spread"] = (g["open"].astype(float) - close) / close

    return out


# ─── cross-sectional block ────────────────────────────────────────────────────

XS_SOURCE_COLUMNS = ("ret_1", "ret_5", "ret_20", "rv_20")


def _cross_sectional_ranks(df: pd.DataFrame) -> pd.DataFrame:
    """Percentile rank within the universe, per date.

    This feature class only exists because the build went multi-ticker, and it is
    the one that most clearly could not have come from the single-stock
    predecessor: "Infosys is up 0.4%" is weak, "Infosys is the 2nd strongest name
    in the basket today while the index is flat" is not.

    `pct=True` gives a value in (0,1] that does not depend on how many tickers
    survived ingestion that day.
    """
    out = pd.DataFrame(index=df.index)
    grouped = df.groupby("date", sort=False)
    for col in XS_SOURCE_COLUMNS:
        out[f"xs_rank_{col}"] = grouped[col].rank(pct=True, method="average")
    return out


# ─── macro block ──────────────────────────────────────────────────────────────


def _macro_features(macro: pd.DataFrame) -> pd.DataFrame:
    """Macro returns and realised vol, indexed by date.

    Forward-fills levels first: Brent, gold and the US indices trade on a
    different calendar from the NSE, so an NSE session frequently has no same-day
    US close. Forward-filling uses the *last known* value, which is
    leakage-safe; interpolating would not be.
    """
    m = macro.sort_values("date").reset_index(drop=True).copy()
    out = pd.DataFrame({"date": m["date"]})

    for key in MACRO_SERIES:
        col = f"{key}_close"
        level = pd.to_numeric(m[col], errors="coerce").ffill()

        if key in MACRO_PRIMARY:
            out[f"mac_{key}_ret_1"] = level.pct_change(1)
            out[f"mac_{key}_ret_3"] = level.pct_change(3)
            out[f"mac_{key}_ret_7"] = level.pct_change(7)
            out[f"mac_{key}_rv_7"] = level.pct_change().rolling(7).std() * np.sqrt(252.0)
        else:
            out[f"mac_{key}_ret_1"] = level.pct_change(1)

    # Kept as an identity column, not a feature: `Preprocessor` turns it into a
    # tercile bucket with cut-points fit on training rows only (§6.2).
    out["vix_level"] = pd.to_numeric(m["vix_close"], errors="coerce").ffill()

    return out


# ─── relative strength ────────────────────────────────────────────────────────


def _relative_strength(df: pd.DataFrame, macro: pd.DataFrame) -> pd.DataFrame:
    """Excess return vs the broad index and vs the sector index, at 5d and 20d.

    Only Nifty Energy is ingested as a sector series, so for the thirteen
    non-energy names `rs_sector_*` equals `rs_market_*`. That is deliberate and
    cheap — six more index downloads for a feature that is mostly a duplicate of
    one already present is not where the remaining budget goes — and it is
    recorded here rather than left for someone to discover.
    """
    levels = macro.set_index("date")
    out = pd.DataFrame(index=df.index, dtype=float)

    def index_return(key: str, horizon: int) -> pd.Series:
        level = pd.to_numeric(levels[f"{key}_close"], errors="coerce").ffill()
        return level.pct_change(horizon)

    market = {h: index_return(MARKET_INDEX, h) for h in (5, 20)}
    sector_keys = {SECTOR_OF.get(t, ""): None for t in df["ticker"].unique()}
    sector_returns = {
        sec: {h: index_return(SECTOR_INDEX.get(sec, MARKET_INDEX), h) for h in (5, 20)}
        for sec in sector_keys
    }

    dates = df["date"]
    for h in (5, 20):
        out[f"rs_market_{h}"] = df[f"ret_{h}"].to_numpy() - dates.map(market[h]).to_numpy()
        sector_h = df["ticker"].map(lambda t: SECTOR_OF.get(t, ""))
        mapped = np.array(
            [sector_returns[sec][h].get(d, np.nan) for sec, d in zip(sector_h, dates, strict=True)]
        )
        out[f"rs_sector_{h}"] = df[f"ret_{h}"].to_numpy() - mapped

    return out


# ─── calendar ─────────────────────────────────────────────────────────────────


def _calendar_features(dates: pd.Series) -> pd.DataFrame:
    """Day-of-week, month, and the F&O expiry-week flag.

    NSE monthly equity derivatives expire on the last Thursday of the month. The
    flag marks the sessions in that calendar week, which is when expiry-related
    flow is a real microstructure effect rather than folklore.
    """
    d = pd.to_datetime(dates)
    out = pd.DataFrame(index=dates.index)
    out["cal_dow"] = d.dt.dayofweek.astype("int16")
    out["cal_month"] = d.dt.month.astype("int16")

    # Last Thursday of each (year, month) present in the data.
    month_end = d + pd.offsets.MonthEnd(0)
    # Thursday is weekday 3; step back from month end to the most recent Thursday.
    days_back = (month_end.dt.dayofweek - 3) % 7
    last_thursday = month_end - pd.to_timedelta(days_back, unit="D")
    same_iso_week = (d.dt.isocalendar().week.to_numpy() == last_thursday.dt.isocalendar().week.to_numpy()) & (
        d.dt.year.to_numpy() == last_thursday.dt.year.to_numpy()
    )
    out["cal_expiry_week"] = same_iso_week.astype("int8")
    return out


# ─── sentiment, decayed along the trading calendar ────────────────────────────


def _sentiment_features(df: pd.DataFrame, daily: pd.DataFrame) -> pd.DataFrame:
    """Merge the daily FinBERT score onto the panel, then decay and shift.

    Order matters and is the ported mechanism (`sentiment.py` explains why):
      1. merge the day's mean signed score where news exists;
      2. on a no-news session, carry the previous session's value forward at
         0.9× — a staleness model, not a "the news was neutral" claim;
      3. shift the whole block forward by one session, so row *t* carries what was
         known at the close of *t-1* and cannot echo the same-day move.
    """
    out = pd.DataFrame(index=df.index, dtype=float)

    if daily.empty:
        out["sent_score"] = 0.0
        out["sent_decay"] = 0.0
        out["news_available"] = 0.0
        return out

    daily = daily.copy()
    daily["date"] = pd.to_datetime(daily["date"]).dt.normalize()
    merged = df[["date", "ticker"]].merge(
        daily[["date", "ticker", "sent_raw"]], on=["date", "ticker"], how="left"
    )
    merged.index = df.index
    has_news = merged["sent_raw"].notna()

    pieces = []
    for ticker, g in merged.assign(_has=has_news).groupby("ticker", sort=False):
        raw = g["sent_raw"].to_numpy(dtype=float)
        flag = g["_has"].to_numpy()
        decayed = np.zeros(len(g), dtype=float)
        carried = 0.0
        for i in range(len(g)):
            if flag[i]:
                carried = raw[i]
            else:
                carried = carried * DECAY
            decayed[i] = carried
        piece = pd.DataFrame(
            {
                "sent_score": np.where(flag, raw, 0.0),
                "sent_decay": decayed,
                "news_available": flag.astype(float),
            },
            index=g.index,
        )
        # The one-session shift, applied per ticker so it never crosses a name.
        piece = piece.shift(1).fillna(0.0)
        pieces.append(piece)

    return pd.concat(pieces).reindex(df.index).fillna(0.0)


# ─── assembly ─────────────────────────────────────────────────────────────────


def build_features(prices: pd.DataFrame, macro: pd.DataFrame, daily_sent: pd.DataFrame) -> pd.DataFrame:
    """Long panel: one row per (date, ticker), identity columns + 58 features.

    `prices` is the long OHLCV frame from `ingest.fetch_universe`, `macro` the
    wide frame from `ingest.fetch_macro`, `daily_sent` the frame from
    `sentiment.daily_sentiment`.
    """
    px = prices.sort_values(["ticker", "date"]).reset_index(drop=True)

    # An explicit loop rather than groupby.apply: the per-ticker block reads
    # several columns and returns a differently-shaped frame, which is exactly
    # the case where groupby.apply's column handling differs between pandas
    # versions. A loop over 18 names costs nothing and cannot surprise.
    per_ticker = pd.concat(
        [_ticker_features(g) for _, g in px.groupby("ticker", sort=False)]
    ).reindex(px.index)
    panel = pd.concat([px[["date", "ticker", "close"]], per_ticker], axis=1)

    panel = pd.concat([panel, _cross_sectional_ranks(panel)], axis=1)

    mac = _macro_features(macro)
    panel = panel.merge(mac, on="date", how="left")

    panel = pd.concat([panel, _relative_strength(panel, macro)], axis=1)
    panel = pd.concat([panel, _calendar_features(panel["date"])], axis=1)
    panel = pd.concat([panel, _sentiment_features(panel, daily_sent)], axis=1)

    panel = panel.replace([np.inf, -np.inf], np.nan)
    return panel.sort_values(["date", "ticker"]).reset_index(drop=True)


def feature_columns(panel: pd.DataFrame) -> list[str]:
    """The model's input columns: everything that is not an identity column and
    not a label. `ticker` is deliberately absent — ticker identity is not a
    feature (§6.2), which is what keeps the model a statement about market states
    rather than about which eighteen names happened to be chosen."""
    skip = set(ID_COLUMNS) | set(LABEL_COLUMNS)
    return [c for c in panel.columns if c not in skip]


# ─── fitted preprocessing — training rows only ────────────────────────────────


@dataclass
class Preprocessor:
    """Everything that has to be *fit* before it can be applied.

    Kept out of `build_features` on purpose: if the VIX terciles or the
    imputation medians were computed over the whole panel, every fold's
    validation rows would have contributed to its own training transform. That is
    the quiet version of leakage — it does not show up as a suspicious accuracy,
    it just inflates every fold a little. §6.4 requires these to be fit on
    training rows only, so they are fit per fold and the frozen artifact carries
    the final fit.
    """

    vix_cuts: tuple[float, float] | None = None
    medians: dict[str, float] = field(default_factory=dict)
    columns: list[str] = field(default_factory=list)

    def fit(self, train: pd.DataFrame, columns: list[str]) -> Preprocessor:
        self.columns = list(columns)
        vix = pd.to_numeric(train.get("vix_level"), errors="coerce").dropna()
        if len(vix) >= 30:
            lo, hi = np.quantile(vix.to_numpy(), [1 / 3, 2 / 3])
            self.vix_cuts = (float(lo), float(hi))
        else:
            self.vix_cuts = None
        self.medians = {
            c: float(v) if np.isfinite(v) else 0.0
            for c, v in zip(
                self.columns,
                np.nanmedian(
                    train[self.columns].astype(float).to_numpy(dtype=float, na_value=np.nan),
                    axis=0,
                ),
                strict=True,
            )
        }
        return self

    def vix_regime(self, vix_level: pd.Series) -> pd.Series:
        """0 = calm, 1 = normal, 2 = stressed, -1 = unknown."""
        v = pd.to_numeric(vix_level, errors="coerce")
        if self.vix_cuts is None:
            return pd.Series(np.full(len(v), -1), index=v.index, dtype="int16")
        lo, hi = self.vix_cuts
        regime = np.where(v <= lo, 0, np.where(v <= hi, 1, 2))
        return pd.Series(np.where(v.isna(), -1, regime), index=v.index).astype("int16")

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Returns the model matrix: fitted columns, imputed, with `vix_regime`
        substituted in for the raw level."""
        X = df[self.columns].astype(float).copy()
        for col, med in self.medians.items():
            X[col] = X[col].fillna(med)
        X["vix_regime"] = self.vix_regime(df["vix_level"]).to_numpy()
        return X

    @property
    def model_columns(self) -> list[str]:
        return [*self.columns, "vix_regime"]
