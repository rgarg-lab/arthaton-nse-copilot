"""FastAPI service — the only way the Next.js app reaches the model.

Deliberate properties, each one a fix for something the earlier project got
wrong:

**Artifacts are loaded once at startup. Nothing trains on request** (§4.3). The
model, calibrator, panel and metrics are read in the lifespan hook; a request
does arithmetic and a lookup, nothing more.

**CORS and host come from the environment.** The old service hardcoded
`localhost:5173`, which meant it could only ever talk to one frontend on one
machine.

**The cache is keyed on the actual request parameters.** The old `/api/history`
cached its first response and then ignored its own `days` argument forever, so
every subsequent request silently returned the first one's data. Here the key is
built from every parameter that changes the answer, and `/health` reports the
cache size so the behaviour is observable.

**No LLM dependency** (§4.1). Explanations are generated in Next.js, grounded by
these endpoints. There is no `explain` route and no Gemini call in Python.

Endpoints: `GET /health` · `GET /signals` · `GET /signals/{ticker}` ·
`GET /metrics` · `POST /neighbors`
"""

from __future__ import annotations

import json
import time
from contextlib import asynccontextmanager
from typing import Any

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import __version__
from .config import (
    CALIBRATOR_PATH,
    DISCLAIMER,
    IMPORTANCE_PATH,
    MAGNITUDE_METRICS_PATH,
    MAGNITUDE_MODEL_PATH,
    METRICS_PATH,
    MODEL_PATH,
    PANEL_PATH,
    SIGNALS_PATH,
    TICKER_NAMES,
    UNIVERSE,
    cors_origins,
)
from .ingest import data_freshness
from .neighbors import STATE_FEATURES, NeighborIndex
from .signals import build_signals


class State:
    """Everything loaded at startup. A plain object rather than module globals so
    that the test client can build one without a running server."""

    def __init__(self) -> None:
        self.panel: pd.DataFrame | None = None
        self.bundle: Any = None
        self.calibrator: Any = None
        self.metrics: dict[str, Any] | None = None
        self.signals: dict[str, Any] | None = None
        self.neighbors: NeighborIndex | None = None
        # The magnitude head is optional on purpose: it was added after the direction model
        # was frozen, so a checkout without its artifacts must still serve every other
        # endpoint rather than failing to boot.
        self.magnitude: Any = None
        self.magnitude_metrics: dict[str, Any] | None = None
        self.loaded_at: str | None = None
        self.load_errors: list[str] = []
        self.cache: dict[str, Any] = {}
        self.cache_hits = 0
        self.cache_misses = 0

    @property
    def ready(self) -> bool:
        return self.bundle is not None and self.panel is not None

    def load(self) -> None:
        self.load_errors = []

        if PANEL_PATH.exists():
            self.panel = pd.read_parquet(PANEL_PATH)
            self.neighbors = NeighborIndex.from_panel(self.panel)
        else:
            self.load_errors.append(f"missing {PANEL_PATH.name} — run `make -C ml data`")

        if MODEL_PATH.exists() and CALIBRATOR_PATH.exists():
            self.bundle = joblib.load(MODEL_PATH)
            self.calibrator = joblib.load(CALIBRATOR_PATH)
        else:
            self.load_errors.append("missing model.pkl / calibrator.pkl — run `make -C ml train`")

        if METRICS_PATH.exists():
            self.metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
            # Feature importance is produced by `train.py` into its own artifact rather
            # than by `evaluate.py`, because it is a property of the fitted model and not
            # of the holdout. It is merged into the metrics document here so the app has
            # one endpoint for "what the model is", instead of a second fetch for one
            # array. Real gain off the booster — see train.py.
            if IMPORTANCE_PATH.exists():
                importance = json.loads(IMPORTANCE_PATH.read_text(encoding="utf-8"))
                self.metrics["feature_importance"] = importance.get("features", [])
        else:
            self.load_errors.append(f"missing {METRICS_PATH.name} — run `make -C ml eval`")

        if MAGNITUDE_MODEL_PATH.exists() and MAGNITUDE_METRICS_PATH.exists():
            self.magnitude = joblib.load(MAGNITUDE_MODEL_PATH)
            self.magnitude_metrics = json.loads(
                MAGNITUDE_METRICS_PATH.read_text(encoding="utf-8")
            )
        # No `load_errors` entry when it is absent, deliberately: `/health` drives
        # `npm run preflight`, and a service whose every other endpoint works is not
        # unhealthy. `/magnitude` reports its own absence with a 503 instead.

        # latest_signals.json is committed, but recomputing it from the frozen
        # model at startup is cheap (18 rows) and means a panel refresh does not
        # need a separate `make signals` to be reflected. Falls back to the
        # committed file if the model is absent.
        if self.ready:
            self.signals = build_signals(self.panel, self.bundle, self.calibrator)
        elif SIGNALS_PATH.exists():
            self.signals = json.loads(SIGNALS_PATH.read_text(encoding="utf-8"))

        self.cache.clear()
        self.loaded_at = pd.Timestamp.now().isoformat(timespec="seconds")

    def cached(self, key: str, produce):
        """Parameter-keyed memoisation. The key must contain every parameter that
        changes the answer — see the module docstring for why."""
        if key in self.cache:
            self.cache_hits += 1
            return self.cache[key]
        self.cache_misses += 1
        value = produce()
        self.cache[key] = value
        return value


