# Concurrency tests

Two complementary tests. Neither replaces the other.

| | `../load-test.mjs` | `stampede.mjs` |
| --- | --- | --- |
| Talks to | the real Supabase over HTTPS | a local mock that enforces the same rules |
| Drives | the RPC directly | the real app in N real browsers |
| Proves | the backend path under load | the client path: React state, double-submit guard, what voters are told |
| Needs | network access to Supabase | Playwright + Chromium |

Run both before the event if you can. `load-test.mjs` is the one that exercises
production infrastructure; `stampede.mjs` is the one that exercises what a
person actually does with their thumb.

## Running the stampede test

```bash
npm install -D playwright && npx playwright install chromium

node scripts/concurrency/mock-supabase.mjs &

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=local \
NEXT_PUBLIC_ADMIN_HOST=admin.localhost:3000 \
  npm run build && npx next start -p 3000 &

N=100 MODE=single node scripts/concurrency/stampede.mjs
N=100 MODE=double node scripts/concurrency/stampede.mjs
N=100 MODE=closed node scripts/concurrency/stampede.mjs
```

Set `CHROMIUM_PATH` if Playwright's bundled browser isn't on the default path.

Each mode exits non-zero on failure, so it can gate a release.

## What each mode should produce

- **single** — N submitted, N votes stored, N distinct voters, no page errors.
- **double** — still N votes, not 2N. The second tap should never reach the
  server at all; the client guard absorbs it.
- **closed** — zero votes stored, and every voter told voting is not open. No
  blank screens, no silent failures.
