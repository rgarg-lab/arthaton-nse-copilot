"""Similar past sessions — the evidence layer.

This is what turns a probability into something a person can check. "68% chance
up" is a claim you either believe or don't. "The 25 most similar market states
since 2015 — here they are, with dates — went up 17 times" is evidence, and the
user can go and look at what happened on those dates.

Three properties make it honest:

**Strictly causal.** Neighbours are drawn only from sessions *strictly before*
the query date. A KNN over the whole panel would happily return next week as a
"similar past day", which would be both leakage and nonsense.

**Standardised on pre-query rows only.** The z-scoring statistics come from the
candidate pool, not from the full panel, for the same reason.

**A curated distance space, not all 58 features.** Euclidean distance over 58
mixed-scale columns is dominated by whichever block has the most columns — the
macro block — so "similar" would mean "similar global macro" and not much about
the stock. The subset below is the state a trader would actually describe: where
is it relative to its averages, how fast has it been moving, how volatile is it,
where does it rank in the basket, and what is the volatility regime. Twelve
dimensions also keeps the neighbours *explainable*: the API returns the per-
feature comparison, so the UI can say which dimensions matched.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

# The distance space. Each entry is a feature that a person would recognise as
# part of "what kind of day is this".
STATE_FEATURES: tuple[str, ...] = (
    "ret_1",
    "ret_5",
    "ret_20",
    "sma_dev_20",
    "sma_dev_50",
    "rsi_14",
    "rv_20",
    "rv_60",
    "bb_pctb_20",
    "xs_rank_ret_5",
    "xs_rank_rv_20",
    "rs_market_20",
)

# Human labels, so the UI never has to carry a feature-name dictionary.
STATE_LABELS: dict[str, str] = {
    "ret_1": "1-session return",
    "ret_5": "1-week return",
    "ret_20": "1-month return",
    "sma_dev_20": "vs 20-day average",
    "sma_dev_50": "vs 50-day average",
    "rsi_14": "RSI (14)",
    "rv_20": "20-day realised volatility",
    "rv_60": "60-day realised volatility",
    "bb_pctb_20": "Bollinger %B",
    "xs_rank_ret_5": "1-week return rank in basket",
    "xs_rank_rv_20": "volatility rank in basket",
    "rs_market_20": "1-month strength vs Nifty 50",
}


@dataclass
class NeighborIndex:
    """Built once at service startup from the committed panel.

    Deliberately *not* a committed artifact: it is derived entirely from
    `panel.parquet`, which is already committed, and a second copy of the same
    numbers on disk is a way for the two to disagree. ~50k × 12 float32 is about
    2.5 MB in memory, which costs nothing.
    """

    matrix: np.ndarray  # (n_rows, n_state_features), raw values
    dates: np.ndarray  # datetime64[ns]
    tickers: np.ndarray
    y_ret: np.ndarray
    y_dir: np.ndarray
    close: np.ndarray
    columns: tuple[str, ...]

    @classmethod
    def from_panel(cls, panel: pd.DataFrame) -> NeighborIndex:
        cols = tuple(c for c in STATE_FEATURES if c in panel.columns)
        df = panel.dropna(subset=["y_ret"]).copy()
        mat = df[list(cols)].astype("float32").to_numpy()
        return cls(
            matrix=mat,
            dates=pd.to_datetime(df["date"]).to_numpy(),
            tickers=df["ticker"].to_numpy(),
            y_ret=df["y_ret"].astype("float32").to_numpy(),
            y_dir=df["y_dir"].astype("float32").to_numpy(),
            close=df["close"].astype("float32").to_numpy(),
            columns=cols,
        )

    @property
    def size(self) -> int:
        return int(len(self.dates))

    def query(
        self,
        state: dict[str, float] | pd.Series,
        as_of: pd.Timestamp,
        *,
        k: int = 25,
        ticker: str | None = None,
        same_ticker_only: bool = False,
    ) -> dict[str, object]:
        """The k most similar prior sessions, and what happened next.

        `same_ticker_only=False` by default: pooling across the basket is the
        point. Restricting to one name's own history gives ~2,900 candidates and
        a much weaker match, and the features are scale-free precisely so that a
        state in NTPC is comparable to the same state in Infosys. The response
        reports the mix either way, so a user can see whether the evidence came
        from the name they asked about or from the basket.
        """
        as_of = pd.Timestamp(as_of)
        mask = self.dates < np.datetime64(as_of)
        if same_ticker_only and ticker is not None:
            mask &= self.tickers == ticker

        n_candidates = int(mask.sum())
        if n_candidates < k:
            return {
                "k_requested": k,
                "neighbours_found": 0,
                "candidate_pool": n_candidates,
                "error": (
                    f"only {n_candidates} prior sessions available before "
                    f"{as_of.date()}, need at least {k}"
                ),
            }

        pool = self.matrix[mask]
        # Standardise on the candidate pool only — never on the whole panel.
        mu = np.nanmean(pool, axis=0)
        sd = np.nanstd(pool, axis=0)
        sd = np.where((sd == 0) | ~np.isfinite(sd), 1.0, sd)

        q = np.array([float(state.get(c, np.nan)) for c in self.columns], dtype="float32")
        # A missing query dimension is imputed to the pool mean, i.e. "average on
        # this axis", which makes it contribute nothing to the distance rather
        # than silently dropping the whole query.
        q = np.where(np.isfinite(q), q, mu)

        zp = (np.nan_to_num(pool, nan=0.0) - mu) / sd
        zq = (q - mu) / sd
        dist = np.sqrt(np.sum((zp - zq) ** 2, axis=1))

        order = np.argsort(dist)[:k]
        idx = np.flatnonzero(mask)[order]

        rets = self.y_ret[idx].astype(float)
        dirs = self.y_dir[idx].astype(float)

        matches = [
            {
                "date": str(pd.Timestamp(self.dates[i]).date()),
                "ticker": str(self.tickers[i]),
                "distance": round(float(d), 4),
                "next_session_return": round(float(self.y_ret[i]), 6),
                "next_session_direction": "up" if self.y_dir[i] > 0 else "down",
            }
            for i, d in zip(idx, dist[order], strict=True)
        ]

        # Per-dimension comparison, so the UI can say *why* these matched.
        comparison = [
            {
                "feature": c,
                "label": STATE_LABELS.get(c, c),
                "query_value": round(float(q[j]), 6),
                "neighbour_mean": round(float(np.nanmean(self.matrix[idx, j])), 6),
                "pool_mean": round(float(mu[j]), 6),
                "z_distance": round(float(abs(zq[j] - np.nanmean(zp[order], axis=0)[j])), 4),
            }
            for j, c in enumerate(self.columns)
        ]

        up = int((dirs > 0).sum())
        return {
            "as_of": str(as_of.date()),
            "ticker": ticker,
            "same_ticker_only": same_ticker_only,
            "k_requested": k,
            "neighbours_found": len(matches),
            "candidate_pool": n_candidates,
            "empirical_up_rate": round(up / len(dirs), 6),
            "up_count": up,
            "down_count": int(len(dirs) - up),
            "mean_next_return": round(float(np.mean(rets)), 6),
            "median_next_return": round(float(np.median(rets)), 6),
            "return_spread": {
                "p10": round(float(np.quantile(rets, 0.10)), 6),
                "p90": round(float(np.quantile(rets, 0.90)), 6),
                "worst": round(float(np.min(rets)), 6),
                "best": round(float(np.max(rets)), 6),
            },
            "distinct_tickers": int(len(set(str(t) for t in self.tickers[idx]))),
            "distance_space": list(self.columns),
            "feature_comparison": comparison,
            "neighbours": matches,
            "caveat": (
                "An empirical up-rate among k historical analogues is not a probability. "
                "It is a small sample from a non-stationary process, shown as evidence "
                "alongside the calibrated model probability rather than as a substitute "
                "for it."
            ),
        }
