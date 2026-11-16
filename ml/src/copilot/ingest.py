"""yfinance ingestion — multi-ticker equities plus macro series, disk-cached.

Three properties matter here, and the old project had none of them:

1. **Disk-cached, keyed by symbol + range.** A re-run on the same day does no
   network I/O at all, so the pipeline is developable offline and a judge is not
   at the mercy of Yahoo's rate limiter.
2. **Sequential with backoff.** Parallel multi-ticker downloads get throttled
   and come back with silent holes, which is far worse than being slow.
3. **Never called on the request path.** `api.py` does not import this module.
   Prices enter the system through `make data` and leave through
   `data/processed/panel.parquet`, which is committed.
"""

from __future__ import annotations

import os
import time
from datetime import date, datetime
from pathlib import Path

import pandas as pd

from .config import MACRO_SERIES, RAW_DIR, START_DATE, UNIVERSE, download_symbol

OHLCV = ["open", "high", "low", "close", "volume"]

# Yahoo rate-limits aggressively once a run has made a few dozen calls, and it
# reports the throttle as a generic empty response. The backoff is deliberately
# long-tailed: waiting a minute once is far cheaper than a panel with a silent
# hole in one ticker, which is what short retries produce.
_MAX_ATTEMPTS = 5
_BACKOFF_SECONDS = (5, 20, 60, 120)


def _safe_name(symbol: str) -> str:
    return symbol.replace("^", "idx_").replace("=", "_").replace(".", "_").replace("/", "_")


def _cache_path(symbol: str, start: str, end: str) -> Path:
    """Legacy cache path, keyed on the exact window that was requested.

    Kept only so `_history_path` can adopt files written before the incremental cache
    existed. Nothing writes this layout any more — see the note there.
    """
    return RAW_DIR / f"{_safe_name(symbol)}__{start}__{end}.parquet"


def _history_path(symbol: str, start: str) -> Path:
    """One rolling history file per symbol, keyed on the start date only.

    ## Why the end date had to come out of the key

    It used to be in there, which meant the filename changed every single day: a refresh on
    the 16th looked for `…__2026-11-16.parquet`, found the 12th's file sitting beside it,
    missed, and re-downloaded **eleven years of history for all twenty-five symbols**. Yahoo
    rate-limits hard after a few dozen such calls, which is why every refresh attempt in
    this project has failed and the panel has been stuck days behind.

    Keyed on the start alone, the history is fetched once and then *extended* — a refresh
    asks only for the sessions after the last one on disk, which is a handful of rows per
    symbol instead of three thousand. That is the difference between a refresh that Yahoo
    tolerates and one that it blocks.
    """
    return RAW_DIR / f"{_safe_name(symbol)}__{start}__history.parquet"


def _adopt_legacy_cache(symbol: str, start: str) -> pd.DataFrame | None:
    """Fold any pre-existing fixed-window cache file into the rolling history.

    Those files hold years of data that Yahoo will not re-serve while it is throttling, so
    they are migrated rather than orphaned: the newest window wins, and it is written to the
    history path the first time this runs.
    """
    pattern = f"{_safe_name(symbol)}__{start}__*.parquet"
    candidates = sorted(
        p for p in RAW_DIR.glob(pattern) if not p.name.endswith("__history.parquet")
    )
    if not candidates:
        return None
    # Filenames end in the window's end date, so the last one sorts newest.
    return pd.read_parquet(candidates[-1])


def _flatten(df: pd.DataFrame) -> pd.DataFrame:
    """yfinance returns a MultiIndex column frame for some symbols and a flat one
    for others, depending on version and on whether one or many tickers were
    asked for. Normalise to lowercase flat columns."""
    if isinstance(df.columns, pd.MultiIndex):
        df = df.copy()
        df.columns = df.columns.get_level_values(0)
    df = df.rename(columns={c: str(c).lower().replace(" ", "_") for c in df.columns})
    return df


def fetch_symbol(
    symbol: str,
    start: str = START_DATE,
    end: str | None = None,
    *,
    use_cache: bool = True,
) -> pd.DataFrame:
    """One symbol's daily OHLCV as a tidy frame: `date` plus the OHLCV columns.

    Returns an empty frame (not an exception) if the symbol cannot be fetched and
    is not cached. A missing macro series must degrade to a column of NaNs rather
    than take the whole pipeline down.
    """
    end = end or date.today().isoformat()
    path = _history_path(symbol, start)

    # The rolling history: whatever is already on disk for this symbol, including a
    # fixed-window file written before this cache existed.
    history = pd.DataFrame(columns=["date", *OHLCV])
    if path.exists():
        history = pd.read_parquet(path)
    elif use_cache:
        adopted = _adopt_legacy_cache(symbol, start)
        if adopted is not None:
            history = adopted
            history.to_parquet(path, index=False)

    have_to = None
    if len(history) > 0:
        have_to = pd.to_datetime(history["date"]).max().normalize()

    # Only the sessions after what is already held. `end` is exclusive in yfinance, so a
    # history reaching yesterday and an `end` of today means there is nothing to ask for.
    fetch_from = start
    if have_to is not None:
        if have_to >= pd.Timestamp(end).normalize() - pd.Timedelta(days=1):
            return history.reset_index(drop=True)
        fetch_from = (have_to + pd.Timedelta(days=1)).date().isoformat()

    import yfinance as yf  # imported lazily: nothing on the request path needs it

    # A renamed listing is fetched under the symbol Yahoo serves it as, but the
    # caller — and therefore the panel — keeps the canonical ticker.
    fetch_as = download_symbol(symbol)
    if fetch_as != symbol:
        print(f"    (alias: fetching {symbol} as {fetch_as})")

    last_error: Exception | None = None
    for attempt in range(_MAX_ATTEMPTS):
        try:
            raw = yf.download(
                fetch_as,
                start=fetch_from,
                end=end,
                auto_adjust=True,  # split/dividend adjusted; returns are what we model
                progress=False,
                threads=False,  # sequential on purpose
                timeout=30,
            )
            if raw is None or raw.empty:
                raise RuntimeError("empty response")
            break
        except Exception as exc:  # noqa: BLE001 — any failure is retried then degraded
            last_error = exc
            if attempt < len(_BACKOFF_SECONDS):
                time.sleep(_BACKOFF_SECONDS[attempt])
    else:
        if len(history) > 0:
            print(
                f"    ! {symbol}: could not top up after {_MAX_ATTEMPTS} attempts "
                f"({last_error}); keeping {len(history):,} cached rows to "
                f"{str(have_to)[:10]}"
            )
            return history.reset_index(drop=True)
        print(f"    ! {symbol}: giving up after {_MAX_ATTEMPTS} attempts ({last_error})")
        return pd.DataFrame(columns=["date", *OHLCV])

    df = _flatten(raw.reset_index())
    if "date" not in df.columns:
        df = df.rename(columns={df.columns[0]: "date"})
    df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None).dt.normalize()

    missing = [c for c in OHLCV if c not in df.columns]
    for c in missing:
        df[c] = pd.NA
    df = df[["date", *OHLCV]].dropna(subset=["close"]).sort_values("date").reset_index(drop=True)

    if len(history) > 0:
        df = (
            pd.concat([history, df], ignore_index=True)
            .drop_duplicates(subset=["date"], keep="last")
            .sort_values("date")
            .reset_index(drop=True)
        )

    df.to_parquet(path, index=False)
    return df


