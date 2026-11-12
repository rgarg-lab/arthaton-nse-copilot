"""FinBERT news sentiment — ported from my earlier Reliance predictor.

Two mechanisms are carried over because they were the genuinely good ideas in
that project (`Stock_Predictor/finbert_news.py`, `add_new_rows_decay2.py`):

**The decay for no-news days.** Most sessions have no scored news. Filling those
with 0 says "today the news was neutral", which is a different and false claim
from "today there was no news". Carrying the last score forward at 0.9× per
session says "the last thing we knew is getting stale", which is what we
actually believe.

**The shift that avoids same-day look-ahead.** A score derived from news
published on session *t* is not reliably known before session *t* closes, and the
label is the *t → t+1* return. So the sentiment attached to row *t* is the score
from *t-1*. Without that shift the feature is partly a same-day price echo and
the model's accuracy goes up for a reason that would not survive live trading.

One thing is *not* carried over: this module no longer runs the decay over
"whatever rows happen to be in the CSV". It emits a per-day score and leaves the
decay to `features.py`, which applies it along the panel's own trading calendar —
so a weekend or an exchange holiday decays by one step, not three.

### Honest description of the corpus

`data/news/reliance_news_scored.csv` is ~520 analyst-style impact statements
about Reliance Industries, FinBERT-scored, covering **2024-12-10 → 2026-07-07**.
It is **Reliance-only** and it does **not** reach today. Consequences, all of
which are stated in the README rather than hidden:

- `news_available = 1` on roughly 1% of the panel's rows. For every other ticker
  and every earlier date it is 0, and `sent_score`/`sent_decay` are 0.
- The statements are not raw wire headlines; they are impact summaries written
  for the earlier project. FinBERT's scoring of them is real; their provenance is
  not a news API.
- Universe-wide sentiment is a stretch goal (§6.1), not a claim this build makes.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from .config import NEWS_DIR, SENTIMENT_DAILY_PATH

# label -> sign. FinBERT emits positive / negative / neutral with a confidence,
# and the signed confidence is the score. Identical to the ported version.
_SIGN = {"positive": 1.0, "negative": -1.0, "neutral": 0.0}

DECAY = 0.9

# Which ticker the committed corpus describes.
CORPUS_TICKER = "RELIANCE.NS"


def signed_score(label: object, score: object) -> float:
    try:
        return _SIGN.get(str(label).strip().lower(), 0.0) * float(score)
    except (TypeError, ValueError):
        return 0.0


def score_headlines(texts: list[str]) -> pd.DataFrame:
    """Run FinBERT over raw headlines. Only needed when extending the corpus;
    `make data` does not call this, because the corpus is committed already
    scored. Requires the `sentiment` extra (`pip install -e ".[sentiment]"`).
    """
    try:
        from transformers import pipeline
    except ImportError as exc:  # pragma: no cover — depends on an optional extra
        raise ImportError(
            "FinBERT needs the optional extra: pip install -e 'ml[sentiment]' "
            "(installs transformers + torch, ~2.5GB)"
        ) from exc

    classifier = pipeline(
        "text-classification",
        model="ProsusAI/finbert",
        tokenizer="ProsusAI/finbert",
    )
    rows = []
    for text in texts:
        result = classifier(str(text), truncation=True, max_length=512)[0]
        rows.append(
            {
                "headline": text,
                "sentiment_label": result["label"],
                "sentiment_score": round(float(result["score"]), 6),
            }
        )
    return pd.DataFrame(rows)


def load_corpus(news_dir: Path = NEWS_DIR) -> pd.DataFrame:
    """Every `*_news_scored.csv` in the news directory, concatenated.

    Filename convention: `<slug>_news_scored.csv` where `<slug>` maps to a
    ticker. Only Reliance exists today; dropping another file in is how the
    stretch goal would extend it, with no code change.
    """
    frames = []
    for path in sorted(news_dir.glob("*_news_scored.csv")):
        df = pd.read_csv(path)
        df.columns = [c.strip().lower() for c in df.columns]
        if "date" not in df.columns:
            print(f"  ! {path.name}: no Date column — skipped", file=sys.stderr)
            continue
        slug = path.name.replace("_news_scored.csv", "")
        df["ticker"] = CORPUS_TICKER if slug == "reliance" else f"{slug.upper()}.NS"
        frames.append(df)

    if not frames:
        return pd.DataFrame(columns=["date", "ticker", "sentiment_label", "sentiment_score"])
    return pd.concat(frames, ignore_index=True)


def daily_sentiment(news_dir: Path = NEWS_DIR) -> pd.DataFrame:
    """One row per (date, ticker) that has scored news.

    Columns: `date`, `ticker`, `sent_raw` (mean signed FinBERT score for the day),
    `news_count`. No decay and no shift — those are the panel's job, because they
    depend on the trading calendar.
    """
    corpus = load_corpus(news_dir)
    if corpus.empty:
        return pd.DataFrame(columns=["date", "ticker", "sent_raw", "news_count"])

    corpus = corpus.copy()
    corpus["date"] = pd.to_datetime(corpus["date"], errors="coerce").dt.normalize()
    corpus = corpus.dropna(subset=["date"])
    corpus["sent_value"] = [
        signed_score(lab, sc)
        for lab, sc in zip(corpus["sentiment_label"], corpus["sentiment_score"], strict=False)
    ]

    daily = (
        corpus.groupby(["date", "ticker"], as_index=False)
        .agg(sent_raw=("sent_value", "mean"), news_count=("sent_value", "size"))
        .sort_values(["ticker", "date"])
        .reset_index(drop=True)
    )
    return daily


def main() -> int:
    daily = daily_sentiment()
    daily.to_csv(SENTIMENT_DAILY_PATH, index=False)
    if daily.empty:
        print("no scored news found — sentiment features will be all-zero with news_available=0")
        return 0
    print(f"wrote {SENTIMENT_DAILY_PATH.relative_to(SENTIMENT_DAILY_PATH.parents[3])}")
    print(f"  rows        : {len(daily)}")
    print(f"  tickers     : {', '.join(sorted(daily['ticker'].unique()))}")
    print(f"  date range  : {daily['date'].min().date()} -> {daily['date'].max().date()}")
    print(f"  mean score  : {daily['sent_raw'].mean():+.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
