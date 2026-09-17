// Stand-in for Supabase REST/RPC/Auth, shaped like PostgREST.
//
// This sandbox is blocked from reaching Supabase by network policy, so the
// real backend cannot be used here. This mock therefore enforces the SAME
// invariants cast_vote() enforces in Postgres, so a concurrency result
// against it is meaningful for the CLIENT path:
//   - unique (participant_id, voter_id)        -> ALREADY_VOTED
//   - voting_state must be 'open'              -> VOTING_NOT_OPEN
//   - participant must be the active one       -> PARTICIPANT_NOT_ACTIVE
//   - rating must be an integer 1..5           -> INVALID_RATING
// Node is single-threaded, so check-then-insert here is atomic the same way
// the database's row lock makes it atomic there.
import http from "node:http";

const LATENCY_MS = Number(process.env.MOCK_LATENCY_MS ?? 120);

const state = {
  event: {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Literary Club — Annual Showcase",
    status: "live",
    active_participant_id: "22222222-2222-2222-2222-222222222222",
    voting_state: "open",
    updated_at: new Date().toISOString(),
  },
  participants: [],
  votes: new Map(), // "participantId|voterId" -> rating
  rejected: [],
};

[
  ["Aisha Khan", "BTech CSE", "2028"],
  ["Rohan Mehta", "BA English", "2027"],
  ["Priya Nair", "BTech ECE", "2026"],
].forEach(([name, batch, year], i) => {
  state.participants.push({
    id: i === 0 ? "22222222-2222-2222-2222-222222222222" : `3333333${i}-3333-3333-3333-333333333333`,
    event_id: state.event.id,
    name, batch, year,
    display_order: i + 1,
    status: i === 0 ? "active" : "upcoming",
  });
});

function leaderboard() {
  return state.participants.map((p, i) => {
    const ratings = [...state.votes.entries()]
      .filter(([k]) => k.startsWith(p.id + "|"))
      .map(([, v]) => v);
    const points = ratings.reduce((a, b) => a + b, 0);
    return {
      rank: i + 1,
      participant_id: p.id, name: p.name, batch: p.batch, year: p.year,
      display_order: p.display_order, status: p.status,
      vote_count: ratings.length,
      total_rating_points: points,
      average_rating: ratings.length ? +(points / ratings.length).toFixed(2) : null,
    };
  });
}

function send(res, code, body, req) {
  const single = (req.headers.accept || "").includes("vnd.pgrst.object");
  const payload = single && Array.isArray(body) ? (body[0] ?? null) : body;
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "*",
  });
  res.end(JSON.stringify(payload));
}

const err = (res, req, message) => send(res, 400, { code: "P0001", message, details: null, hint: null }, req);

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, null, req);
  const url = new URL(req.url, "http://x");
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const body = raw ? JSON.parse(raw) : {};
    const p = url.pathname;

    if (p === "/rest/v1/rpc/cast_vote") {
      // Deliberate delay so concurrent submissions genuinely overlap in
      // flight rather than being serialised by an instant response.
      setTimeout(() => {
        const { p_participant_id: pid, p_voter_id: vid, p_rating: rating } = body;
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          state.rejected.push("INVALID_RATING"); return err(res, req, "INVALID_RATING");
        }
        if (!/^[A-Za-z0-9_-]{16,64}$/.test(vid ?? "")) {
          state.rejected.push("INVALID_VOTER_ID"); return err(res, req, "INVALID_VOTER_ID");
        }
        if (state.event.status !== "live") {
          state.rejected.push("EVENT_NOT_LIVE"); return err(res, req, "EVENT_NOT_LIVE");
        }
        if (pid !== state.event.active_participant_id) {
          state.rejected.push("PARTICIPANT_NOT_ACTIVE"); return err(res, req, "PARTICIPANT_NOT_ACTIVE");
        }
        if (state.event.voting_state !== "open") {
          state.rejected.push("VOTING_NOT_OPEN"); return err(res, req, "VOTING_NOT_OPEN");
        }
        const key = `${pid}|${vid}`;
        if (state.votes.has(key)) {
          state.rejected.push("ALREADY_VOTED"); return err(res, req, "ALREADY_VOTED");
        }
        state.votes.set(key, rating);
        send(res, 200, "vote-" + state.votes.size, req);
      }, LATENCY_MS);
      return;
    }

    // Test-only inspection and control endpoints.
    if (p === "/__test/stats") {
      const ratings = [...state.votes.values()];
      return send(res, 200, {
        votes: state.votes.size,
        distinctVoters: new Set([...state.votes.keys()].map((k) => k.split("|")[1])).size,
        sum: ratings.reduce((a, b) => a + b, 0),
        rejected: state.rejected.reduce((a, r) => ((a[r] = (a[r] ?? 0) + 1), a), {}),
      }, req);
    }
    if (p === "/__test/reset") {
      state.votes.clear(); state.rejected = [];
      state.event.voting_state = url.searchParams.get("voting") ?? "open";
      const status = url.searchParams.get("status");
      if (status) {
        state.event.status = status;
        // Finishing clears the stage; anything else puts performer 1 back on
        // it, so a reset is a genuine reset rather than a one-way door.
        state.event.active_participant_id =
          status === "finished" ? null : state.participants[0].id;
      }
      return send(res, 200, { ok: true }, req);
    }

    if (p === "/auth/v1/user") return send(res, 200, { id: "admin", email: "a@b.c" }, req);
    if (p === "/auth/v1/token") return send(res, 200, { access_token: "t", refresh_token: "r", user: { id: "admin" } }, req);
    if (p === "/rest/v1/rpc/is_admin") return send(res, 200, true, req);
    if (p === "/rest/v1/rpc/has_voted") {
      return send(res, 200, state.votes.has(`${body.p_participant_id}|${body.p_voter_id}`), req);
    }
    if (p === "/rest/v1/rpc/get_leaderboard") return send(res, 200, leaderboard(), req);
    if (p.startsWith("/rest/v1/rpc/")) return send(res, 200, null, req);

    if (p === "/rest/v1/events") {
      const want = (url.searchParams.get("status") || "").replace("eq.", "");
      return send(res, 200, state.event.status === want ? [state.event] : [], req);
    }
    if (p === "/rest/v1/participants") {
      const id = (url.searchParams.get("id") || "").replace("eq.", "");
      return send(res, 200, id ? state.participants.filter((x) => x.id === id) : state.participants, req);
    }
    return send(res, 200, [], req);
  });
});

server.listen(54321, () => console.log(`mock supabase on 54321 (latency ${LATENCY_MS}ms)`));
