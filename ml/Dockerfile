# The model service, for a container host (Render, Railway, Fly).
#
# ## Why this is a container and not a serverless function
#
# The service loads a LightGBM model, an isotonic calibrator and a ~50k-row parquet panel
# at startup and then answers from memory — §4.3 requires that the request path does no
# fitting and no fetching. That is the opposite shape to a function that cold-starts per
# request, which would pay the whole load on every call and still not guarantee the panel
# was read once. One long-running process is the correct deployment.
#
# ## Nothing is downloaded at build or boot
#
# `ml/artifacts/` and `ml/data/processed/panel.parquet` are committed, so the image is
# self-contained and a deploy cannot be broken by Yahoo rate-limiting — which, during this
# project, it reliably would have been.

FROM python:3.12-slim

# Pinned to the minor version the model was pickled under. Unpickling a LightGBM booster
# across a Python minor version is not reliable, which is why ml/pyproject.toml pins
# `requires-python = "==3.12.*"` and why this base image must not drift.

WORKDIR /app

# libgomp1 is LightGBM's OpenMP runtime. Without it `import lightgbm` fails at startup
# with a bare "libgomp.so.1: cannot open shared object file", which is an unhelpful way to
# discover a missing system package in a deploy log.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first, so a change to the source or the artifacts does not reinstall
# LightGBM and pandas on every deploy.
COPY ml/pyproject.toml ./ml/pyproject.toml
COPY ml/src/copilot/__init__.py ./ml/src/copilot/__init__.py
RUN pip install --no-cache-dir -e ./ml

# Then the code, the committed artifacts and the committed panel.
COPY ml/src/ ./ml/src/
COPY ml/artifacts/ ./ml/artifacts/
COPY ml/data/processed/ ./ml/data/processed/

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/ml/src

# The host supplies $PORT (Render and Railway both do); 8000 is the local default.
ENV PORT=8000

# `COPILOT_CORS_ORIGINS` has no safe default for a deployment — it falls back to
# localhost:3000, and the browser then blocks every call from the deployed frontend with
# nothing in the server log to explain it. Set it to the Vercel URL on the host.
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD python -c "import urllib.request,os,sys; \
    sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",8000)}/health', timeout=8).status == 200 else 1)"

# Shell form so $PORT expands. One worker on purpose: each would hold its own copy of the
# model and the panel, and the service is read-only and fast once warm.
CMD python -m uvicorn copilot.api:app --app-dir ml/src --host 0.0.0.0 --port $PORT
