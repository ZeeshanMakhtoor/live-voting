import { createClient } from "@/lib/supabase/server";
import { AdminDashboard, type EventRow, type ParticipantRow, type ScoreRow } from "@/components/admin/dashboard";

export default async function DashboardPage() {
  const supabase = await createClient();

  // "One active event" per the product brief: the live one if there is
  // one, else the most recently touched non-finished (draft) event, so
  // the admin always lands on the event they're actually running.
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

  let participants: ParticipantRow[] = [];
  let scores: ScoreRow[] = [];

  if (event) {
    const { data: participantRows } = await supabase
      .from("participants")
      .select("id, event_id, name, batch, year, display_order, status")
      .eq("event_id", event.id)
      .order("display_order", { ascending: true });
    participants = participantRows ?? [];

    const { data: scoreRows } = await supabase
      .from("participant_scores")
      .select("participant_id, vote_count, total_rating_points, average_rating")
      .eq("event_id", event.id);
    scores = scoreRows ?? [];
  }

  return <AdminDashboard initialEvent={event} initialParticipants={participants} initialScores={scores} />;
}