state = State()


@asynccontextmanager
async def lifespan(app: FastAPI):
    state.load()
    if state.load_errors:
        for e in state.load_errors:
            print(f"  ! {e}")
    else:
        print(f"  artifacts loaded; panel {len(state.panel):,} rows")
    yield


app = FastAPI(
    title="NSE Copilot ML service",
    version=__version__,
    description=(
        "Calibrated next-session direction for a fixed basket of 18 NSE large-caps, "
        "with explicit abstention and historical-analogue evidence. "
        "Historical and paper-trading analysis only — not investment advice."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ─── health ───────────────────────────────────────────────────────────────────


@app.get("/health")
def health() -> dict[str, Any]:
    """Green when every artifact needed to answer a request is loaded.

    Reports what is loaded and what is missing rather than a bare boolean: a red
    health check that does not say which artifact is absent is a check you end up
    debugging by reading the source.
    """
    payload: dict[str, Any] = {
        "status": "ok" if state.ready and not state.load_errors else "degraded",
        "version": __version__,
        "loaded_at": state.loaded_at,
        "trains_on_request": False,
        "artifacts": {
            "panel": PANEL_PATH.exists(),
            "model": MODEL_PATH.exists(),
            "calibrator": CALIBRATOR_PATH.exists(),
            "metrics": METRICS_PATH.exists(),
            "latest_signals": SIGNALS_PATH.exists(),
        },
        "errors": state.load_errors,
        "cache": {
            "entries": len(state.cache),
            "hits": state.cache_hits,
            "misses": state.cache_misses,
        },
        "disclaimer": DISCLAIMER,
    }
    if state.panel is not None:
        payload["data"] = data_freshness(state.panel)
        payload["panel_rows"] = int(len(state.panel))
    if state.bundle is not None:
        payload["model"] = {
            "trained_at": state.bundle.trained_at,
            "train_end": state.bundle.train_end,
            "threshold": float(state.bundle.threshold),
            "features": len(state.bundle.feature_names),
        }
    if state.neighbors is not None:
        payload["neighbor_index_rows"] = state.neighbors.size
    return payload


# ─── signals ──────────────────────────────────────────────────────────────────


@app.get("/signals")
def signals(
    ticker: str | None = Query(
        default=None, description="Restrict to one ticker, e.g. RELIANCE.NS"
    ),
    include_abstained: bool = Query(
        default=True,
        description="Include names the model is declining to call. Default true: the "
        "abstentions are the product, not noise to be filtered.",
    ),
) -> dict[str, Any]:
    if state.signals is None:
        raise HTTPException(
            status_code=503,
            detail={"error": "signals unavailable", "missing": state.load_errors},
        )

    key = f"signals|ticker={ticker}|abstained={include_abstained}"

    def produce() -> dict[str, Any]:
        payload = dict(state.signals)  # type: ignore[arg-type]
        rows = list(payload["signals"])
        if ticker:
            rows = [s for s in rows if s["ticker"].upper() == ticker.upper()]
        if not include_abstained:
            rows = [s for s in rows if not s["abstain"]]
        payload["signals"] = rows
        payload["returned"] = len(rows)
        payload["filters"] = {"ticker": ticker, "include_abstained": include_abstained}
        return payload

    return state.cached(key, produce)


@app.get("/signals/{ticker}")
def signal_for_ticker(ticker: str) -> dict[str, Any]:
    if state.signals is None:
        raise HTTPException(status_code=503, detail={"error": "signals unavailable"})

    key = f"signal|{ticker.upper()}"

    def produce() -> dict[str, Any]:
        match = [
            s
            for s in state.signals["signals"]  # type: ignore[index]
            if s["ticker"].upper() == ticker.upper()
        ]
        if not match:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": f"{ticker} is not in the universe",
                    "universe": list(UNIVERSE),
                },
            )
        return {
            "signal": match[0],
            "model": state.signals["model"],  # type: ignore[index]
            "data": state.signals["data"],  # type: ignore[index]
            "disclaimer": DISCLAIMER,
        }

    return state.cached(key, produce)


