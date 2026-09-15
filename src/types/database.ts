/**
 * Hand-written placeholder matching supabase/migrations/0001_init.sql.
 *
 * Once a real Supabase project exists, regenerate this file from the live
 * schema and replace this file's contents:
 *
 *   npx supabase gen types typescript --project-id <project-ref> > src/types/database.ts
 */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type EventStatus = "draft" | "active" | "completed";
export type ParticipantStatus = "upcoming" | "active" | "completed" | "skipped" | "removed";

export interface Database {
  public: {
    Tables: {
      events: {
        Row: {
          id: string;
          name: string;
          status: EventStatus;
          active_participant_id: string | null;
          voting_open: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          status?: EventStatus;
          active_participant_id?: string | null;
          voting_open?: boolean;
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
        // Votes are immutable: no Update type is exposed intentionally.
        Update: never;
      };
    };
    Views: {
      participant_results: {
        Row: {
          participant_id: string;
          event_id: string;
          name: string;
          batch: string | null;
          year: string | null;
          display_order: number;
          status: ParticipantStatus;
          vote_count: number;
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
        Returns: undefined;
      };
    };
  };
}
