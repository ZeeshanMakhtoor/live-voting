# Literary Club — Live Voting

Audience rates one performer at a time from their phone. An admin drives the event
from a separate subdomain and watches rankings build live.

---

## 1. What the application does

A club event has a running order of 40–50 performers. Each performs in turn; while
they're on stage the admin opens voting, and everyone in the room rates them 1–5 on
their own phone. No login, no app install, no account.

- **`yourdomain.com`** — the audience app. Shows whoever is performing right now and
  a 1–5 scale. One rating per person, per performer.
- **`admin.yourdomain.com`** — the admin app, behind an email/password login. Build
  the running order, advance performers, open and close voting, watch live stats,
  finish the event and export results.

When the admin finishes the event, the audience sees the top 3 and the admin sees
full final results with a CSV export.

## 2. Architecture

Next.js 14 (App Router) on Vercel + Supabase (Postgres, Auth, Realtime). One
deployment serves both apps; middleware routes by `Host` header.

**The database is the authority.** Every rule that matters is enforced in Postgres,
not in the browser and not in a server action. The audience client talks to Supabase
directly, so anything enforced only in JavaScript would be enforced by nobody.

| Concern | Where it lives |
| --- | --- |
| Casting a vote | `cast_vote()` — re-reads event and participant state under a row lock, then inserts |
| One vote per person per performer | Unique index on `(event_id, participant_id, voter_id)` |
| Event control | `admin_*()` functions, callable only by an allowlisted admin |
| Ranking | `get_leaderboard()` — computed in SQL; raw votes never reach a browser |
| Who may see what | Row Level Security on every table |

Realtime is a **synchronisation signal, not a source of truth**. Nothing that changed
while a client was disconnected is replayed, so both apps re-fetch state on every
(re)connect and show a "Reconnecting" indicator while they're out of touch.

```
Audience phone ─┐
                ├─→ Vercel (SSR, dynamic) ─→ Supabase Postgres ← RLS + RPCs
Admin laptop  ──┘         ↑                        │
                          └──── Realtime ──────────┘  (refetch trigger only)
```

Anonymous voters are identified by a random ID in `localStorage`. It is a convenience,
never a trust boundary — the unique index is what actually stops double voting.

## 3. Local setup

Requires Node 20+.

```bash
git clone <your-repo-url>
cd live-voting
npm install
cp .env.example .env.local     # fill in the two NEXT_PUBLIC_ values
```

## 4. Supabase setup

