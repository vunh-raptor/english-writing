import type {
  Mission,
  MissionProgress,
  ChatMessage,
  PhraseAlternative,
  NewsLevel,
  LexKind,
  ChunkResult,
  ContentIdea,
  Polish,
  Production,
  RespondSession,
  SourceRef,
  ThinkTurn,
  TranscribeClip,
  TranscribeCue,
  TranscribeSession,
  WordPos,
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
export type PhraseSource = "news" | "coach" | "captured" | "daily" | "transcribe";
/** Matches the DB enums added in migration 0006. */
export type RespondStatus = RespondSession["status"];
export type TranscribeStatus = TranscribeSession["status"];
/** Matches the DB enums added in migration 0007. */
export type ProductionSurface = Production["surface"];
export type ProductionVerdict = Production["verdict"];

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
          words_per_day: number;
          sound: boolean;
          has_written: boolean;
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
          words_per_day?: number;
          sound?: boolean;
          has_written?: boolean;
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
          words_per_day?: number;
          sound?: boolean;
          has_written?: boolean;
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
          my_line: string | null;
          captured_module: string | null;
          captured_day: DateStr | null;
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
          my_line?: string | null;
          captured_module?: string | null;
          captured_day?: DateStr | null;
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
          my_line?: string | null;
          captured_module?: string | null;
          captured_day?: DateStr | null;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Relationships: [];
      };
      vocab: {
        Row: {
          user_id: string;
          word: string;
          first_seen: DateStr;
          count: number;
        };
        Insert: {
          user_id: string;
          word: string;
          first_seen: DateStr;
          count?: number;
        };
        Update: {
          user_id?: string;
          word?: string;
          first_seen?: DateStr;
          count?: number;
        };
        Relationships: [];
      };
      word_days: {
        Row: {
          user_id: string;
          day: DateStr;
          word_ids: string[];
        };
        Insert: {
          user_id: string;
          day: DateStr;
          word_ids?: string[];
        };
        Update: {
          user_id?: string;
          day?: DateStr;
          word_ids?: string[];
        };
        Relationships: [];
      };
      phrase_applied: {
        Row: {
          user_id: string;
          day: DateStr;
          applications: number;
        };
        Insert: {
          user_id: string;
          day: DateStr;
          applications?: number;
        };
        Update: {
          user_id?: string;
          day?: DateStr;
          applications?: number;
        };
        Relationships: [];
      };
      respond_sessions: {
        Row: {
          id: string;
          user_id: string;
          day: DateStr;
          source: SourceRef;
          source_text: string;
          turns: ThinkTurn[];
          ideas: ContentIdea[];
          chosen_id: string | null;
          draft: string;
          polish: Polish | null;
          status: RespondStatus;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          day: DateStr;
          source: SourceRef;
          source_text?: string;
          turns?: ThinkTurn[];
          ideas?: ContentIdea[];
          chosen_id?: string | null;
          draft?: string;
          polish?: Polish | null;
          status?: RespondStatus;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: {
          id?: string;
          user_id?: string;
          day?: DateStr;
          source?: SourceRef;
          source_text?: string;
          turns?: ThinkTurn[];
          ideas?: ContentIdea[];
          chosen_id?: string | null;
          draft?: string;
          polish?: Polish | null;
          status?: RespondStatus;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Relationships: [];
      };
      transcribe_sessions: {
        Row: {
          id: string;
          user_id: string;
          day: DateStr;
          clip_id: string;
          clip: TranscribeClip;
          chunk_seconds: number;
          chunk_count: number;
          cursor: number;
          results: Record<string, ChunkResult>;
          milestones_passed: number[];
          status: TranscribeStatus;
          created_at: Timestamp;
          updated_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          day: DateStr;
          clip_id: string;
          clip: TranscribeClip;
          chunk_seconds?: number;
          chunk_count?: number;
          cursor?: number;
          results?: Record<string, ChunkResult>;
          milestones_passed?: number[];
          status?: TranscribeStatus;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Update: {
          id?: string;
          user_id?: string;
          day?: DateStr;
          clip_id?: string;
          clip?: TranscribeClip;
          chunk_seconds?: number;
          chunk_count?: number;
          cursor?: number;
          results?: Record<string, ChunkResult>;
          milestones_passed?: number[];
          status?: TranscribeStatus;
          created_at?: Timestamp;
          updated_at?: Timestamp;
        };
        Relationships: [];
      };
      word_items: {
        Row: {
          id: string;
          user_id: string;
          slug: string;
          word: string;
          pos: WordPos;
          band: NewsLevel;
          meaning: string;
          example: string;
          collocations: string[];
          field: string;
          rank: number;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          slug: string;
          word: string;
          pos: WordPos;
          band: NewsLevel;
          meaning?: string;
          example?: string;
          collocations?: string[];
          field?: string;
          rank?: number;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          user_id?: string;
          slug?: string;
          word?: string;
          pos?: WordPos;
          band?: NewsLevel;
          meaning?: string;
          example?: string;
          collocations?: string[];
          field?: string;
          rank?: number;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      listening_clips: {
        Row: {
          id: string;
          user_id: string;
          slug: string;
          title: string;
          source: string;
          level: NewsLevel;
          blurb: string;
          wpm: number;
          prose: string;
          cues: TranscribeCue[];
          duration: number;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          slug: string;
          title: string;
          source?: string;
          level: NewsLevel;
          blurb?: string;
          wpm?: number;
          prose: string;
          cues?: TranscribeCue[];
          duration?: number;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          user_id?: string;
          slug?: string;
          title?: string;
          source?: string;
          level?: NewsLevel;
          blurb?: string;
          wpm?: number;
          prose?: string;
          cues?: TranscribeCue[];
          duration?: number;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      ai_content: {
        Row: {
          id: string;
          user_id: string;
          kind: string;
          content_key: string;
          payload: unknown;
          prompt_version: string;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: string;
          content_key: string;
          payload: unknown;
          prompt_version?: string;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: string;
          content_key?: string;
          payload?: unknown;
          prompt_version?: string;
          created_at?: Timestamp;
        };
        Relationships: [];
      };
      productions: {
        Row: {
          id: string;
          user_id: string;
          day: DateStr;
          surface: ProductionSurface;
          item_slug: string | null;
          mode: string | null;
          prompt: string;
          text: string;
          verdict: ProductionVerdict;
          note: string | null;
          created_at: Timestamp;
        };
        Insert: {
          id?: string;
          user_id: string;
          day: DateStr;
          surface: ProductionSurface;
          item_slug?: string | null;
          mode?: string | null;
          prompt?: string;
          text: string;
          verdict?: ProductionVerdict;
          note?: string | null;
          created_at?: Timestamp;
        };
        Update: {
          id?: string;
          user_id?: string;
          day?: DateStr;
          surface?: ProductionSurface;
          item_slug?: string | null;
          mode?: string | null;
          prompt?: string;
          text?: string;
          verdict?: ProductionVerdict;
          note?: string | null;
          created_at?: Timestamp;
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
      respond_status: RespondStatus;
      transcribe_status: TranscribeStatus;
      production_surface: ProductionSurface;
      production_verdict: ProductionVerdict;
      word_pos: WordPos;
    };
    CompositeTypes: Record<string, never>;
  };
}

/** Convenience row aliases. */
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type NewsSessionRow = Database["public"]["Tables"]["news_sessions"]["Row"];
export type PhraseRow = Database["public"]["Tables"]["phrases"]["Row"];
export type VocabRow = Database["public"]["Tables"]["vocab"]["Row"];
export type WordDayRow = Database["public"]["Tables"]["word_days"]["Row"];
export type PhraseAppliedRow = Database["public"]["Tables"]["phrase_applied"]["Row"];
export type RespondSessionRow = Database["public"]["Tables"]["respond_sessions"]["Row"];
export type TranscribeSessionRow = Database["public"]["Tables"]["transcribe_sessions"]["Row"];
export type WordItemRow = Database["public"]["Tables"]["word_items"]["Row"];
export type ListeningClipRow = Database["public"]["Tables"]["listening_clips"]["Row"];
export type AiContentRow = Database["public"]["Tables"]["ai_content"]["Row"];
export type ProductionRow = Database["public"]["Tables"]["productions"]["Row"];
