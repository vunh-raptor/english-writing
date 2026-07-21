import type {
  Mission,
  MissionProgress,
  ChatMessage,
  PhraseAlternative,
  NewsLevel,
  LexKind,
} from "@/types";

/**
 * Hand-authored Supabase schema types — the shape the SQL migrations under
 * `supabase/` create. Kept in lockstep with those migrations by hand (the
 * project runs `supabase-js` from the server with no ORM; see
 * docs/ARCHITECTURE.md). Passing this to `createClient<Database>()` makes every
 * `.from(...)` query typed end to end.
 *
 * JSONB columns are typed as their domain shapes (`Mission`, `ChatMessage[]`,
 * …) rather than a loose `Json`, so reads and writes stay honest.
 */

export type NewsSessionStatus = "active" | "complete";
/** Matches the DB enum after migration 0004 — the same set as `LexKind`. */
export type PhraseKind = LexKind;
export type PhraseSource = "news" | "coach" | "captured";

/** `YYYY-MM-DD`, the learner's local calendar day (Postgres `date`). */
type DateStr = string;
/** ISO 8601 timestamp (Postgres `timestamptz`). */
type Timestamp = string;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          streak: number;
          longest_streak: number;
          last_write_day: DateStr | null;
          freezes: number;
          total_words: number;
          total_entries: number;
          total_ms: number;
          news_level: NewsLevel;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          streak?: number;
          longest_streak?: number;
          last_write_day?: DateStr | null;
          freezes?: number;
          total_words?: number;
          total_entries?: number;
          total_ms?: number;
          news_level?: NewsLevel;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          streak?: number;
          longest_streak?: number;
          last_write_day?: DateStr | null;
          freezes?: number;
          total_words?: number;
          total_entries?: number;
          total_ms?: number;
          news_level?: NewsLevel;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Relationships: [];
      };
      news_sessions: {
        Row: {
          id: string;
          user_id: string;
          day: DateStr;
          level: NewsLevel;
          title: string;
          source: string;
          url: string | null;
          goal: string;
          status: NewsSessionStatus;
          words_produced: number;
          targets_produced: number;
          targets_total: number;
          goal_hit: boolean | null;
          mission: Mission;
          messages: ChatMessage[];
          progress: MissionProgress;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          day: DateStr;
          level: NewsLevel;
          title: string;
          source: string;
          url?: string | null;
          goal: string;
          status?: NewsSessionStatus;
          words_produced?: number;
          targets_produced?: number;
          targets_total?: number;
          goal_hit?: boolean | null;
          mission: Mission;
          messages?: ChatMessage[];
          progress: MissionProgress;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: {
          id?: string;
          user_id?: string;
          day?: DateStr;
          level?: NewsLevel;
          title?: string;
          source?: string;
          url?: string | null;
          goal?: string;
          status?: NewsSessionStatus;
          words_produced?: number;
          targets_produced?: number;
          targets_total?: number;
          goal_hit?: boolean | null;
          mission?: Mission;
          messages?: ChatMessage[];
          progress?: MissionProgress;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Relationships: [];
      };
      phrases: {
        Row: {
          id: string;
          user_id: string;
          slug: string;
          text: string;
          meaning: string;
          example: string;
          kind: PhraseKind;
          register: string | null;
          origin: string | null;
          alternatives: PhraseAlternative[];
          collocations: string[];
          source: PhraseSource;
          source_session_id: string | null;
          captured_context: string | null;
          srs_box: number | null;
          srs_due: DateStr | null;
          srs_reps: number;
          srs_last_reviewed: DateStr | null;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          slug: string;
          text: string;
          meaning?: string;
          example?: string;
          kind?: PhraseKind;
          register?: string | null;
          origin?: string | null;
          alternatives?: PhraseAlternative[];
          collocations?: string[];
          source: PhraseSource;
          source_session_id?: string | null;
          captured_context?: string | null;
          srs_box?: number | null;
          srs_due?: DateStr | null;
          srs_reps?: number;
          srs_last_reviewed?: DateStr | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: {
          id?: string;
          user_id?: string;
          slug?: string;
          text?: string;
          meaning?: string;
          example?: string;
          kind?: PhraseKind;
          register?: string | null;
          origin?: string | null;
          alternatives?: PhraseAlternative[];
          collocations?: string[];
          source?: PhraseSource;
          source_session_id?: string | null;
          captured_context?: string | null;
          srs_box?: number | null;
          srs_due?: DateStr | null;
          srs_reps?: number;
          srs_last_reviewed?: DateStr | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      news_level: NewsLevel;
      news_session_status: NewsSessionStatus;
      phrase_kind: PhraseKind;
      phrase_source: PhraseSource;
    };
    CompositeTypes: Record<string, never>;
  };
}

/** Convenience row aliases. */
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type NewsSessionRow = Database["public"]["Tables"]["news_sessions"]["Row"];
export type PhraseRow = Database["public"]["Tables"]["phrases"]["Row"];
