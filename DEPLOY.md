# Deploying, end to end

Three pieces, in this order. Roughly fifteen minutes, most of it waiting for builds.

```
  Neon (Postgres)  ←──  Vercel (Next.js)  ──→  Render (Python model service)
       free tier            free tier                free tier
```

**Why three and not one.** The model service loads a LightGBM model and a 50,000-row
parquet at startup and then answers from memory — §4.3 forbids fitting or fetching on the
request path — so it is a long-running process, not a serverless function. And PGlite is
per-process: on serverless, every invocation would get its own empty database. Neither is a
limitation that can be configured away.

**None of this is required to be judged.** The stated requirements are a public GitHub
repository and a demo video under five minutes. A hosted URL is a convenience for a judge
reviewing on a phone.

---

## 1. Neon — the database (~3 min)

1. [neon.tech](https://neon.tech) → sign in with GitHub → **Create project**.
2. Region: pick the one nearest you (Singapore for India).
3. Copy the **pooled** connection string. It looks like:

   ```
   postgresql://USER:PASSWORD@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

**Take the pooled one** — the host contains `-pooler`. `src/db/index.ts` routes a
`*.neon.tech` URL to Neon's serverless driver, and the unpooled endpoint exhausts
connections under even light serverless traffic.

Then, from this repo:

```bash
DATABASE_URL="<the pooled string>" npm run db:migrate
```

That creates all ten tables. It is safe to re-run.

---

## 2. Render — the model service (~7 min)

1. [render.com](https://render.com) → sign in with GitHub → **New** → **Web Service**.
2. Connect `rgarg-lab/arthaton-nse-copilot`. *(Render can read a private repo once you
   authorise it — the repository does not need to be public for this.)*
3. Settings:

   | | |
   |---|---|
   | Runtime | **Docker** |
   | Dockerfile path | `ml/Dockerfile` |
   | Docker build context | `.` — the repo root, **not** `ml/` |
   | Instance type | Free is enough (512 MB); upgrade if it OOMs on boot |
   | Health check path | `/health` |

   The build context must be the repo root because the Dockerfile copies `ml/artifacts/`
   and `ml/data/processed/` by repo-relative path.

4. Environment variable — **do not skip this one**:

   ```
   COPILOT_CORS_ORIGINS = https://<your-app>.vercel.app
   ```

   You will not have the Vercel URL yet. Deploy with a placeholder, finish step 3, then
   come back and set it properly. Without it the service defaults to `localhost:3000` and
   **the browser blocks every call from your deployed site with nothing in either log to
   explain it** — the single most confusing failure in this stack.

5. Wait for the first deploy. **It takes a few minutes and the first boot is slow** —
   the service loads the panel before answering, which is why the healthcheck allows a
   90-second start period.

Verify:

```bash
curl https://<your-service>.onrender.com/health
```

Expect `"status":"ok"` and `"trains_on_request":false`, with all seven artifacts `true`.

> **Free-tier caveat worth knowing before a judge clicks your link:** Render's free
> instances sleep after ~15 minutes idle, and this one takes ~40 seconds to reload the
> panel on wake. A judge opening a cold link sees the app's "service not answering" state.
> Either keep it warm (hit `/health` every 10 minutes) or use a paid instance for the
> days around judging.

---

## 3. Vercel — the Next.js app (~5 min)

Already authenticated as `rgarg161206-9755`.

```bash
vercel link          # once, to create the project
vercel env add DATABASE_URL production      # the pooled Neon string
vercel env add ML_ENDPOINT production       # https://<your-service>.onrender.com
vercel env add GEMINI_API_KEY production    # your key
vercel env add LLM_MODE production          # live
vercel env add LLM_FALLBACKS production     # press enter — EMPTY on purpose, see below
vercel env add CRON_SECRET production       # any long random string
vercel --prod
```

**`LLM_FALLBACKS` must exist and be empty.** `fallbackModels()` in `src/lib/llm/router.ts`
is the one env reader that distinguishes *absent* from *present-and-empty*: absent restores
a default chain ending in Anthropic and Groq models whose keys are not set, and every live
turn would then attempt two unreachable providers before falling through to the mock.

`CRON_SECRET` is not optional on a public deployment — without it anyone can trigger
`/api/cron` and push queued deliveries.

Then go back to Render and set `COPILOT_CORS_ORIGINS` to the real Vercel URL.

---

## 4. Check it properly

```bash
curl -s https://<your-app>.vercel.app/api/health        # 200
curl -s https://<service>.onrender.com/health | jq .status
```

In a browser, on the deployed URL:

| | expect |
|---|---|
| `/signals` | 17 cards with figures — **not** "the model service is not answering" |
| `/dashboard` | the confidence ladder with both 63.06% and 55.50% |
| `/preflight` | **ready**, with `holdout read once` → ok |
| the chat | answers and calls tools |

**If every model page shows an error but `/health` is fine, it is CORS.** Check
`COPILOT_CORS_ORIGINS` on Render matches the Vercel origin exactly — scheme included, no
trailing slash.

---

## 5. What does not work in production, and is honest about it

- **The daily catch-up does not run.** It is a Windows scheduled task on one machine
  (`scripts/schedule-catchup.ps1`). The deployed panel is whatever was committed. The
  board states its own staleness on every page, so this degrades visibly rather than
  silently.
- **`.pglite` is unused in production** and `DATABASE_URL` takes over; a missing or
  unpooled URL is the first thing to check if the workspace errors.
- **The model is frozen.** Nothing in the deployed stack retrains — the request path does
  no fitting, and the scheduled job that *could* touch data runs `catchup`, which never
  calls `train` or `eval`.
