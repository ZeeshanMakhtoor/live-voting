/**
 * Hand-written placeholder matching supabase/migrations/*.sql.
 *
 * Once you can reach the project non-interactively, regenerate this file
 * from the live schema and replace this file's contents:
 *
 *   npx supabase gen types typescript --project-id <project-ref> > src/types/database.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type EventStatus = "draft" | "live" | "finished";
export type VotingState = "not_started" | "open" | "paused" | "closed";
export type ParticipantStatus = "upcoming" | "active" | "completed" | "skipped" | "removed";

/** Machine-readable error codes raised by cast_vote / admin_* RPCs. */
export type RpcErrorCode =
  | "INVALID_RATING"
  | "INVALID_VOTER_ID"
  | "PARTICIPANT_NOT_FOUND"
  | "PARTICIPANT_NOT_ACTIVE"
  | "PARTICIPANT_REMOVED"
  | "EVENT_NOT_FOUND"
  | "EVENT_NOT_LIVE"
  | "EVENT_FINISHED"
  | "VOTING_NOT_OPEN"
  | "VOTING_NOT_PAUSED"
  | "NO_ACTIVE_PARTICIPANT"
  | "NO_MORE_PARTICIPANTS"
  | "ALREADY_VOTED";

export interface Database {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          name: string;
          status: EventStatus;
          active_participant_id: string | null;
          voting_state: VotingState;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          status?: EventStatus;
          active_participant_id?: string | null;
          voting_state?: VotingState;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Insert"]>;
      };
      participants: {
        Row: {
          id: string;
          event_id: string;
          name: string;
          batch: string | null;
          year: string | null;
          display_order: number;
          status: ParticipantStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          name: string;
          batch?: string | null;
          year?: string | null;
          display_order: number;
          status?: ParticipantStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["participants"]["Insert"]>;
      };
      votes: {
        Row: {
          id: string;
          event_id: string;
          participant_id: string;
          voter_id: string;
          rating: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          participant_id: string;
          voter_id: string;
          rating: number;
          created_at?: string;
        };
        // Votes are historical records: no Update type is exposed on
        // purpose. The database enforces this too — see 0001's RLS
        // policies (no UPDATE/DELETE policy on votes for any role).
        Update: never;
      };
    };
    Views: {
      participant_scores: {
        Row: {
          participant_id: string;
          event_id: string;
          name: string;
          batch: string | null;
          year: string | null;
          display_order: number;
          status: ParticipantStatus;
          vote_count: number;
          total_rating_points: number;
          average_rating: number | null;
        };
      };
    };
    Functions: {
      cast_vote: {
        Args: {
          p_participant_id: string;
          p_voter_id: string;
          p_rating: number;
        };
        Returns: string;
      };
      get_leaderboard: {
        Args: { p_event_id: string };
        Returns: {
          rank: number;
          participant_id: string;
          name: string;
          batch: string | null;
          year: string | null;
          display_order: number;
          status: ParticipantStatus;
          vote_count: number;
          total_rating_points: number;
          average_rating: number | null;
        }[];
      };
      admin_start_participant: {
        Args: { p_event_id: string; p_participant_id: string };
        Returns: undefined;
      };
      admin_next_participant: {
        Args: { p_event_id: string };
        Returns: string;
      };
      admin_skip_participant: {
        Args: { p_event_id: string; p_participant_id: string };
        Returns: undefined;
      };
      admin_open_voting: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      admin_pause_voting: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      admin_close_voting: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      admin_finish_event: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
    };
  };
}
