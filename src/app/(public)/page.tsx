import { createClient } from "@/lib/supabase/server";
import { AudienceApp, type EventState, type ParticipantState } from "@/components/audience-app";

// This page reflects live event state that can change at any moment via
// admin action; it must never be statically prerendered/cached (see the
// admin dashboard fix in an earlier commit for why that's dangerous).
export const dynamic = "force-dynamic";

export default async function AudienceHomePage() {
  const supabase = await createClient();

  const { data: live } = await supabase
    .from("events")
    .select("id, status, active_participant_id, voting_state")
    .eq("status", "live")
    .maybeSingle();

  let event: EventState | null = live ?? null;

  if (!event) {
    const { data: finished } = await supabase
      .from("events")
      .select("id, status, active_participant_id, voting_state")
      .eq("status", "finished")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    event = finished ?? null;
  }

  let participant: ParticipantState | null = null;
  if (event?.status === "live" && event.active_participant_id) {
    const { data: p } = await supabase
      .from("participants")
      .select("id, name, batch, year")
      .eq("id", event.active_participant_id)
      .maybeSingle();
    participant = p ?? null;
  }

  return <AudienceApp initialEvent={event} initialParticipant={participant} />;
}
