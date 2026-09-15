import { createClient } from "@/lib/supabase/server";
import {
  AdminDashboard,
  type EventRow,
  type ParticipantRow,
  type LeaderboardRow,
} from "@/components/admin/dashboard";

export default async function DashboardPage() {
  const supabase = await createClient();

  // "One active event" per the product brief: the live one if there is
  // one, else the most recently created draft, else the most recently
  // finished one — so a fresh page load after finishing still lands on
  // that event's final results instead of the empty "no event" state.
  const { data: liveEvent } = await supabase
    .from("events")
    .select("id, name, status, active_participant_id, voting_state")
    .eq("status", "live")
    .maybeSingle();

  let event: EventRow | null = liveEvent ?? null;

  if (!event) {
    const { data: draftEvent } = await supabase
      .from("events")
      .select("id, name, status, active_participant_id, voting_state")
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    event = draftEvent ?? null;
  }

  if (!event) {
    const { data: finishedEvent } = await supabase
      .from("events")
      .select("id, name, status, active_participant_id, voting_state")
      .eq("status", "finished")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    event = finishedEvent ?? null;
  }

  let participants: ParticipantRow[] = [];
  let leaderboard: LeaderboardRow[] = [];

  if (event) {
    const { data: participantRows } = await supabase
      .from("participants")
      .select("id, event_id, name, batch, year, display_order, status")
      .eq("event_id", event.id)
      .order("display_order", { ascending: true });
    participants = participantRows ?? [];

    // Ranking is computed server-side (average -> votes -> points ->
    // display_order tie-break) — never pull raw votes into the browser
    // to rank them here.
    const { data: leaderboardRows } = await supabase.rpc("get_leaderboard", {
      p_event_id: event.id,
    });
    leaderboard = leaderboardRows ?? [];
  }

  return (
    <AdminDashboard
      initialEvent={event}
      initialParticipants={participants}
      initialLeaderboard={leaderboard}
    />
  );
}