# ─── metrics ──────────────────────────────────────────────────────────────────


@app.get("/metrics")
def metrics(
    section: str | None = Query(
        default=None,
        description="One top-level section of metrics.json "
        "(direction, regression, calibration, baselines, breakdowns, abstention, "
        "paper_trading, known_limitations, provenance, evaluation_design).",
    ),
) -> dict[str, Any]:
    """The measured track record.

    This is what lets the chat surface state its own failure rate instead of
    describing itself in adjectives. Every number here was produced by
    `evaluate.py`; none was written by hand.
    """
    if state.metrics is None:
        raise HTTPException(
            status_code=503,
            detail={"error": "metrics unavailable", "missing": state.load_errors},
        )
    if section is None:
        return state.metrics
    if section not in state.metrics:
        raise HTTPException(
            status_code=404,
            detail={
                "error": f"no section {section!r}",
                "available": sorted(k for k in state.metrics if not k.startswith("generated")),
            },
        )
    return {"section": section, "data": state.metrics[section], "disclaimer": DISCLAIMER}


# ─── neighbours ───────────────────────────────────────────────────────────────


class NeighborRequest(BaseModel):
    ticker: str = Field(description="A ticker in the universe, e.g. RELIANCE.NS")
    as_of: str | None = Field(
        default=None,
        description="ISO date. Neighbours are drawn strictly before this date. "
        "Defaults to the panel's latest session.",
    )
    k: int = Field(default=25, ge=3, le=200, description="How many analogues to return")
    same_ticker_only: bool = Field(
        default=False,
        description="Restrict analogues to this ticker's own history. Default false: "
        "the features are scale-free so pooling across the basket is valid and gives a "
        "much larger candidate pool.",
    )


@app.post("/neighbors")
def neighbors(req: NeighborRequest) -> dict[str, Any]:
    """The k most similar prior market states, and what happened next.

    Turns the prediction into evidence a user can check: real dates, real
    subsequent returns, and the empirical up-rate among them.
    """
    if state.neighbors is None or state.panel is None:
        raise HTTPException(
            status_code=503,
            detail={"error": "neighbour index unavailable", "missing": state.load_errors},
        )

    ticker = req.ticker.upper()
    if ticker not in UNIVERSE:
        raise HTTPException(
            status_code=404,
            detail={"error": f"{req.ticker} is not in the universe", "universe": list(UNIVERSE)},
        )

    rows = state.panel[state.panel["ticker"] == ticker]
    if rows.empty:
        raise HTTPException(status_code=404, detail={"error": f"no panel rows for {ticker}"})

    if req.as_of:
        try:
            as_of = pd.Timestamp(req.as_of)
        except ValueError:
            raise HTTPException(
                status_code=422, detail={"error": f"{req.as_of!r} is not an ISO date"}
            ) from None
        at_or_before = rows[pd.to_datetime(rows["date"]) <= as_of]
        if at_or_before.empty:
            raise HTTPException(
                status_code=422,
                detail={"error": f"no session for {ticker} at or before {req.as_of}"},
            )
        query_row = at_or_before.sort_values("date").iloc[-1]
    else:
        query_row = rows.sort_values("date").iloc[-1]
        as_of = pd.Timestamp(query_row["date"])

    key = f"neighbors|{ticker}|{as_of.date()}|k={req.k}|own={req.same_ticker_only}"

    def produce() -> dict[str, Any]:
        state_vector = {c: float(query_row[c]) for c in STATE_FEATURES if c in query_row}
        result = state.neighbors.query(  # type: ignore[union-attr]
            state_vector,
            as_of=as_of,
            k=req.k,
            ticker=ticker,
            same_ticker_only=req.same_ticker_only,
        )
        return {
            "query": {
                "ticker": ticker,
                "name": TICKER_NAMES.get(ticker, ticker),
                "state_session": str(pd.Timestamp(query_row["date"]).date()),
                "as_of": str(as_of.date()),
            },
            **result,
            "disclaimer": DISCLAIMER,
        }

    return state.cached(key, produce)


