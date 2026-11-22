"""`make data` — ingest, build features, attach labels, write the panel.

Writes `data/processed/panel.parquet`, which is **committed**. §6.1 is explicit
about why: a fresh clone has to run without yfinance cooperating, and an upstream
outage on judging day cannot be the thing that makes the project unrunnable. The
raw per-symbol cache under `data/raw/` stays gitignored, and this target
regenerates everything from scratch.
"""

from __future__ import annotations

import json
import sys

import pandas as pd

from .config import MACRO_SERIES, MAX_FEATURES, PANEL_PATH, PROCESSED_DIR, UNIVERSE
from .features import build_features, feature_columns
from .ingest import data_freshness, fetch_macro, fetch_universe
from .labels import add_labels, label_summary
from .sentiment import daily_sentiment

PANEL_META_PATH = PROCESSED_DIR / "panel_meta.json"


def build_panel(*, use_cache: bool = True) -> pd.DataFrame:
    print(f"[1/4] prices — {len(UNIVERSE)} tickers", flush=True)
    prices = fetch_universe(use_cache=use_cache)

    print(f"[2/4] macro — {len(MACRO_SERIES)} series", flush=True)
    macro = fetch_macro(use_cache=use_cache)

    print("[3/4] sentiment — FinBERT-scored corpus", flush=True)
    sent = daily_sentiment()
    if sent.empty:
        print("      no scored news; sentiment features will be zero with news_available=0")
    else:
        print(f"      {len(sent)} scored days for {sent['ticker'].nunique()} ticker(s)")

    print("[4/4] features + labels", flush=True)
    panel = build_features(prices, macro, sent)
    panel = add_labels(panel)
    return panel


def main() -> int:
    panel = build_panel(use_cache=True)

    cols = feature_columns(panel)
    fresh = data_freshness(panel)
    summary = label_summary(panel)

    meta = {
        "rows": int(len(panel)),
        "tickers": int(panel["ticker"].nunique()),
        "feature_count": len(cols),
        "feature_columns": cols,
        "date_range": [
            pd.to_datetime(panel["date"]).min().date().isoformat(),
            pd.to_datetime(panel["date"]).max().date().isoformat(),
        ],
        "freshness": fresh,
        "labels": summary,
        "nan_fraction_overall": round(
            float(panel[cols].isna().to_numpy().mean()),
            6,
        ),
    }

    panel.to_parquet(PANEL_PATH, index=False)
    PANEL_META_PATH.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")

    print("\n─── panel ───")
    print(f"  path           : {PANEL_PATH}")
    print(f"  rows           : {meta['rows']:,}")
    print(f"  tickers        : {meta['tickers']}")
    print(f"  features       : {meta['feature_count']} (ceiling {MAX_FEATURES})")
    print(f"  date range     : {meta['date_range'][0]} -> {meta['date_range'][1]}")
    print(
        f"  last session   : {fresh['last_session']} "
        f"({fresh['sessions_behind']} sessions behind)"
    )
    print(f"  labelled rows  : {summary['labelled_rows']:,}")
    print(f"  up-rate        : {summary['up_rate']}")
    print(f"  NaN fraction   : {meta['nan_fraction_overall']:.4f}")

    # Acceptance gate for step 2, enforced here rather than left to a human to
    # eyeball — the whole point of the step is that it is checkable.
    problems = []
    if meta["tickers"] != len(UNIVERSE):
        got = set(panel["ticker"].unique())
        problems.append(
            f"panel covers {meta['tickers']} tickers, the specified universe has "
            f"{len(UNIVERSE)}; missing: {', '.join(sorted(set(UNIVERSE) - got))}"
        )
    if meta["rows"] < 35_000:
        problems.append(f"panel has {meta['rows']} rows, need >= 35,000")
    if meta["feature_count"] > MAX_FEATURES:
        problems.append(f"{meta['feature_count']} features exceeds the ceiling of {MAX_FEATURES}")
    if fresh["sessions_behind"] > 2:
        problems.append(
            f"data is {fresh['sessions_behind']} sessions behind "
            f"(last {fresh['last_session']}); need <= 2"
        )

    if problems:
        print("\n✗ step-2 acceptance FAILED")
        for p in problems:
            print(f"  - {p}")
        return 1

    print("\n✓ step-2 acceptance: rows, feature ceiling and freshness all pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
