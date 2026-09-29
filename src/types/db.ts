// cs-na

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  bananagrams: {
    Tables: {
      games: {
        Row: {
          bag: string
          bunch: string
          bunch_at_setup: string
          dict_2: number
          dict_3plus: number
          dump_to_bag: boolean
          game_id: string
          hand_size: number
          word_check: string
        }
        Insert: {
          bag?: string
          bunch: string
          bunch_at_setup: string
          dict_2: number
          dict_3plus: number
          dump_to_bag: boolean
          game_id: string
          hand_size: number
          word_check: string
        }
        Update: {
          bag?: string
          bunch?: string
          bunch_at_setup?: string
          dict_2?: number
          dict_3plus?: number
          dump_to_bag?: boolean
          game_id?: string
          hand_size?: number
          word_check?: string
        }
        Relationships: []
      }
      player_boards: {
        Row: {
          board: string
          game_id: string
          tiles: string
          updated_at: string
          user_id: string
        }
        Insert: {
          board: string
          game_id: string
          tiles: string
          updated_at?: string
          user_id: string
        }
        Update: {
          board?: string
          game_id?: string
          tiles?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_boards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
        ]
      }
      progress: {
        Row: {
          game_id: string
          placed: number
          unplaced_count: number
          user_id: string
        }
        Insert: {
          game_id: string
          placed?: number
          unplaced_count: number
          user_id: string
        }
        Update: {
          game_id?: string
          placed?: number
          unplaced_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _count_unplaced: {
        Args: { p_game_id: string; p_user_ids: string[] }
        Returns: boolean
      }
      _full_bag: { Args: never; Returns: string }
      _main_block_size: { Args: { p_board: string }; Returns: number }
      _win_blockers: {
        Args: {
          p_board: string
          p_check_words: boolean
          p_dict_2: number
          p_dict_3plus: number
        }
        Returns: number[]
      }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      check_board: { Args: { p_game_id: string }; Returns: Json }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_club_handle: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      dump: { Args: { p_game_id: string; p_tile: string }; Returns: Json }
      peel: { Args: { p_game_id: string }; Returns: Json }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      save_player_board: {
        Args: { p_board: string; p_game_id: string }
        Returns: Json
      }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  boggle: {
    Tables: {
      found_words: {
        Row: {
          found_at: string
          game_id: string
          is_bonus: boolean
          points: number
          user_id: string
          word: string
        }
        Insert: {
          found_at?: string
          game_id: string
          is_bonus: boolean
          points: number
          user_id: string
          word: string
        }
        Update: {
          found_at?: string
          game_id?: string
          is_bonus?: boolean
          points?: number
          user_id?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "found_words_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          board: string
          board_side_size: number
          bonus_words: Json
          game_id: string
          legal_band: number
          min_word_length: number
          required_band: number
          required_words: Json
          required_words_count: number
          required_words_score: number
          target_win_percent: number | null
        }
        Insert: {
          board: string
          board_side_size: number
          bonus_words?: Json
          game_id: string
          legal_band: number
          min_word_length: number
          required_band: number
          required_words: Json
          required_words_count: number
          required_words_score: number
          target_win_percent?: number | null
        }
        Update: {
          board?: string
          board_side_size?: number
          bonus_words?: Json
          game_id?: string
          legal_band?: number
          min_word_length?: number
          required_band?: number
          required_words?: Json
          required_words_count?: number
          required_words_score?: number
          target_win_percent?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _finish: {
        Args: {
          p_ended_by_user_id: string
          p_game_id: string
          p_reason_detail: string
        }
        Returns: undefined
      }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_board: Json
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
      submit_word: {
        Args: {
          p_game_id: string
          p_is_bonus: boolean
          p_points: number
          p_word: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  codenamesduet: {
    Tables: {
      events: {
        Row: {
          clue_count: number | null
          clue_from_ai: boolean | null
          clue_word: string | null
          created_at: string
          game_id: string
          guess_position: number | null
          guess_result: string | null
          id: number
          kind: string
          seat: string
          took_turn: boolean
          turn_number: number
          user_id: string
        }
        Insert: {
          clue_count?: number | null
          clue_from_ai?: boolean | null
          clue_word?: string | null
          created_at?: string
          game_id: string
          guess_position?: number | null
          guess_result?: string | null
          id?: never
          kind: string
          seat: string
          took_turn?: boolean
          turn_number: number
          user_id: string
        }
        Update: {
          clue_count?: number | null
          clue_from_ai?: boolean | null
          clue_word?: string | null
          created_at?: string
          game_id?: string
          guess_position?: number | null
          guess_result?: string | null
          id?: never
          kind?: string
          seat?: string
          took_turn?: boolean
          turn_number?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          current_clue_giver: string | null
          game_id: string
          key_card_a: Json
          key_card_b: Json
          max_turns: number
          player_a_user_id: string
          player_b_user_id: string
          turn_number: number
        }
        Insert: {
          current_clue_giver?: string | null
          game_id: string
          key_card_a: Json
          key_card_b: Json
          max_turns: number
          player_a_user_id: string
          player_b_user_id: string
          turn_number?: number
        }
        Update: {
          current_clue_giver?: string | null
          game_id?: string
          key_card_a?: Json
          key_card_b?: Json
          max_turns?: number
          player_a_user_id?: string
          player_b_user_id?: string
          turn_number?: number
        }
        Relationships: []
      }
      word_pool: {
        Row: {
          word: string
        }
        Insert: {
          word: string
        }
        Update: {
          word?: string
        }
        Relationships: []
      }
      words: {
        Row: {
          game_id: string
          neutral_a: boolean
          neutral_b: boolean
          position: number
          revealed_as: string | null
          word: string
        }
        Insert: {
          game_id: string
          neutral_a?: boolean
          neutral_b?: boolean
          position: number
          revealed_as?: string | null
          word: string
        }
        Update: {
          game_id?: string
          neutral_a?: boolean
          neutral_b?: boolean
          position?: number
          revealed_as?: string | null
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "words_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _end_turn: { Args: { p_game_id: string }; Returns: Json }
      _point_turn: { Args: { p_game_id: string }; Returns: undefined }
      _require_clue_giver: { Args: { p_game_id: string }; Returns: string }
      _seat_has_agents_left: {
        Args: { p_game_id: string; p_seat: string }
        Returns: boolean
      }
      _turns_remaining: {
        Args: { p_max_turns: number; p_turn_number: number }
        Returns: number
      }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      create_game: {
        Args: {
          p_club_handle: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      get_clue_context: { Args: { p_game_id: string }; Returns: Json }
      log_hint: { Args: { p_game_id: string }; Returns: Json }
      pass_turn: { Args: { p_game_id: string }; Returns: Json }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_clue: {
        Args: {
          p_clue_count: number
          p_clue_from_ai?: boolean
          p_clue_word: string
          p_game_id: string
        }
        Returns: Json
      }
      submit_guess: {
        Args: { p_game_id: string; p_guess_position: number }
        Returns: Json
      }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  common: {
    Tables: {
      clubs: {
        Row: {
          created_at: string
          created_by: string
          handle: string
          is_solo: boolean
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          handle: string
          is_solo?: boolean
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          handle?: string
          is_solo?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      clubs_gametypes: {
        Row: {
          added_at: string
          club_handle: string
          default_setup: Json | null
          gametype: string
        }
        Insert: {
          added_at?: string
          club_handle: string
          default_setup?: Json | null
          gametype: string
        }
        Update: {
          added_at?: string
          club_handle?: string
          default_setup?: Json | null
          gametype?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_gametypes_club_handle_fkey"
            columns: ["club_handle"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["handle"]
          },
          {
            foreignKeyName: "clubs_gametypes_gametype_fkey"
            columns: ["gametype"]
            isOneToOne: false
            referencedRelation: "gametypes"
            referencedColumns: ["gametype"]
          },
        ]
      }
      clubs_members: {
        Row: {
          club_handle: string
          joined_at: string
          user_id: string
        }
        Insert: {
          club_handle: string
          joined_at?: string
          user_id: string
        }
        Update: {
          club_handle?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_members_club_handle_fkey"
            columns: ["club_handle"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["handle"]
          },
          {
            foreignKeyName: "clubs_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      game_players: {
        Row: {
          final_ranking: number | null
          game_id: string
          joined_at: string
          outcome: string | null
          player_ended_at: string | null
          player_ended_reason: string | null
          player_ended_reason_detail: string | null
          player_status: Json
          solved_at: string | null
          turn_seat: number | null
          user_id: string
        }
        Insert: {
          final_ranking?: number | null
          game_id: string
          joined_at?: string
          outcome?: string | null
          player_ended_at?: string | null
          player_ended_reason?: string | null
          player_ended_reason_detail?: string | null
          player_status?: Json
          solved_at?: string | null
          turn_seat?: number | null
          user_id: string
        }
        Update: {
          final_ranking?: number | null
          game_id?: string
          joined_at?: string
          outcome?: string | null
          player_ended_at?: string | null
          player_ended_reason?: string | null
          player_ended_reason_detail?: string | null
          player_status?: Json
          solved_at?: string | null
          turn_seat?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      game_scratchpads: {
        Row: {
          body: string
          game_id: string
          id: string
          owner_id: string | null
          version: number
        }
        Insert: {
          body?: string
          game_id: string
          id?: string
          owner_id?: string | null
          version?: number
        }
        Update: {
          body?: string
          game_id?: string
          id?: string
          owner_id?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_scratchpads_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_scratchpads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      games: {
        Row: {
          club_handle: string
          clubpage_info: Json
          created_by: string | null
          current_turn_user_id: string | null
          ended_at: string | null
          game_ended_by_user_id: string | null
          game_ended_outcome: string | null
          game_ended_reason: string | null
          game_ended_reason_detail: string | null
          game_status: Json
          gametype: string
          id: string
          is_current_view: boolean
          mode: string
          restart_count: number
          setup: Json
          started_at: string
          status_changed_at: string
          title: string
          updated_at: string
        }
        Insert: {
          club_handle: string
          clubpage_info?: Json
          created_by?: string | null
          current_turn_user_id?: string | null
          ended_at?: string | null
          game_ended_by_user_id?: string | null
          game_ended_outcome?: string | null
          game_ended_reason?: string | null
          game_ended_reason_detail?: string | null
          game_status?: Json
          gametype: string
          id?: string
          is_current_view?: boolean
          mode: string
          restart_count?: number
          setup: Json
          started_at?: string
          status_changed_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          club_handle?: string
          clubpage_info?: Json
          created_by?: string | null
          current_turn_user_id?: string | null
          ended_at?: string | null
          game_ended_by_user_id?: string | null
          game_ended_outcome?: string | null
          game_ended_reason?: string | null
          game_ended_reason_detail?: string | null
          game_status?: Json
          gametype?: string
          id?: string
          is_current_view?: boolean
          mode?: string
          restart_count?: number
          setup?: Json
          started_at?: string
          status_changed_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_club_handle_fkey"
            columns: ["club_handle"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["handle"]
          },
          {
            foreignKeyName: "games_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "games_current_turn_user_id_fkey"
            columns: ["current_turn_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "games_game_ended_by_user_id_fkey"
            columns: ["game_ended_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "games_gametype_fkey"
            columns: ["gametype"]
            isOneToOne: false
            referencedRelation: "gametypes"
            referencedColumns: ["gametype"]
          },
        ]
      }
      gametypes: {
        Row: {
          default_enroll: boolean
          gametype: string
          min_players: number
        }
        Insert: {
          default_enroll?: boolean
          gametype: string
          min_players?: number
        }
        Update: {
          default_enroll?: boolean
          gametype?: string
          min_players?: number
        }
        Relationships: []
      }
      messages: {
        Row: {
          club_handle: string
          content: string
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          club_handle: string
          content: string
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          club_handle?: string
          content?: string
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_club_handle_fkey"
            columns: ["club_handle"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["handle"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          ai_member: boolean
          can_edit_words: boolean
          color: string
          created_at: string
          sounds_enabled: boolean
          theme: string | null
          user_id: string
          username: string
        }
        Insert: {
          ai_member?: boolean
          can_edit_words?: boolean
          color: string
          created_at?: string
          sounds_enabled?: boolean
          theme?: string | null
          user_id: string
          username: string
        }
        Update: {
          ai_member?: boolean
          can_edit_words?: boolean
          color?: string
          created_at?: string
          sounds_enabled?: boolean
          theme?: string | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      timers: {
        Row: {
          countdown_seconds_at_setup: number | null
          game_id: string
          kind: string
          last_tick: string
          ticks: number
        }
        Insert: {
          countdown_seconds_at_setup?: number | null
          game_id: string
          kind: string
          last_tick?: string
          ticks?: number
        }
        Update: {
          countdown_seconds_at_setup?: number | null
          game_id?: string
          kind?: string
          last_tick?: string
          ticks?: number
        }
        Relationships: [
          {
            foreignKeyName: "timers_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      words: {
        Row: {
          american: boolean
          australian: boolean
          british: boolean
          canadian: boolean
          crude: number
          definition: string | null
          definition_source: string | null
          difficulty: number
          hint: string | null
          len: number
          letter_mask: number | null
          root_word: string | null
          slang: boolean
          slur: number
          word: string
          wordle: boolean
        }
        Insert: {
          american: boolean
          australian: boolean
          british: boolean
          canadian: boolean
          crude?: number
          definition?: string | null
          definition_source?: string | null
          difficulty: number
          hint?: string | null
          len: number
          letter_mask?: number | null
          root_word?: string | null
          slang?: boolean
          slur?: number
          word: string
          wordle?: boolean
        }
        Update: {
          american?: boolean
          australian?: boolean
          british?: boolean
          canadian?: boolean
          crude?: number
          definition?: string | null
          definition_source?: string | null
          difficulty?: number
          hint?: string | null
          len?: number
          letter_mask?: number | null
          root_word?: string | null
          slang?: boolean
          slur?: number
          word?: string
          wordle?: boolean
        }
        Relationships: []
      }
      words_edits: {
        Row: {
          edited_at: string
          edited_by: string
          edited_by_username: string
          id: number
          kind: string
          new: Json | null
          note: string | null
          old: Json | null
          word: string
        }
        Insert: {
          edited_at?: string
          edited_by: string
          edited_by_username: string
          id?: never
          kind: string
          new?: Json | null
          note?: string | null
          old?: Json | null
          word: string
        }
        Update: {
          edited_at?: string
          edited_by?: string
          edited_by_username?: string
          id?: never
          kind?: string
          new?: Json | null
          note?: string | null
          old?: Json | null
          word?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _advance_turn: { Args: { p_game_id: string }; Returns: undefined }
      _anagram_fits: {
        Args: { floats: number[]; pat: string; w: string; wilds: number }
        Returns: boolean
      }
      _assign_turn_order: {
        Args: { first_user_id: string; target_game: string }
        Returns: undefined
      }
      _color_for_username: { Args: { username: string }; Returns: string }
      _concede: { Args: { p_game_id: string }; Returns: string }
      _create_game: {
        Args: {
          p_club_handle: string
          p_default_setup: Json
          p_gametype: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
          p_title: string
        }
        Returns: string
      }
      _default_gametypes_for_club: {
        Args: { target_handle: string }
        Returns: {
          gametype: string
        }[]
      }
      _end_game: {
        Args: {
          p_ended_by_user_id: string
          p_final_rankings: Json
          p_game_id: string
          p_is_no_result: boolean
          p_reason: string
          p_reason_detail: string
        }
        Returns: undefined
      }
      _is_club_member: { Args: { target_club: string }; Returns: boolean }
      _ok_envelope: {
        Args: { data?: Json; message?: string; meta?: Json; outcome?: string }
        Returns: Json
      }
      _raise_already_conceded: { Args: never; Returns: undefined }
      _raise_game_deleted: { Args: { p_schema: string }; Returns: undefined }
      _raise_game_over: { Args: never; Returns: undefined }
      _raised_envelope: {
        Args: {
          detail?: string
          field?: string
          hint: string
          message: string
          outcome?: string
          sqlstate_code: string
        }
        Returns: Json
      }
      _rank_idx: { Args: { score: number; total: number }; Returns: number }
      _require_club_member: { Args: { target_club: string }; Returns: string }
      _require_compete: { Args: { p_mode: string }; Returns: undefined }
      _require_game_player: { Args: { target_game: string }; Returns: string }
      _require_player_count_max: {
        Args: { max_count: number; player_user_ids: string[] }
        Returns: undefined
      }
      _require_turn: {
        Args: { caller: string; target_game: string }
        Returns: undefined
      }
      _require_valid_mode: { Args: { p_mode: string }; Returns: undefined }
      _require_valid_timer: { Args: { timer: Json }; Returns: undefined }
      _require_word_editor: {
        Args: never
        Returns: {
          editor_id: string
          editor_username: string
        }[]
      }
      _reset_game: { Args: { p_game_id: string }; Returns: undefined }
      _set_player_ended: {
        Args: {
          p_game_id: string
          p_reason: string
          p_reason_detail: string
          p_user_id: string
        }
        Returns: undefined
      }
      _slugify_club_name: { Args: { name: string }; Returns: string }
      _stop: { Args: { p_game_id: string }; Returns: string }
      _validate_word_fields: { Args: { fields: Json }; Returns: undefined }
      _wordle_colors: {
        Args: { answer: string; guess: string }
        Returns: string
      }
      add_word: {
        Args: { fields: Json; new_word: string; note?: string }
        Returns: Json
      }
      anagrams: { Args: { letters: string }; Returns: Json }
      cache_definition: {
        Args: { p_def: string; p_source: string; p_word: string }
        Returns: undefined
      }
      claim_username: {
        Args: { chosen_color: string; desired: string }
        Returns: Json
      }
      create_club: {
        Args: { club_name: string; member_usernames: string[] }
        Returns: Json
      }
      delete_game: { Args: { target_game: string }; Returns: Json }
      delete_word: {
        Args: { note?: string; target_word: string }
        Returns: Json
      }
      get_club_page: { Args: { target_handle: string }; Returns: Json }
      send_message: {
        Args: { content: string; target_club: string }
        Returns: Json
      }
      set_club_gametypes: {
        Args: { gametypes: string[]; target_club: string }
        Returns: Json
      }
      set_current_view: { Args: { target_game: string }; Returns: Json }
      set_scratchpad: {
        Args: { p_body: string; p_owner_id: string; target_game: string }
        Returns: Json
      }
      tick_timer: { Args: { target_game: string }; Returns: Json }
      unset_current_view: { Args: { target_game: string }; Returns: Json }
      update_profile: {
        Args: { new_color: string; new_sounds_enabled: boolean }
        Returns: Json
      }
      update_word: {
        Args: { note?: string; patch: Json; target_word: string }
        Returns: Json
      }
      word_letter_mask: { Args: { w: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  connections: {
    Tables: {
      events: {
        Row: {
          created_at: string
          game_id: string
          id: number
          kind: string
          matched_category_rank: number | null
          result: string
          tiles: string[]
          took_turn: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: never
          kind: string
          matched_category_rank?: number | null
          result: string
          tiles: string[]
          took_turn?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: never
          kind?: string
          matched_category_rank?: number | null
          result?: string
          tiles?: string[]
          took_turn?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          board: Json
          game_id: string
          puzzle_date: string | null
          puzzle_id: string | null
        }
        Insert: {
          board: Json
          game_id: string
          puzzle_date?: string | null
          puzzle_id?: string | null
        }
        Update: {
          board?: Json
          game_id?: string
          puzzle_date?: string | null
          puzzle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "puzzles"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          found_categories_count: number
          game_id: string
          mistake_count: number
          user_id: string
        }
        Insert: {
          found_categories_count?: number
          game_id: string
          mistake_count?: number
          user_id: string
        }
        Update: {
          found_categories_count?: number
          game_id?: string
          mistake_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
        ]
      }
      puzzles: {
        Row: {
          categories: Json
          id: string
          imported_at: string
          puzzle_date: string | null
          source_id: string
        }
        Insert: {
          categories: Json
          id?: string
          imported_at?: string
          puzzle_date?: string | null
          source_id: string
        }
        Update: {
          categories?: Json
          id?: string
          imported_at?: string
          puzzle_date?: string | null
          source_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _maybe_finish_compete: {
        Args: {
          p_ended_by_user_id: string
          p_game_id: string
          p_reason: string
          p_reason_detail: string
        }
        Returns: boolean
      }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      next_puzzle_for_club: { Args: { p_seen_by: string[] }; Returns: Json }
      puzzle_for_date: { Args: { target_date: string }; Returns: Json }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_guess: {
        Args: {
          p_game_id: string
          p_matched_category_rank?: number
          p_result: string
          p_tiles: string[]
        }
        Returns: Json
      }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  crosswords: {
    Tables: {
      cells: {
        Row: {
          col: number
          fill: string | null
          game_id: string
          id: string
          mark_bottom: string | null
          mark_right: string | null
          owner_id: string | null
          pencil: boolean
          revealed: boolean
          row: number
          version: number
          wrong: boolean
        }
        Insert: {
          col: number
          fill?: string | null
          game_id: string
          id?: string
          mark_bottom?: string | null
          mark_right?: string | null
          owner_id?: string | null
          pencil?: boolean
          revealed?: boolean
          row: number
          version?: number
          wrong?: boolean
        }
        Update: {
          col?: number
          fill?: string | null
          game_id?: string
          id?: string
          mark_bottom?: string | null
          mark_right?: string | null
          owner_id?: string | null
          pencil?: boolean
          revealed?: boolean
          row?: number
          version?: number
          wrong?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cells_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "cells_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          game_id: string
          puzzle_content: Json
          puzzle_date: string | null
          puzzle_id: string | null
          solution: Json
        }
        Insert: {
          game_id: string
          puzzle_content: Json
          puzzle_date?: string | null
          puzzle_id?: string | null
          solution: Json
        }
        Update: {
          game_id?: string
          puzzle_content?: Json
          puzzle_date?: string | null
          puzzle_id?: string | null
          solution?: Json
        }
        Relationships: [
          {
            foreignKeyName: "games_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "puzzles"
            referencedColumns: ["id"]
          },
        ]
      }
      puzzles: {
        Row: {
          content_hash: string
          created_at: string
          id: string
          puzzle_content: Json
          solution: Json
          source: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          id?: string
          puzzle_content: Json
          solution: Json
          source: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          id?: string
          puzzle_content?: Json
          solution?: Json
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      games_state: {
        Row: {
          game_id: string | null
          puzzle_content: Json | null
          puzzle_id: string | null
          solution: Json | null
        }
        Insert: {
          game_id?: string | null
          puzzle_content?: Json | null
          puzzle_id?: string | null
          solution?: never
        }
        Update: {
          game_id?: string | null
          puzzle_content?: Json | null
          puzzle_id?: string | null
          solution?: never
        }
        Relationships: [
          {
            foreignKeyName: "games_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "puzzles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _is_solved: {
        Args: { p_game_id: string; p_owner_id: string }
        Returns: boolean
      }
      _matches: { Args: { p_fill: string; p_sols: Json }; Returns: boolean }
      _maybe_finish: {
        Args: { p_caller: string; p_game_id: string; p_owner_id: string }
        Returns: boolean
      }
      _require_cell_write: { Args: { p_game_id: string }; Returns: string }
      _solution_for: { Args: { p_game_id: string }; Returns: Json }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      check_cells: { Args: { p_cells: Json; p_game_id: string }; Returns: Json }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_board?: Json
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      export_solution: { Args: { p_game_id: string }; Returns: Json }
      library_for_club: { Args: { p_club_handle: string }; Returns: Json }
      next_nyt_date_for_club: {
        Args: { p_dow: number; p_seen_by: string[] }
        Returns: Json
      }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      reveal_cells: {
        Args: { p_cells: Json; p_game_id: string }
        Returns: Json
      }
      reveal_solved_word: {
        Args: { p_cells: Json; p_game_id: string }
        Returns: Json
      }
      set_cell: {
        Args: {
          p_col: number
          p_fill: string
          p_game_id: string
          p_pencil: boolean
          p_row: number
        }
        Returns: Json
      }
      set_mark: {
        Args: {
          p_col: number
          p_game_id: string
          p_mark: string
          p_row: number
          p_side: string
        }
        Returns: Json
      }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  letterboxed: {
    Tables: {
      events: {
        Row: {
          created_at: string
          game_id: string
          id: number
          kind: string
          letters_covered: number
          took_turn: boolean
          user_id: string
          word: string | null
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: never
          kind: string
          letters_covered: number
          took_turn?: boolean
          user_id: string
          word?: string | null
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: never
          kind?: string
          letters_covered?: number
          took_turn?: boolean
          user_id?: string
          word?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          game_id: string
          legal_band: number
          legal_words: Json
          max_words: number
          sides: string
          solution: string[]
        }
        Insert: {
          game_id: string
          legal_band: number
          legal_words: Json
          max_words: number
          sides: string
          solution: string[]
        }
        Update: {
          game_id?: string
          legal_band?: number
          legal_words?: Json
          max_words?: number
          sides?: string
          solution?: string[]
        }
        Relationships: []
      }
      players: {
        Row: {
          chain: string[]
          game_id: string
          hints_used: number
          user_id: string
        }
        Insert: {
          chain?: string[]
          game_id: string
          hints_used?: number
          user_id: string
        }
        Update: {
          chain?: string[]
          game_id?: string
          hints_used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      seeds: {
        Row: {
          difficulty: number
          letters: string
          mask: number | null
          word_a: string
          word_b: string
        }
        Insert: {
          difficulty: number
          letters: string
          mask?: number | null
          word_a: string
          word_b: string
        }
        Update: {
          difficulty?: number
          letters?: string
          mask?: number | null
          word_a?: string
          word_b?: string
        }
        Relationships: []
      }
    }
    Views: {
      games_state: {
        Row: {
          clean_words: Json | null
          game_id: string | null
          legal_band: number | null
          legal_words: Json | null
          max_words: number | null
          sides: string | null
          solution: string[] | null
        }
        Insert: {
          clean_words?: never
          game_id?: string | null
          legal_band?: number | null
          legal_words?: Json | null
          max_words?: number | null
          sides?: string | null
          solution?: string[] | null
        }
        Update: {
          clean_words?: never
          game_id?: string | null
          legal_band?: number | null
          legal_words?: Json | null
          max_words?: number | null
          sides?: string | null
          solution?: string[] | null
        }
        Relationships: []
      }
      players_state: {
        Row: {
          chain: string[] | null
          game_id: string | null
          hints_used: number | null
          letters_covered: number | null
          user_id: string | null
          word_count: number | null
        }
        Insert: {
          chain?: never
          game_id?: string | null
          hints_used?: number | null
          letters_covered?: never
          user_id?: string | null
          word_count?: never
        }
        Update: {
          chain?: never
          game_id?: string | null
          hints_used?: number | null
          letters_covered?: never
          user_id?: string | null
          word_count?: never
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
    }
    Functions: {
      _chain_for: {
        Args: { p_game_id: string; p_user_id: string }
        Returns: string[]
      }
      _covered: { Args: { p_chain: string[] }; Returns: number }
      _covered_for: {
        Args: { p_game_id: string; p_user_id: string }
        Returns: number
      }
      _require_chain_move: { Args: { p_game_id: string }; Returns: string }
      _word_count_for: {
        Args: { p_game_id: string; p_user_id: string }
        Returns: number
      }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      candidate_words: {
        Args: { p_board_mask: number; p_max_band: number }
        Returns: {
          is_clean: boolean
          word: string
        }[]
      }
      clear_chain: { Args: { p_game_id: string }; Returns: Json }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_board: Json
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      log_hint_or_spoiler: {
        Args: { p_game_id: string; p_kind: string; p_word_shown: string }
        Returns: Json
      }
      pick_seed: {
        Args: { p_max_band: number }
        Returns: {
          difficulty: number
          letters: string
          word_a: string
          word_b: string
        }[]
      }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      seed_for: {
        Args: { p_board_letters: string }
        Returns: {
          difficulty: number
          letters: string
          word_a: string
          word_b: string
        }[]
      }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
      submit_word: {
        Args: { p_game_id: string; p_word: string }
        Returns: Json
      }
      undo_word: { Args: { p_game_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  psychicnum: {
    Tables: {
      events: {
        Row: {
          created_at: string
          game_id: string
          id: number
          is_correct: boolean
          kind: string
          took_turn: boolean
          user_id: string
          word: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: never
          is_correct: boolean
          kind: string
          took_turn?: boolean
          user_id: string
          word: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: never
          is_correct?: boolean
          kind?: string
          took_turn?: boolean
          user_id?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          game_id: string
          max_guesses: number
          secrets: string[]
          words: string[]
        }
        Insert: {
          game_id: string
          max_guesses: number
          secrets: string[]
          words: string[]
        }
        Update: {
          game_id?: string
          max_guesses?: number
          secrets?: string[]
          words?: string[]
        }
        Relationships: []
      }
      players: {
        Row: {
          found_secrets_count: number
          game_id: string
          guesses_used: number
          user_id: string
        }
        Insert: {
          found_secrets_count?: number
          game_id: string
          guesses_used?: number
          user_id: string
        }
        Update: {
          found_secrets_count?: number
          game_id?: string
          guesses_used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
    }
    Views: {
      games_state: {
        Row: {
          game_id: string | null
          max_guesses: number | null
          secrets: string[] | null
          words: string[] | null
        }
        Insert: {
          game_id?: string | null
          max_guesses?: number | null
          secrets?: never
          words?: string[] | null
        }
        Update: {
          game_id?: string | null
          max_guesses?: number | null
          secrets?: never
          words?: string[] | null
        }
        Relationships: []
      }
    }
    Functions: {
      _maybe_finish_compete: {
        Args: { p_ended_by_user_id: string; p_game_id: string }
        Returns: boolean
      }
      _secrets_for: { Args: { p_game_id: string }; Returns: string[] }
      _unfound_secret: {
        Args: { p_game_id: string; p_user_id: string }
        Returns: string
      }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      request_hint: { Args: { p_game_id: string }; Returns: Json }
      request_spoiler: { Args: { p_game_id: string }; Returns: Json }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_guess: {
        Args: { p_game_id: string; p_guess: string }
        Returns: Json
      }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  scrabble: {
    Tables: {
      events: {
        Row: {
          created_at: string
          game_id: string
          id: number
          kind: string
          placements: Json | null
          score: number | null
          tile_count: number | null
          took_turn: boolean
          user_id: string
          words: string[] | null
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: never
          kind: string
          placements?: Json | null
          score?: number | null
          tile_count?: number | null
          took_turn?: boolean
          user_id: string
          words?: string[] | null
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: never
          kind?: string
          placements?: Json | null
          score?: number | null
          tile_count?: number | null
          took_turn?: boolean
          user_id?: string
          words?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          bag: string[]
          board: Json
          consecutive_passes: number
          coop_rack: string[] | null
          coop_score: number | null
          dict_2: number
          dict_3plus: number
          game_id: string
          version: number
        }
        Insert: {
          bag: string[]
          board: Json
          consecutive_passes?: number
          coop_rack?: string[] | null
          coop_score?: number | null
          dict_2: number
          dict_3plus: number
          game_id: string
          version?: number
        }
        Update: {
          bag?: string[]
          board?: Json
          consecutive_passes?: number
          coop_rack?: string[] | null
          coop_score?: number | null
          dict_2?: number
          dict_3plus?: number
          game_id?: string
          version?: number
        }
        Relationships: []
      }
      players: {
        Row: {
          ai_level: string | null
          game_id: string
          rack: string[] | null
          score: number | null
          user_id: string
        }
        Insert: {
          ai_level?: string | null
          game_id: string
          rack?: string[] | null
          score?: number | null
          user_id: string
        }
        Update: {
          ai_level?: string | null
          game_id?: string
          rack?: string[] | null
          score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
    }
    Views: {
      games_state: {
        Row: {
          bag: string[] | null
          board: Json | null
          consecutive_passes: number | null
          coop_rack: string[] | null
          coop_score: number | null
          game_id: string | null
          version: number | null
        }
        Insert: {
          bag?: string[] | null
          board?: Json | null
          consecutive_passes?: number | null
          coop_rack?: string[] | null
          coop_score?: number | null
          game_id?: string | null
          version?: number | null
        }
        Update: {
          bag?: string[] | null
          board?: Json | null
          consecutive_passes?: number | null
          coop_rack?: string[] | null
          coop_score?: number | null
          game_id?: string | null
          version?: number | null
        }
        Relationships: []
      }
      players_state: {
        Row: {
          ai_level: string | null
          game_id: string | null
          rack: string[] | null
          rack_count: number | null
          score: number | null
          user_id: string | null
        }
        Insert: {
          ai_level?: string | null
          game_id?: string | null
          rack?: never
          rack_count?: never
          score?: number | null
          user_id?: string | null
        }
        Update: {
          ai_level?: string | null
          game_id?: string | null
          rack?: never
          rack_count?: never
          score?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
    }
    Functions: {
      _commit_exchange: {
        Args: {
          p_base_version: number
          p_game_id: string
          p_rack_tiles: string[]
          p_user_id: string
        }
        Returns: Json
      }
      _commit_pass: {
        Args: { p_base_version: number; p_game_id: string; p_user_id: string }
        Returns: Json
      }
      _commit_word: {
        Args: {
          p_base_version: number
          p_game_id: string
          p_placements: Json
          p_score: number
          p_user_id: string
          p_words: string[]
        }
        Returns: Json
      }
      _finish: {
        Args: {
          p_ended_by_user_id: string
          p_game_id: string
          p_going_out_user_id: string
          p_reason: string
          p_reason_detail: string
        }
        Returns: undefined
      }
      _maybe_finish_compete: {
        Args: { p_ended_by_user_id: string; p_game_id: string }
        Returns: boolean
      }
      _new_bag: { Args: never; Returns: string[] }
      _rack_count_for: {
        Args: { p_game_id: string; p_user_id: string }
        Returns: number
      }
      _rack_for: {
        Args: { p_game_id: string; p_user_id: string }
        Returns: string[]
      }
      _remove_tiles: {
        Args: { p_rack: string[]; p_remove: string[] }
        Returns: string[]
      }
      _require_bot: {
        Args: { p_code: string; p_game_id: string; p_user_id: string }
        Returns: string
      }
      _require_move: {
        Args: { p_base_version: number; p_game_id: string; p_race_code: string }
        Returns: {
          bag: string[]
          board: Json
          consecutive_passes: number
          coop_rack: string[] | null
          coop_score: number | null
          dict_2: number
          dict_3plus: number
          game_id: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "games"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _require_person: {
        Args: { p_code: string; p_game_id: string }
        Returns: string
      }
      _score_leftovers: {
        Args: { p_game_id: string; p_going_out_user_id: string }
        Returns: undefined
      }
      _tile_value: { Args: { p_tile: string }; Returns: number }
      _title_for: { Args: { p_game_id: string }; Returns: string }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      ai_exchange_tiles: {
        Args: {
          p_base_version: number
          p_game_id: string
          p_rack_tiles: string[]
          p_user_id: string
        }
        Returns: Json
      }
      ai_pass_turn: {
        Args: { p_base_version: number; p_game_id: string; p_user_id: string }
        Returns: Json
      }
      ai_play_word: {
        Args: {
          p_base_version: number
          p_game_id: string
          p_placements: Json
          p_score: number
          p_user_id: string
          p_words: string[]
        }
        Returns: Json
      }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      exchange_tiles: {
        Args: {
          p_base_version: number
          p_game_id: string
          p_rack_tiles: string[]
        }
        Returns: Json
      }
      get_ai_context: { Args: { p_game_id: string }; Returns: Json }
      get_suggest_context: { Args: { p_game_id: string }; Returns: Json }
      pass_turn: {
        Args: { p_base_version: number; p_game_id: string }
        Returns: Json
      }
      play_word: {
        Args: {
          p_base_version: number
          p_game_id: string
          p_placements: Json
          p_score: number
          p_words: string[]
        }
        Returns: Json
      }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  setgame: {
    Tables: {
      events: {
        Row: {
          board_after: number[]
          cards: number[]
          created_at: string
          game_id: string
          id: number
          kind: string
          took_turn: boolean
          user_id: string
        }
        Insert: {
          board_after: number[]
          cards: number[]
          created_at?: string
          game_id: string
          id?: never
          kind: string
          took_turn?: boolean
          user_id: string
        }
        Update: {
          board_after?: number[]
          cards?: number[]
          created_at?: string
          game_id?: string
          id?: never
          kind?: string
          took_turn?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          board: number[]
          deck: number[]
          deck_kind: string
          deck_pos: number
          game_id: string
          palette: string
        }
        Insert: {
          board: number[]
          deck: number[]
          deck_kind: string
          deck_pos?: number
          game_id: string
          palette: string
        }
        Update: {
          board?: number[]
          deck?: number[]
          deck_kind?: string
          deck_pos?: number
          game_id?: string
          palette?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          game_id: string
          hints_used: number
          sets_found: number
          user_id: string
        }
        Insert: {
          game_id: string
          hints_used?: number
          sets_found?: number
          user_id: string
        }
        Update: {
          game_id?: string
          hints_used?: number
          sets_found?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
    }
    Views: {
      games_state: {
        Row: {
          board: number[] | null
          deck_kind: string | null
          deck_left: number | null
          game_id: string | null
          palette: string | null
        }
        Insert: {
          board?: number[] | null
          deck_kind?: string | null
          deck_left?: never
          game_id?: string | null
          palette?: string | null
        }
        Update: {
          board?: number[] | null
          deck_kind?: string | null
          deck_left?: never
          game_id?: string | null
          palette?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _board_min: { Args: { p_deck_kind: string }; Returns: number }
      _deal_to_playable: {
        Args: {
          p_board: number[]
          p_deck: number[]
          p_deck_kind: string
          p_deck_pos: number
        }
        Returns: Record<string, unknown>
      }
      _deck_size: { Args: { p_deck_kind: string }; Returns: number }
      _find_set: { Args: { p_cards: number[] }; Returns: number[] }
      _find_set_with: {
        Args: { p_card: number; p_cards: number[] }
        Returns: number[]
      }
      _finish: {
        Args: {
          p_ended_by_user_id: string
          p_game_id: string
          p_reason_detail: string
        }
        Returns: undefined
      }
      _is_set: {
        Args: { p_a: number; p_b: number; p_c: number }
        Returns: boolean
      }
      _third: { Args: { p_a: number; p_b: number }; Returns: number }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      record_hint: {
        Args: { p_cards: number[]; p_game_id: string }
        Returns: Json
      }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_set: {
        Args: { p_cards: number[]; p_game_id: string }
        Returns: Json
      }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  spellingbee: {
    Tables: {
      found_words: {
        Row: {
          found_at: string
          game_id: string
          is_bonus: boolean
          is_pangram: boolean
          points: number
          user_id: string
          word: string
        }
        Insert: {
          found_at?: string
          game_id: string
          is_bonus: boolean
          is_pangram: boolean
          points: number
          user_id: string
          word: string
        }
        Update: {
          found_at?: string
          game_id?: string
          is_bonus?: boolean
          is_pangram?: boolean
          points?: number
          user_id?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "found_words_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "found_words_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          bonus_words: Json
          center_letter: string
          game_id: string
          legal_band: number
          outer_letters: string
          required_band: number
          required_words: Json
          required_words_count: number
          required_words_score: number
          target_rank: number | null
        }
        Insert: {
          bonus_words: Json
          center_letter: string
          game_id: string
          legal_band: number
          outer_letters: string
          required_band: number
          required_words: Json
          required_words_count: number
          required_words_score: number
          target_rank?: number | null
        }
        Update: {
          bonus_words?: Json
          center_letter?: string
          game_id?: string
          legal_band?: number
          outer_letters?: string
          required_band?: number
          required_words?: Json
          required_words_count?: number
          required_words_score?: number
          target_rank?: number | null
        }
        Relationships: []
      }
      pangrams: {
        Row: {
          has_rare_letters: boolean
          mask: number
          required_words_count: number
        }
        Insert: {
          has_rare_letters: boolean
          mask: number
          required_words_count: number
        }
        Update: {
          has_rare_letters?: boolean
          mask?: number
          required_words_count?: number
        }
        Relationships: []
      }
    }
    Views: {
      games_state: {
        Row: {
          bonus_words: Json | null
          center_letter: string | null
          game_id: string | null
          legal_band: number | null
          outer_letters: string | null
          required_band: number | null
          required_words: Json | null
          required_words_count: number | null
          required_words_score: number | null
          target_rank: number | null
        }
        Insert: {
          bonus_words?: Json | null
          center_letter?: string | null
          game_id?: string | null
          legal_band?: number | null
          outer_letters?: string | null
          required_band?: number | null
          required_words?: Json | null
          required_words_count?: number | null
          required_words_score?: number | null
          target_rank?: number | null
        }
        Update: {
          bonus_words?: Json | null
          center_letter?: string | null
          game_id?: string | null
          legal_band?: number | null
          outer_letters?: string | null
          required_band?: number | null
          required_words?: Json | null
          required_words_count?: number | null
          required_words_score?: number | null
          target_rank?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      candidate_words: {
        Args: {
          p_center_bit: number
          p_legal_band: number
          p_puzzle_mask: number
          p_required_band: number
        }
        Returns: {
          is_required: boolean
          letter_mask: number
          word: string
        }[]
      }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_board: Json
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
      submit_word: {
        Args: {
          p_game_id: string
          p_is_bonus: boolean
          p_is_pangram: boolean
          p_points: number
          p_word: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  stackdown: {
    Tables: {
      boards: {
        Row: {
          band: number
          created_at: string
          id: string
          tiles: Json
          words: string[]
        }
        Insert: {
          band: number
          created_at?: string
          id?: string
          tiles: Json
          words: string[]
        }
        Update: {
          band?: number
          created_at?: string
          id?: string
          tiles?: Json
          words?: string[]
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          for_word_index: number | null
          game_id: string
          id: number
          kind: string
          tile_ids: number[] | null
          took_turn: boolean
          user_id: string
          valid: boolean | null
          word: string | null
        }
        Insert: {
          created_at?: string
          for_word_index?: number | null
          game_id: string
          id?: never
          kind: string
          tile_ids?: number[] | null
          took_turn?: boolean
          user_id: string
          valid?: boolean | null
          word?: string | null
        }
        Update: {
          created_at?: string
          for_word_index?: number | null
          game_id?: string
          id?: never
          kind?: string
          tile_ids?: number[] | null
          took_turn?: boolean
          user_id?: string
          valid?: boolean | null
          word?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          board_id: string | null
          game_id: string
          solution: string[]
          tiles: Json
        }
        Insert: {
          board_id?: string | null
          game_id: string
          solution: string[]
          tiles: Json
        }
        Update: {
          board_id?: string | null
          game_id?: string
          solution?: string[]
          tiles?: Json
        }
        Relationships: [
          {
            foreignKeyName: "games_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          found_count: number
          game_id: string
          user_id: string
        }
        Insert: {
          found_count?: number
          game_id: string
          user_id: string
        }
        Update: {
          found_count?: number
          game_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
    }
    Views: {
      games_state: {
        Row: {
          game_id: string | null
          solution: string[] | null
          tiles: Json | null
        }
        Insert: {
          game_id?: string | null
          solution?: never
          tiles?: Json | null
        }
        Update: {
          game_id?: string | null
          solution?: never
          tiles?: Json | null
        }
        Relationships: []
      }
    }
    Functions: {
      _found_title: { Args: { n: number; solution: string[] }; Returns: string }
      _is_exposed: {
        Args: { gone: number[]; tid: number; tiles: Json }
        Returns: boolean
      }
      _solution_for: { Args: { p_game_id: string }; Returns: string[] }
      _word: { Args: { ids: number[]; tiles: Json }; Returns: string }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      reveal_next_hint: { Args: { p_game_id: string }; Returns: Json }
      reveal_next_word: { Args: { p_game_id: string }; Returns: Json }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
      submit_word: {
        Args: { p_game_id: string; p_tile_ids: number[] }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  strands: {
    Tables: {
      events: {
        Row: {
          created_at: string
          game_id: string
          id: number
          kind: string
          path: Json
          result: string | null
          took_turn: boolean
          user_id: string
          word: string | null
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: never
          kind: string
          path: Json
          result?: string | null
          took_turn?: boolean
          user_id: string
          word?: string | null
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: never
          kind?: string
          path?: Json
          result?: string | null
          took_turn?: boolean
          user_id?: string
          word?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          band: number
          board: string[]
          game_id: string
          hint_cost: number
          min_word_length: number
          puzzle_date: string | null
          puzzle_id: string | null
          puzzle_title: string
          solution: Json
        }
        Insert: {
          band: number
          board: string[]
          game_id: string
          hint_cost: number
          min_word_length: number
          puzzle_date?: string | null
          puzzle_id?: string | null
          puzzle_title: string
          solution: Json
        }
        Update: {
          band?: number
          board?: string[]
          game_id?: string
          hint_cost?: number
          min_word_length?: number
          puzzle_date?: string | null
          puzzle_id?: string | null
          puzzle_title?: string
          solution?: Json
        }
        Relationships: [
          {
            foreignKeyName: "games_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "puzzles"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          active_hint_coords: Json | null
          game_id: string
          hint_points: number
          hints_spent: number
          user_id: string
        }
        Insert: {
          active_hint_coords?: Json | null
          game_id: string
          hint_points?: number
          hints_spent?: number
          user_id: string
        }
        Update: {
          active_hint_coords?: Json | null
          game_id?: string
          hint_points?: number
          hints_spent?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      puzzles: {
        Row: {
          board: string[]
          id: string
          imported_at: string
          puzzle_date: string
          solution: Json
          source_id: string
          title: string
        }
        Insert: {
          board: string[]
          id?: string
          imported_at?: string
          puzzle_date: string
          solution: Json
          source_id: string
          title: string
        }
        Update: {
          board?: string[]
          id?: string
          imported_at?: string
          puzzle_date?: string
          solution?: Json
          source_id?: string
          title?: string
        }
        Relationships: []
      }
    }
    Views: {
      games_state: {
        Row: {
          band: number | null
          board: string[] | null
          game_id: string | null
          hint_cost: number | null
          min_word_length: number | null
          puzzle_date: string | null
          puzzle_id: string | null
          puzzle_title: string | null
          solution: Json | null
        }
        Insert: {
          band?: number | null
          board?: string[] | null
          game_id?: string | null
          hint_cost?: number | null
          min_word_length?: number | null
          puzzle_date?: string | null
          puzzle_id?: string | null
          puzzle_title?: string | null
          solution?: never
        }
        Update: {
          band?: number | null
          board?: string[] | null
          game_id?: string | null
          hint_cost?: number | null
          min_word_length?: number | null
          puzzle_date?: string | null
          puzzle_id?: string | null
          puzzle_title?: string | null
          solution?: never
        }
        Relationships: [
          {
            foreignKeyName: "games_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "puzzles"
            referencedColumns: ["id"]
          },
        ]
      }
      players_state: {
        Row: {
          active_hint_coords: Json | null
          game_id: string | null
          hint_points: number | null
          hints_spent: number | null
          user_id: string | null
        }
        Insert: {
          active_hint_coords?: never
          game_id?: string | null
          hint_points?: never
          hints_spent?: number | null
          user_id?: string | null
        }
        Update: {
          active_hint_coords?: never
          game_id?: string | null
          hint_points?: never
          hints_spent?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
    }
    Functions: {
      _active_hint_for: {
        Args: { p_game_id: string; p_user_id: string }
        Returns: Json
      }
      _consumed_keys: {
        Args: { p_game_id: string; p_user_id: string }
        Returns: string[]
      }
      _finish_compete: {
        Args: {
          p_ended_by_user_id: string
          p_game_id: string
          p_reason: string
          p_reason_detail: string
        }
        Returns: undefined
      }
      _hint_points_for: {
        Args: { p_game_id: string; p_user_id: string }
        Returns: number
      }
      _maybe_finish_compete: {
        Args: {
          p_ended_by_user_id: string
          p_game_id: string
          p_reason: string
          p_reason_detail: string
        }
        Returns: boolean
      }
      _path_key: { Args: { p_coords: Json }; Returns: string[] }
      _player_state_visible: {
        Args: { p_game_id: string; p_user_id: string }
        Returns: boolean
      }
      _solution_for: { Args: { p_game_id: string }; Returns: Json }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      next_puzzle_for_club: { Args: { p_seen_by: string[] }; Returns: Json }
      puzzle_for_date: { Args: { p_date: string }; Returns: Json }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      spend_hint: { Args: { p_game_id: string }; Returns: Json }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_path: { Args: { p_game_id: string; p_path: Json }; Returns: Json }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  waffle: {
    Tables: {
      events: {
        Row: {
          colors: string
          created_at: string
          game_id: string
          id: number
          kind: string
          letter_a: string
          letter_b: string
          pos_a: number
          pos_b: number
          took_turn: boolean
          user_id: string
        }
        Insert: {
          colors: string
          created_at?: string
          game_id: string
          id?: never
          kind: string
          letter_a: string
          letter_b: string
          pos_a: number
          pos_b: number
          took_turn?: boolean
          user_id: string
        }
        Update: {
          colors?: string
          created_at?: string
          game_id?: string
          id?: never
          kind?: string
          letter_a?: string
          letter_b?: string
          pos_a?: number
          pos_b?: number
          took_turn?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          board_at_setup: string
          game_id: string
          max_swaps: number
          par_swaps: number
          solution: string
        }
        Insert: {
          board_at_setup: string
          game_id: string
          max_swaps: number
          par_swaps: number
          solution: string
        }
        Update: {
          board_at_setup?: string
          game_id?: string
          max_swaps?: number
          par_swaps?: number
          solution?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          board: string
          game_id: string
          swaps_used: number
          user_id: string
        }
        Insert: {
          board: string
          game_id: string
          swaps_used?: number
          user_id: string
        }
        Update: {
          board?: string
          game_id?: string
          swaps_used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
    }
    Views: {
      games_state: {
        Row: {
          board_at_setup: string | null
          game_id: string | null
          max_swaps: number | null
          par_swaps: number | null
          solution: string | null
        }
        Insert: {
          board_at_setup?: string | null
          game_id?: string | null
          max_swaps?: number | null
          par_swaps?: number | null
          solution?: never
        }
        Update: {
          board_at_setup?: string | null
          game_id?: string | null
          max_swaps?: number | null
          par_swaps?: number | null
          solution?: never
        }
        Relationships: []
      }
      players_state: {
        Row: {
          board: string | null
          colors: string | null
          game_id: string | null
          swaps_used: number | null
          user_id: string | null
        }
        Insert: {
          board?: never
          colors?: never
          game_id?: string | null
          swaps_used?: number | null
          user_id?: string | null
        }
        Update: {
          board?: never
          colors?: never
          game_id?: string | null
          swaps_used?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
    }
    Functions: {
      _board_colors: {
        Args: { board: string; solution: string }
        Returns: string
      }
      _board_visible: {
        Args: {
          cg: Database["waffle"]["Tables"]["games"]["Row"]
          row_user: string
        }
        Returns: boolean
      }
      _color_rank: { Args: { c: string }; Returns: number }
      _correct_words: {
        Args: { board: string; solution: string }
        Returns: string[]
      }
      _finish_compete: {
        Args: {
          p_ended_by_user_id: string
          p_game_id: string
          p_reason: string
          p_reason_detail: string
        }
        Returns: undefined
      }
      _format_title: {
        Args: { placeholder: string; words: string[] }
        Returns: string
      }
      _maybe_finish_compete: {
        Args: {
          p_ended_by_user_id: string
          p_game_id: string
          p_reason: string
          p_reason_detail: string
        }
        Returns: boolean
      }
      _player_board_for: {
        Args: { p_game_id: string; row_user: string }
        Returns: string
      }
      _player_colors_for: {
        Args: { p_game_id: string; row_user: string }
        Returns: string
      }
      _solution_for: { Args: { p_game_id: string }; Returns: string }
      _sync_title: { Args: { p_game_id: string }; Returns: undefined }
      _word_slots: {
        Args: never
        Returns: {
          start1: number
          stride: number
        }[]
      }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_board: Json
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_swap: {
        Args: { p_game_id: string; p_pos_a: number; p_pos_b: number }
        Returns: Json
      }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  wordiply: {
    Tables: {
      events: {
        Row: {
          created_at: string
          game_id: string
          id: number
          kind: string
          length: number
          reason: string | null
          took_turn: boolean
          user_id: string
          valid: boolean
          word: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: never
          kind: string
          length: number
          reason?: string | null
          took_turn?: boolean
          user_id: string
          valid?: boolean
          word: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: never
          kind?: string
          length?: number
          reason?: string | null
          took_turn?: boolean
          user_id?: string
          valid?: boolean
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          base: string
          game_id: string
          legal_words: Json
          longest_words: Json
          max_word_length: number
        }
        Insert: {
          base: string
          game_id: string
          legal_words: Json
          longest_words: Json
          max_word_length: number
        }
        Update: {
          base?: string
          game_id?: string
          legal_words?: Json
          longest_words?: Json
          max_word_length?: number
        }
        Relationships: []
      }
    }
    Views: {
      games_state: {
        Row: {
          base: string | null
          game_id: string | null
          legal_words: Json | null
          longest_words: Json | null
          max_word_length: number | null
        }
        Insert: {
          base?: string | null
          game_id?: string | null
          legal_words?: Json | null
          longest_words?: Json | null
          max_word_length?: number | null
        }
        Update: {
          base?: string | null
          game_id?: string | null
          legal_words?: Json | null
          longest_words?: Json | null
          max_word_length?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _finish_compete: {
        Args: {
          p_ended_by_user_id: string
          p_game_id: string
          p_reason: string
          p_reason_detail: string
        }
        Returns: undefined
      }
      _length_score: {
        Args: { p_longest: number; p_max_len: number }
        Returns: number
      }
      _maybe_finish_compete: {
        Args: {
          p_ended_by_user_id: string
          p_game_id: string
          p_reason: string
          p_reason_detail: string
        }
        Returns: boolean
      }
      _track_totals: {
        Args: { p_game_id: string }
        Returns: {
          guesses_used: number
          last_guess_at: string
          length_score: number
          letter_count: number
          longest: number
          user_id: string
        }[]
      }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      candidate_bases: {
        Args: { p_n: number; p_source_band: number }
        Returns: {
          base: string
        }[]
      }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_board: Json
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      matching_words: {
        Args: { p_base: string; p_legal_band: number }
        Returns: {
          len: number
          word: string
        }[]
      }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_guess: {
        Args: { p_fe_legal?: boolean; p_game_id: string; p_word: string }
        Returns: Json
      }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
      try_base: {
        Args: {
          p_base: string
          p_legal_band: number
          p_max_children: number
          p_min_children: number
          p_min_headroom: number
        }
        Returns: {
          legal_words: Json
          longest_words: Json
          max_word_length: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  wordle: {
    Tables: {
      events: {
        Row: {
          colors: string
          created_at: string
          game_id: string
          id: number
          is_correct: boolean
          kind: string
          took_turn: boolean
          user_id: string
          word: string
        }
        Insert: {
          colors: string
          created_at?: string
          game_id: string
          id?: never
          is_correct: boolean
          kind: string
          took_turn?: boolean
          user_id: string
          word: string
        }
        Update: {
          colors?: string
          created_at?: string
          game_id?: string
          id?: never
          is_correct?: boolean
          kind?: string
          took_turn?: boolean
          user_id?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          game_id: string
          legal_band: number
          max_guesses: number
          target: string
        }
        Insert: {
          game_id: string
          legal_band?: number
          max_guesses: number
          target: string
        }
        Update: {
          game_id?: string
          legal_band?: number
          max_guesses?: number
          target?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          game_id: string
          guesses_used: number
          user_id: string
        }
        Insert: {
          game_id: string
          guesses_used?: number
          user_id: string
        }
        Update: {
          game_id?: string
          guesses_used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
    }
    Views: {
      games_state: {
        Row: {
          game_id: string | null
          max_guesses: number | null
          target: string | null
        }
        Insert: {
          game_id?: string | null
          max_guesses?: number | null
          target?: never
        }
        Update: {
          game_id?: string | null
          max_guesses?: number | null
          target?: never
        }
        Relationships: []
      }
    }
    Functions: {
      _finish_compete: {
        Args: {
          p_ended_by_user_id: string
          p_game_id: string
          p_reason: string
          p_reason_detail: string
        }
        Returns: undefined
      }
      _maybe_finish_compete: {
        Args: {
          p_ended_by_user_id: string
          p_game_id: string
          p_reason: string
          p_reason_detail: string
        }
        Returns: boolean
      }
      _sync_title: { Args: { p_game_id: string }; Returns: undefined }
      _target_for: { Args: { p_game_id: string }; Returns: string }
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_guess: {
        Args: { p_game_id: string; p_guess: string }
        Returns: Json
      }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  wordwheel: {
    Tables: {
      found_words: {
        Row: {
          found_at: string
          game_id: string
          is_bonus: boolean
          is_pangram: boolean
          points: number
          user_id: string
          word: string
        }
        Insert: {
          found_at?: string
          game_id: string
          is_bonus: boolean
          is_pangram: boolean
          points: number
          user_id: string
          word: string
        }
        Update: {
          found_at?: string
          game_id?: string
          is_bonus?: boolean
          is_pangram?: boolean
          points?: number
          user_id?: string
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "found_words_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "found_words_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["game_id"]
          },
        ]
      }
      games: {
        Row: {
          bonus_words: Json
          center_letter: string
          game_id: string
          legal_band: number
          outer_letters: string
          required_band: number
          required_words: Json
          required_words_count: number
          required_words_score: number
          target_rank: number | null
        }
        Insert: {
          bonus_words: Json
          center_letter: string
          game_id: string
          legal_band: number
          outer_letters: string
          required_band: number
          required_words: Json
          required_words_count: number
          required_words_score: number
          target_rank?: number | null
        }
        Update: {
          bonus_words?: Json
          center_letter?: string
          game_id?: string
          legal_band?: number
          outer_letters?: string
          required_band?: number
          required_words?: Json
          required_words_count?: number
          required_words_score?: number
          target_rank?: number | null
        }
        Relationships: []
      }
      pangrams: {
        Row: {
          difficulty: number
          has_rare_letters: boolean
          letters: string
          mask: number | null
          word_counts: Json
        }
        Insert: {
          difficulty: number
          has_rare_letters: boolean
          letters: string
          mask?: number | null
          word_counts: Json
        }
        Update: {
          difficulty?: number
          has_rare_letters?: boolean
          letters?: string
          mask?: number | null
          word_counts?: Json
        }
        Relationships: []
      }
    }
    Views: {
      games_state: {
        Row: {
          bonus_words: Json | null
          center_letter: string | null
          game_id: string | null
          legal_band: number | null
          outer_letters: string | null
          required_band: number | null
          required_words: Json | null
          required_words_count: number | null
          required_words_score: number | null
          target_rank: number | null
        }
        Insert: {
          bonus_words?: Json | null
          center_letter?: string | null
          game_id?: string | null
          legal_band?: number | null
          outer_letters?: string | null
          required_band?: number | null
          required_words?: Json | null
          required_words_count?: number | null
          required_words_score?: number | null
          target_rank?: number | null
        }
        Update: {
          bonus_words?: Json | null
          center_letter?: string | null
          game_id?: string | null
          legal_band?: number | null
          outer_letters?: string | null
          required_band?: number | null
          required_words?: Json | null
          required_words_count?: number | null
          required_words_score?: number | null
          target_rank?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _write_statuses: {
        Args: { p_game_id: string; p_update_status_changed_at: boolean }
        Returns: undefined
      }
      candidate_words: {
        Args: {
          p_center_bit: number
          p_legal_band: number
          p_puzzle_mask: number
          p_required_band: number
        }
        Returns: {
          is_required: boolean
          letter_mask: number
          word: string
        }[]
      }
      concede: { Args: { p_game_id: string }; Returns: Json }
      create_game: {
        Args: {
          p_board: Json
          p_club_handle: string
          p_mode: string
          p_player_user_ids: string[]
          p_setup: Json
        }
        Returns: Json
      }
      replay_board: { Args: { p_game_id: string }; Returns: Json }
      stop_game: { Args: { p_game_id: string }; Returns: Json }
      submit_timeout: { Args: { p_game_id: string }; Returns: Json }
      submit_word: {
        Args: {
          p_game_id: string
          p_is_bonus: boolean
          p_is_pangram: boolean
          p_points: number
          p_word: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  bananagrams: {
    Enums: {},
  },
  boggle: {
    Enums: {},
  },
  codenamesduet: {
    Enums: {},
  },
  common: {
    Enums: {},
  },
  connections: {
    Enums: {},
  },
  crosswords: {
    Enums: {},
  },
  graphql_public: {
    Enums: {},
  },
  letterboxed: {
    Enums: {},
  },
  psychicnum: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  scrabble: {
    Enums: {},
  },
  setgame: {
    Enums: {},
  },
  spellingbee: {
    Enums: {},
  },
  stackdown: {
    Enums: {},
  },
  strands: {
    Enums: {},
  },
  waffle: {
    Enums: {},
  },
  wordiply: {
    Enums: {},
  },
  wordle: {
    Enums: {},
  },
  wordwheel: {
    Enums: {},
  },
} as const