# ─── dev entry point ──────────────────────────────────────────────────────────

if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    from .config import api_host, api_port

    t0 = time.time()
    uvicorn.run(app, host=api_host(), port=api_port())
    print(f"served for {time.time() - t0:.0f}s")


@app.get("/magnitude")
def magnitude(
    ticker: str | None = Query(
        default=None, description="One ticker from the universe; omit for the whole basket."
    ),
) -> dict[str, Any]:
    """Will tomorrow be a big move? — the magnitude head.

    A second, independent prediction beside the direction call, and on this horizon a far
    better-behaved one. Direction is close to a martingale (51.37% on the holdout, and 29
    configurations in `ml/experiments/RESULTS.md` failed to beat it); volatility clusters,
    so this head reaches a median of 60.2% on the sessions it calls while covering roughly
    45% of them.

    It is also the question the product's named user actually asks: whether today is a day
    to act or wait is about magnitude, not sign.

    Every figure in the response comes from `magnitude_metrics.json`, written by
    `magnitude.py`, which is the only producer of them.
    """
    if state.magnitude is None or state.magnitude_metrics is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "the magnitude head is not loaded",
                "hint": "run `python ml/tasks.py magnitude` to train and freeze it",
            },
        )
    if state.panel is None:
        raise HTTPException(status_code=503, detail={"error": "panel unavailable"})

    from .magnitude import add_magnitude_label

    panel = add_magnitude_label(state.panel)
    if ticker is not None:
        ticker = ticker.upper()
        if ticker not in set(UNIVERSE):
            raise HTTPException(
                status_code=404,
                detail={"error": f"{ticker} is not in the universe", "universe": list(UNIVERSE)},
            )
        panel = panel[panel["ticker"] == ticker]

    # The most recent row per ticker: the state the prediction is made from.
    latest = panel.sort_values("date").groupby("ticker", as_index=False).tail(1)
    if len(latest) == 0:
        raise HTTPException(status_code=503, detail={"error": "no scoreable rows in the panel"})

    probabilities = state.magnitude.probability_big(latest)
    threshold = float(state.magnitude.threshold)
    summary = state.magnitude_metrics["summary"]

    rows = []
    for (_, row), p in zip(latest.iterrows(), probabilities, strict=True):
        p = float(p)
        # Conviction is distance from a coin flip, symmetric: the head is as willing to say
        # "quieter than usual" as "bigger than usual", and a one-sided gate would make it a
        # volatility-only bias dressed as caution.
        calls = p >= threshold or p <= 1 - threshold
        rows.append(
            {
                "ticker": str(row["ticker"]),
                "as_of_session": str(row["date"])[:10],
                "probability_big_move": round(p, 6),
                "expectation": ("bigger than usual" if p > 0.5 else "quieter than usual")
                if calls
                else None,
                "abstain": not calls,
                "threshold": threshold,
                "typical_move_abs": round(float(row["typical_move"]), 6),
            }
        )

    return {
        "generated_by": "ml/src/copilot/magnitude.py",
        "target": state.magnitude_metrics["target"],
        "threshold": threshold,
        "measured": {
            "accuracy_when_calling_median": summary["accuracy_when_calling_median"],
            "accuracy_when_calling_min": summary["accuracy_when_calling_min"],
            "accuracy_when_calling_max": summary["accuracy_when_calling_max"],
            "windows_at_or_above_60pct": summary["windows_at_or_above_60pct"],
            "windows_total": summary["windows_total"],
            "coverage_min": summary["coverage_min"],
            "coverage_max": summary["coverage_max"],
            "full_coverage_accuracy_median": summary["full_coverage_accuracy_median"],
            "base_rate": state.magnitude_metrics["base_rate"],
        },
        "holdout_note": state.magnitude_metrics["holdout_note"],
        "signals": rows,
        "disclaimer": DISCLAIMER,
    }
