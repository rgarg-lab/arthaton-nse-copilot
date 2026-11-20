# Captures live in `../public/captures/`

The brief's layout puts screen recordings in `video/captures/`. Remotion serves assets
through `staticFile()`, which resolves against `public/`, so the recordings are in
**`video/public/captures/`** instead — otherwise `<OffthreadVideo>` cannot load them.

| | |
|---|---|
| The recordings | [`../public/captures/`](../public/captures/) — seven `.mp4`, plus the `.webm` originals |
| What each one shows | [`../src/captures.manifest.ts`](../src/captures.manifest.ts) |
| How they were made | [`../scripts/capture.mjs`](../scripts/capture.mjs) |
| Re-encode settings | [`../scripts/normalise-captures.mjs`](../scripts/normalise-captures.mjs) |

Every one is a genuine Playwright recording of the running application. See
`CREDITS.md` and `BUILD_LOG.md` D5.1–D5.6.

To re-record (needs the stack up — `npm start` and `python ml/tasks.py serve`):

```bash
cd video && npm run capture
```