1. Create a project at [supabase.com](https://supabase.com). Pick the region closest
   to your venue.
2. **Settings → API** gives you the Project URL and the `anon` public key. Those are
   the two values `.env.local` needs.
3. Apply the migrations (section 6).
4. Create the admin account (section 7).
5. **Authentication → Providers → Email**: turn **off** "Enable sign ups". Admin access
   is an explicit allowlist, so a stray signup gets no privileges — but there's no
   reason to let strangers create accounts.
6. **Authentication → Policies**: turn on leaked-password protection.
7. **Realtime**: the migrations already add `events`, `participants` and `votes` to the
   `supabase_realtime` publication. Confirm under **Database → Replication**.
8. **RLS**: enabled on every table by the migrations. Nothing to do by hand. The
   resulting policy set is:
   - `events` — anon may read only `live` and `finished` events; admins may do anything.
   - `participants` — anon may read participants of a `live` event; admins may do anything.
   - `votes` — **no anon policy at all**, and admins get `SELECT` only. Votes are
     append-only, insertable solely through `cast_vote()`.
   - `admin_users` — RLS on with no policies, so it is unreachable through the API.

## 5. Environment variables

| Variable | Required | Where | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | local + Vercel | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | local + Vercel | Supabase → Settings → API. Public by design; RLS is what protects the data. |
| `NEXT_PUBLIC_ADMIN_HOST` | yes in production | local + Vercel | Hostname only — `admin.yourdomain.com`. No protocol, no trailing slash, no path. |
| `SUPABASE_SERVICE_ROLE_KEY` | no | never on Vercel | Bypasses RLS entirely. Nothing in the request path uses it. Only for one-off local admin scripts. |

There are no other environment variables, and no hardcoded URLs anywhere — the admin
host is read from configuration in every place it matters.

## 6. Database migrations

Apply everything in `supabase/migrations/` **in filename order**. Either paste each
file into the Supabase SQL editor, or use the CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

| Migration | What it does |
| --- | --- |
| `0001` | Core schema: events, participants, votes; RLS; indexes |
| `0002` | Event lifecycle, voting states, scoring view, `get_leaderboard` |
| `0003` | Admin event-control functions |
| `0004` | Revokes the execute grants Supabase auto-adds to `anon` |
| `0005` | Public top-3 reveal after the event finishes |
| `0006`–`0007` | Realtime publication; reorder / skip / remove controls |
| `0008` | Closed voting cannot be reopened |
| `0009` | Removed participants excluded from rankings |
| `0010` | Input validation as CHECK constraints |
| `0011` | Consistent lock ordering between voting and admin control |
| `0012` | Admin allowlist (`admin_users` + `is_admin()`) |
| `0013` | Tightens function grants so only `cast_vote` and `get_public_top3` are public |

To verify a fresh database, run the business-logic suite (46 assertions; it creates a
live event, so use a scratch database, not production):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/business-logic.test.sql
```

## 7. Admin setup

Two steps — **both are required**. A signed-in account that isn't on the allowlist is
turned away at the dashboard.

1. **Supabase → Authentication → Users → Add user.** Use a strong password and mark
   the email confirmed.
2. **Add that user to the allowlist**, in the SQL editor:

```sql
insert into public.admin_users (user_id, email)
select id, email from auth.users where email = 'admin@yourdomain.com';
```

To check who currently has admin rights: `select email from public.admin_users;`

## 8. Running locally

```bash
npm run dev          # http://localhost:3000
```

- Audience app: `http://localhost:3000`
- Admin app: `http://localhost:3000/admin`

To exercise the real subdomain split locally, add `admin.localhost` to your hosts file
and set `NEXT_PUBLIC_ADMIN_HOST=admin.localhost:3000`. Otherwise middleware falls back
to path-based routing at `/admin`, which is fine for development.

Other commands:

```bash
npm test             # unit tests: validation, error mapping, voter identity
npm run typecheck
npm run lint
npm run build
```

## 9. Vercel deployment

1. Import the repository into Vercel. The defaults are correct — it's a standard
   Next.js project, no build overrides needed.
2. Add the three `NEXT_PUBLIC_*` variables from section 5 to **Production** (and
   **Preview**, if you use preview deployments).
3. Do **not** add `SUPABASE_SERVICE_ROLE_KEY`.
4. Deploy.

Every route that reflects live event state is `force-dynamic`, so no page of it is
ever served from a static or edge cache. That is deliberate: a cached page would show
a stale performer to the room.

## 10. Custom domain setup

In **Vercel → Project → Settings → Domains**, add `yourdomain.com` (and `www` if you
want it, redirecting to the apex). Follow Vercel's DNS instructions at your registrar
and wait for the certificate to issue.

## 11. Admin subdomain setup

1. Add `admin.yourdomain.com` as a **second domain on the same Vercel project** — not a
   separate project. One deployment serves both.
2. Add the DNS record Vercel asks for (usually a `CNAME` to `cname.vercel-dns.com`).
3. Set `NEXT_PUBLIC_ADMIN_HOST=admin.yourdomain.com` in Vercel and redeploy.

Middleware reads the `Host` header: on the admin host, `/login` and `/dashboard` are
served from the admin app; on the public host, the audience app is served and the admin
app remains reachable at `/admin`.

**If `NEXT_PUBLIC_ADMIN_HOST` does not exactly match the real subdomain**, the admin app
silently falls back to `yourdomain.com/admin`. It still works and is still protected —
but it isn't on the subdomain you intended, so check this after deploying.

## 12. Running the live event

See **[OPERATIONS.md](./OPERATIONS.md)** for the event-day runbook.

The loop, in one line: **Start performer → Open voting → watch the count → Close voting
→ next performer.** Finish the event at the end to reveal the top 3.

## 13. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "That account isn't an event administrator" | The user exists in Auth but not in `admin_users`. Run the insert in section 7. |
| Admin app loads at `/admin` instead of the subdomain | `NEXT_PUBLIC_ADMIN_HOST` doesn't match the real host, or wasn't redeployed after being set. |
| Audience stuck on "Voting hasn't started yet" | No event is `live`. Start a performer from the dashboard. |
| "Reconnecting" persists on a phone | That phone lost its Realtime connection. The app re-fetches on reconnect and the audience can still vote. Usually venue WiFi. |
| A voter says Submit does nothing | They've already rated this performer — the screen will say so. Ratings are one per performer, per device. |
| "Cannot start event" / duplicate live event | Another event is still `live`. Only one may be live at a time; finish the old one first. |
| Removing a participant is disabled | They already have ratings. Skip them instead — removing would discard real votes. |
| Voting won't reopen after closing | Closing is deliberately final for that performer. Advance to the next one. |
| Dashboard shows an error banner | The action failed and *did not* apply. The message says which one. Retry; the event is unaffected. |
| Vote counts look frozen for a second | Vote-driven refreshes are coalesced into roughly one per second so a burst of 100 ratings doesn't hammer the database. This is normal. |

### Checking the database directly

```sql
-- What is live right now?
select name, status, voting_state, active_participant_id from public.events;

-- Ratings for the current performer
select count(*), round(avg(rating),2) from public.votes
where participant_id = (select active_participant_id from public.events where status='live');

-- Final results, straight from the votes
select * from public.get_leaderboard('<event-id>');
```

## Deliberate limits

**Ballot stuffing is not fully preventable while voting is anonymous.** The defences
are voter ID + database uniqueness + event/participant validation. Someone who clears
site data repeatedly, or scripts against the public anon key, can add votes under
fresh IDs.

IP-based rate limiting is *not* the answer here and is not implemented: a venue full
of people shares one NAT'd IP, so any threshold low enough to matter would block the
real audience. CAPTCHA was rejected for the same reason — it taxes every honest voter
to slow an attacker down.

What bounds the risk in practice is that voting is open only for a minute or two per
performer, and the admin can see live vote counts. A performer whose count is wildly
out of line with the rest is visible while it's happening.
