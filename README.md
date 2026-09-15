# Literary Club — Live Voting

Audience rates one performer at a time from their phone; an admin drives the
event from a separate subdomain and sees live rankings.

- `yourdomain.com` — public audience app, no login
- `admin.yourdomain.com` — admin app, email/password login

Next.js 14 (App Router) + Supabase (Postgres, Auth, Realtime), deployed on Vercel.

## How it holds together

The database is the authority. Every rule that matters — one vote per voter per
participant, votes only for the currently active participant, votes only while
voting is open — is enforced inside Postgres, not in the browser or in a server
action. The audience client talks to Supabase directly, so anything enforced only
in JavaScript would be enforceable by nobody.

- **Voting** goes through one function, `cast_vote`, which re-reads event and
  participant state under a row lock before inserting. A stale client that
  submits for a participant the admin has already moved past is rejected by the
  database, not trusted.
- **Duplicate votes** are backstopped by a unique index on
  `(event_id, participant_id, voter_id)`. Concurrency cannot get around it: 40
  simultaneous submissions from one voter produce exactly one row.
- **Realtime is a sync signal, not a source of truth.** Both apps re-fetch state
  on every (re)connect, because nothing that changed while disconnected is
  replayed. A dropped connection shows a "Reconnecting…" indicator and recovers.
- **Rankings are computed in SQL** (`get_leaderboard`). Raw votes are never sent
  to a browser — the audience client cannot read the `votes` table at all.
- **Admin authority is an allowlist** (`admin_users`), not "any signed-in user".

## Local development

```bash
cp .env.example .env.local     # fill in the two NEXT_PUBLIC_ values
npm install
npm run dev
```

Audience app at `http://localhost:3000`, admin app at `http://localhost:3000/admin`.
To exercise the real subdomain split locally, add `admin.localhost` to your hosts
file and set `NEXT_PUBLIC_ADMIN_HOST=admin.localhost:3000`.

## Tests

```bash
npm test        # unit tests: input validation, error mapping, voter identity
npm run typecheck
npm run lint
```

Business logic lives in Postgres, so it is tested there. Against a local stack
(`supabase start`) or a scratch project — not production, it creates a live event:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/business-logic.test.sql
```

46 assertions covering vote validation, duplicate voting, ranking, tie-breaking,
event state transitions, participant progression and authorization. It runs in a
transaction and rolls back.

For the full production path (HTTPS, PostgREST, RLS, connection pooling) see
[Load test](#load-test) below.

## Deploying

### Supabase

Apply `supabase/migrations/` in order. Then, **manually, once**:

1. **Create the admin account.** Authentication → Users → Add user, with a strong
   password and email confirmed.
2. **Add that user to the allowlist.** Nothing works otherwise — a signed-in user
   who is not on it is turned away at the dashboard.
   ```sql
   insert into public.admin_users (user_id, email)
   select id, email from auth.users where email = 'admin@yourdomain.com';
   ```
3. **Disable public signups.** Authentication → Providers → Email → turn off
   "Enable sign ups". The allowlist means a stray signup gets no privileges, but
   there is no reason to let strangers create accounts.
4. **Enable leaked-password protection.** Authentication → Policies.
5. Confirm Realtime is enabled for `events`, `participants` and `votes`
   (migrations `0006` and `0007` do this).

### Vercel

Set these environment variables for Production (and Preview, if you use it):

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `NEXT_PUBLIC_ADMIN_HOST` | `admin.yourdomain.com` — hostname only, no protocol, no trailing slash |

Do **not** set `SUPABASE_SERVICE_ROLE_KEY` on Vercel. Nothing in the request path
uses it, and it bypasses RLS entirely.

Add both `yourdomain.com` and `admin.yourdomain.com` to the Vercel project — one
deployment serves both, and middleware routes by `Host`. If
`NEXT_PUBLIC_ADMIN_HOST` does not exactly match the admin domain, the admin app
falls back to being reachable at `yourdomain.com/admin` instead.

Every route that reflects live event state is `force-dynamic`, so no page of it is
ever served from a static cache.

## Load test

Exercises the real production path end to end. Run it against a **rehearsal
event**, never the real one — it casts real votes, and nothing is permitted to
delete votes.

```bash
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
ADMIN_EMAIL=... ADMIN_PASSWORD=... \
LOADTEST_CONFIRM=1 node scripts/load-test.mjs --voters 100
```

Create a throwaway event, start it, open voting, then run the script. It fires
100 truly concurrent submissions, then 25 simultaneous submissions from a single
voter, and verifies server-side that exactly 101 votes were stored with no
duplicates, no misrouting and an average that matches points ÷ count exactly.
Delete the rehearsal event afterwards.

## Running an event

1. Sign in at `admin.yourdomain.com`.
2. Create the event and add participants (name required; batch and year optional).
   Reorder before starting.
3. **Start Event** activates the first performer. Voting begins closed.
4. **Open Voting** when the performance ends. The audience sees the rating slider.
5. **Close Voting**, then **Next Participant**. Closing is deliberate and final
   for that performer — it cannot be reopened, which is what stops late votes.
6. **Finish Event** when the last performer is done. This reveals the top 3 to the
   audience and the full final results to you. It asks for confirmation first.
7. Export CSV from the results view. It contains no voter IDs.

If the "Reconnecting…" indicator appears, the app is already recovering and will
re-fetch current state; no action needed.

## Deliberate limits

**Ballot stuffing is not fully preventable while voting is anonymous.** The
defenses are voter ID + database uniqueness + event/participant validation. A
determined person who clears site data repeatedly, or scripts against the public
anon key, can add votes under fresh voter IDs.

IP-based rate limiting is *not* the answer here and is not implemented: a venue
full of people shares one NAT'd IP, so any per-IP threshold low enough to matter
would block the real audience. CAPTCHA was rejected for the same reason — it taxes
every honest voter to slow an attacker down.

What bounds the risk in practice is that voting is open only for a minute or two
per performer, and the admin sees live vote counts. A participant whose count is
wildly out of line with the rest is visible while it is happening.