def fetch_universe(
    tickers: tuple[str, ...] = UNIVERSE,
    start: str = START_DATE,
    end: str | None = None,
    *,
    use_cache: bool = True,
) -> pd.DataFrame:
    """Long frame: one row per (date, ticker)."""
    frames = []
    missing: list[str] = []
    for i, ticker in enumerate(tickers, start=1):
        print(f"  [{i:>2}/{len(tickers)}] {ticker}", flush=True)
        df = fetch_symbol(ticker, start, end, use_cache=use_cache)
        if df.empty:
            missing.append(ticker)
            continue
        df = df.copy()
        df["ticker"] = ticker
        frames.append(df)

    if missing:
        # Silently proceeding with 17 of 18 names is the failure mode that is
        # hardest to notice later: the panel still looks fine, the metrics still
        # compute, and the universe quietly stopped being the one that was
        # specified. Fail loudly instead, and leave the committed panel intact.
        detail = ", ".join(missing)
        if os.environ.get("COPILOT_ALLOW_PARTIAL") != "1":
            raise RuntimeError(
                f"{len(missing)} of {len(tickers)} tickers returned no data: {detail}.\n"
                "Yahoo throttles once a run has made a few dozen calls, and reports it as "
                "an empty response — waiting several minutes and re-running usually clears "
                "it (the per-symbol cache in ml/data/raw/ means the successful tickers are "
                "not re-fetched).\n"
                "The committed ml/data/processed/panel.parquet is unaffected and still "
                "complete. To build a deliberately partial panel anyway, set "
                "COPILOT_ALLOW_PARTIAL=1."
            )
        print(f"  ! COPILOT_ALLOW_PARTIAL=1 — continuing without: {detail}")

    if not frames:
        raise RuntimeError(
            "no equity data at all. Delete ml/data/raw/ and re-run, or restore "
            "data/processed/panel.parquet from git — it is committed for exactly this case."
        )
    return pd.concat(frames, ignore_index=True).sort_values(["ticker", "date"])


def fetch_macro(
    series: dict[str, str] | None = None,
    start: str = START_DATE,
    end: str | None = None,
    *,
    use_cache: bool = True,
) -> pd.DataFrame:
    """Wide frame indexed by date: one `<key>_close` column per macro series.

    A series that fails to download becomes an all-NaN column rather than a
    missing one, so the feature names stay stable across runs — a model unpickled
    against a different column set is a confusing failure.
    """
    series = series or MACRO_SERIES
    out: pd.DataFrame | None = None

    for i, (key, symbol) in enumerate(series.items(), start=1):
        print(f"  [{i:>2}/{len(series)}] {key} ({symbol})", flush=True)
        df = fetch_symbol(symbol, start, end, use_cache=use_cache)
        if df.empty:
            print(f"    ! {key}: no data — column will be NaN")
            col = pd.DataFrame(columns=["date", f"{key}_close"])
        else:
            col = df[["date", "close"]].rename(columns={"close": f"{key}_close"})
        out = col if out is None else out.merge(col, on="date", how="outer")

    assert out is not None
    out = out.sort_values("date").reset_index(drop=True)
    for key in series:
        if f"{key}_close" not in out.columns:
            out[f"{key}_close"] = pd.NA
    return out


def data_freshness(panel: pd.DataFrame) -> dict[str, object]:
    """How current the panel is — surfaced by `/health` and asserted by the
    step-2 acceptance check ('within 2 sessions of today')."""
    last = pd.to_datetime(panel["date"]).max()
    today = pd.Timestamp(datetime.now().date())
    # Calendar days, then an approximate session count: NSE trades Mon-Fri.
    calendar_gap = int((today - last).days)
    sessions = int(len(pd.bdate_range(last, today))) - 1
    return {
        "last_session": last.date().isoformat(),
        "as_of": today.date().isoformat(),
        "calendar_days_behind": calendar_gap,
        "sessions_behind": max(sessions, 0),
    }
