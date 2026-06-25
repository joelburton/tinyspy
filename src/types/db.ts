export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  common: {
    Tables: {
      clubs: {
        Row: {
          created_at: string
          created_by: string
          handle: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          handle: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          handle?: string
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
          game_id: string
          joined_at: string
          result: Json | null
          user_id: string
        }
        Insert: {
          game_id: string
          joined_at?: string
          result?: Json | null
          user_id: string
        }
        Update: {
          game_id?: string
          joined_at?: string
          result?: Json | null
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
      games: {
        Row: {
          club_handle: string
          created_by: string | null
          ended_at: string | null
          gametype: string
          id: string
          is_current_view: boolean
          is_terminal: boolean
          last_active_at: string
          paused: boolean
          play_state: string
          setup: Json
          started_at: string
          status: Json | null
          title: string
        }
        Insert: {
          club_handle: string
          created_by?: string | null
          ended_at?: string | null
          gametype: string
          id?: string
          is_current_view?: boolean
          is_terminal?: boolean
          last_active_at?: string
          paused?: boolean
          play_state?: string
          setup: Json
          started_at?: string
          status?: Json | null
          title: string
        }
        Update: {
          club_handle?: string
          created_by?: string | null
          ended_at?: string | null
          gametype?: string
          id?: string
          is_current_view?: boolean
          is_terminal?: boolean
          last_active_at?: string
          paused?: boolean
          play_state?: string
          setup?: Json
          started_at?: string
          status?: Json | null
          title?: string
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
          gametype: string
          min_players: number
        }
        Insert: {
          gametype: string
          min_players?: number
        }
        Update: {
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
          color: string
          created_at: string
          user_id: string
          username: string
        }
        Insert: {
          color: string
          created_at?: string
          user_id: string
          username: string
        }
        Update: {
          color?: string
          created_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      timers: {
        Row: {
          game_id: string
          last_tick: string
          ticks: number
        }
        Insert: {
          game_id: string
          last_tick?: string
          ticks?: number
        }
        Update: {
          game_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cache_definition: {
        Args: { p_def: string; p_source: string; p_word: string }
        Returns: undefined
      }
      claim_username: {
        Args: { chosen_color: string; desired: string }
        Returns: string
      }
      color_for_username: { Args: { username: string }; Returns: string }
      create_club: {
        Args: { club_name: string; member_usernames: string[] }
        Returns: string
      }
      create_game: {
        Args: {
          gametype: string
          player_user_ids: string[]
          saved_default: Json
          setup: Json
          target_club: string
          title: string
        }
        Returns: string
      }
      default_gametypes_for_club: {
        Args: { target_handle: string }
        Returns: {
          gametype: string
        }[]
      }
      delete_game: { Args: { target_game: string }; Returns: undefined }
      end_game: {
        Args: {
          play_state: string
          player_results: Json
          status: Json
          target_game: string
        }
        Returns: undefined
      }
      is_club_member: { Args: { target_club: string }; Returns: boolean }
      require_club_member: { Args: { target_club: string }; Returns: string }
      require_game_player: { Args: { target_game: string }; Returns: string }
      require_player_count_max: {
        Args: { max_count: number; player_user_ids: string[] }
        Returns: undefined
      }
      send_message: {
        Args: { content: string; target_club: string }
        Returns: undefined
      }
      set_club_gametypes: {
        Args: { gametypes: string[]; target_club: string }
        Returns: undefined
      }
      set_current_view: { Args: { target_game: string }; Returns: undefined }
      slugify_club_name: { Args: { name: string }; Returns: string }
      tick_timer: { Args: { target_game: string }; Returns: number }
      unset_current_view: { Args: { target_game: string }; Returns: undefined }
      update_profile_color: { Args: { new_color: string }; Returns: undefined }
      update_state: {
        Args: { play_state: string; status: Json; target_game: string }
        Returns: undefined
      }
      validate_timer: { Args: { timer_obj: Json }; Returns: undefined }
      word_letter_mask: { Args: { w: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  freebee: {
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
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "found_words_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          bonus_words: string[]
          center_letter: string
          club_handle: string
          created_at: string
          id: string
          mode: string
          outer_letters: string
          required_words: Json
          required_words_count: number
          required_words_score: number
        }
        Insert: {
          bonus_words: string[]
          center_letter: string
          club_handle: string
          created_at?: string
          id: string
          mode: string
          outer_letters: string
          required_words: Json
          required_words_count: number
          required_words_score: number
        }
        Update: {
          bonus_words?: string[]
          center_letter?: string
          club_handle?: string
          created_at?: string
          id?: string
          mode?: string
          outer_letters?: string
          required_words?: Json
          required_words_count?: number
          required_words_score?: number
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
          center_letter: string | null
          club_handle: string | null
          created_at: string | null
          id: string | null
          mode: string | null
          outer_letters: string | null
          required_words: Json | null
          required_words_count: number | null
          required_words_score: number | null
        }
        Insert: {
          center_letter?: string | null
          club_handle?: string | null
          created_at?: string | null
          id?: string | null
          mode?: string | null
          outer_letters?: string | null
          required_words?: never
          required_words_count?: number | null
          required_words_score?: number | null
        }
        Update: {
          center_letter?: string | null
          club_handle?: string | null
          created_at?: string | null
          id?: string | null
          mode?: string | null
          outer_letters?: string | null
          required_words?: never
          required_words_count?: number | null
          required_words_score?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _rank_idx: { Args: { score: number; total: number }; Returns: number }
      _required_words_for: { Args: { g: string }; Returns: Json }
      candidate_words: {
        Args: { center_bit: number; puzzle_mask: number }
        Returns: {
          is_required: boolean
          letter_mask: number
          word: string
        }[]
      }
      create_game: {
        Args: {
          board: Json
          mode: string
          player_user_ids: string[]
          setup: Json
          target_club: string
        }
        Returns: {
          id: string
        }[]
      }
      end_game: { Args: { target_game: string }; Returns: undefined }
      submit_timeout: { Args: { target_game: string }; Returns: undefined }
      submit_word: {
        Args: { target_game: string; word: string }
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
  monkeygram: {
    Tables: {
      games: {
        Row: {
          club_handle: string
          created_at: string
          hand_size: number
          id: string
          pool: string
        }
        Insert: {
          club_handle: string
          created_at?: string
          hand_size: number
          id: string
          pool: string
        }
        Update: {
          club_handle?: string
          created_at?: string
          hand_size?: number
          id?: string
          pool?: string
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
            referencedColumns: ["id"]
          },
        ]
      }
      progress: {
        Row: {
          done: boolean
          finished_at: string | null
          game_id: string
          placed: number
          unplaced: number
          user_id: string
        }
        Insert: {
          done?: boolean
          finished_at?: string | null
          game_id: string
          placed?: number
          unplaced: number
          user_id: string
        }
        Update: {
          done?: boolean
          finished_at?: string | null
          game_id?: string
          placed?: number
          unplaced?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_game: {
        Args: { player_user_ids: string[]; setup: Json; target_club: string }
        Returns: {
          id: string
        }[]
      }
      dump: { Args: { target_game: string; tile: string }; Returns: undefined }
      end_game: { Args: { target_game: string }; Returns: undefined }
      peel: { Args: { target_game: string }; Returns: undefined }
      save_player_board: {
        Args: { board: string; target_game: string }
        Returns: undefined
      }
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
      games: {
        Row: {
          club_handle: string
          created_at: string
          id: string
          mode: string
          target: number
        }
        Insert: {
          club_handle: string
          created_at?: string
          id: string
          mode: string
          target: number
        }
        Update: {
          club_handle?: string
          created_at?: string
          id?: string
          mode?: string
          target?: number
        }
        Relationships: []
      }
      guesses: {
        Row: {
          game_id: string
          guessed_at: string
          id: string
          number: number
          user_id: string
          was_correct: boolean
        }
        Insert: {
          game_id: string
          guessed_at?: string
          id?: string
          number: number
          user_id: string
          was_correct: boolean
        }
        Update: {
          game_id?: string
          guessed_at?: string
          id?: string
          number?: number
          user_id?: string
          was_correct?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "guesses_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guesses_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          game_id: string
          guesses_remaining: number
          user_id: string
        }
        Insert: {
          game_id: string
          guesses_remaining: number
          user_id: string
        }
        Update: {
          game_id?: string
          guesses_remaining?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      games_state: {
        Row: {
          club_handle: string | null
          created_at: string | null
          id: string | null
          mode: string | null
          target: number | null
        }
        Insert: {
          club_handle?: string | null
          created_at?: string | null
          id?: string | null
          mode?: string | null
          target?: never
        }
        Update: {
          club_handle?: string | null
          created_at?: string | null
          id?: string | null
          mode?: string | null
          target?: never
        }
        Relationships: []
      }
    }
    Functions: {
      _target_for: { Args: { g_id: string }; Returns: number }
      create_game: {
        Args: {
          mode: string
          player_user_ids: string[]
          setup: Json
          target_club: string
        }
        Returns: {
          id: string
        }[]
      }
      end_game: { Args: { target_game: string }; Returns: undefined }
      submit_guess: {
        Args: { guess: number; target_game: string }
        Returns: string
      }
      submit_timeout: { Args: { target_game: string }; Returns: undefined }
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
  stackdown: {
    Tables: {
      boards: {
        Row: {
          created_at: string
          id: string
          tiles: Json
          wordlist: number
          words: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          tiles: Json
          wordlist?: number
          words: string[]
        }
        Update: {
          created_at?: string
          id?: string
          tiles?: Json
          wordlist?: number
          words?: string[]
        }
        Relationships: []
      }
      games: {
        Row: {
          board_id: string | null
          club_handle: string
          created_at: string
          id: string
          mode: string
          solution: string[]
          tiles: Json
          wordlist: number
        }
        Insert: {
          board_id?: string | null
          club_handle: string
          created_at?: string
          id: string
          mode: string
          solution: string[]
          tiles: Json
          wordlist: number
        }
        Update: {
          board_id?: string | null
          club_handle?: string
          created_at?: string
          id?: string
          mode?: string
          solution?: string[]
          tiles?: Json
          wordlist?: number
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
          solved: boolean
          solved_at: string | null
          user_id: string
        }
        Insert: {
          found_count?: number
          game_id: string
          solved?: boolean
          solved_at?: string | null
          user_id: string
        }
        Update: {
          found_count?: number
          game_id?: string
          solved?: boolean
          solved_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          for_word_index: number | null
          game_id: string
          kind: string
          seq: number
          submitted_at: string
          tile_ids: number[] | null
          user_id: string
          valid: boolean | null
          word: string | null
        }
        Insert: {
          for_word_index?: number | null
          game_id: string
          kind?: string
          seq: number
          submitted_at?: string
          tile_ids?: number[] | null
          user_id: string
          valid?: boolean | null
          word?: string | null
        }
        Update: {
          for_word_index?: number | null
          game_id?: string
          kind?: string
          seq?: number
          submitted_at?: string
          tile_ids?: number[] | null
          user_id?: string
          valid?: boolean | null
          word?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      games_state: {
        Row: {
          club_handle: string | null
          created_at: string | null
          id: string | null
          mode: string | null
          solution: string[] | null
          tiles: Json | null
        }
        Insert: {
          club_handle?: string | null
          created_at?: string | null
          id?: string | null
          mode?: string | null
          solution?: never
          tiles?: Json | null
        }
        Update: {
          club_handle?: string | null
          created_at?: string | null
          id?: string | null
          mode?: string | null
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
      _solution_for: { Args: { g_id: string }; Returns: string[] }
      _word: { Args: { ids: number[]; tiles: Json }; Returns: string }
      create_game: {
        Args: {
          mode: string
          player_user_ids: string[]
          setup: Json
          target_club: string
        }
        Returns: {
          id: string
        }[]
      }
      end_game: { Args: { target_game: string }; Returns: undefined }
      reveal_next_hint: { Args: { target_game: string }; Returns: string }
      reveal_next_word: { Args: { target_game: string }; Returns: string }
      submit_timeout: { Args: { target_game: string }; Returns: undefined }
      submit_word: {
        Args: { target_game: string; tile_ids: number[] }
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
  tinyspy: {
    Tables: {
      clues: {
        Row: {
          by_seat: string
          count: number
          game_id: string
          id: string
          submitted_at: string
          turn_number: number
          word: string
        }
        Insert: {
          by_seat: string
          count: number
          game_id: string
          id?: string
          submitted_at?: string
          turn_number: number
          word: string
        }
        Update: {
          by_seat?: string
          count?: number
          game_id?: string
          id?: string
          submitted_at?: string
          turn_number?: number
          word?: string
        }
        Relationships: [
          {
            foreignKeyName: "clues_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          club_handle: string
          created_at: string
          current_clue_giver: string | null
          id: string
          key_card_a: Json
          key_card_b: Json
          turn_number: number
          turns_remaining: number
          user_a_id: string
          user_b_id: string
        }
        Insert: {
          club_handle: string
          created_at?: string
          current_clue_giver?: string | null
          id: string
          key_card_a: Json
          key_card_b: Json
          turn_number?: number
          turns_remaining?: number
          user_a_id: string
          user_b_id: string
        }
        Update: {
          club_handle?: string
          created_at?: string
          current_clue_giver?: string | null
          id?: string
          key_card_a?: Json
          key_card_b?: Json
          turn_number?: number
          turns_remaining?: number
          user_a_id?: string
          user_b_id?: string
        }
        Relationships: []
      }
      guesses: {
        Row: {
          game_id: string
          guessed_at: string
          guesser_seat: string
          id: string
          outcome: string
          position: number
          turn_number: number
        }
        Insert: {
          game_id: string
          guessed_at?: string
          guesser_seat: string
          id?: string
          outcome: string
          position: number
          turn_number: number
        }
        Update: {
          game_id?: string
          guessed_at?: string
          guesser_seat?: string
          id?: string
          outcome?: string
          position?: number
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "guesses_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
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
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _end_turn: { Args: { target_game: string }; Returns: undefined }
      create_game: {
        Args: { player_user_ids: string[]; setup: Json; target_club: string }
        Returns: {
          id: string
        }[]
      }
      end_game: { Args: { target_game: string }; Returns: undefined }
      get_clue_context: { Args: { target_game: string }; Returns: Json }
      pass_turn: { Args: { target_game: string }; Returns: undefined }
      submit_clue: {
        Args: { clue_count: number; target_game: string; word: string }
        Returns: undefined
      }
      submit_guess: {
        Args: { target_game: string; target_position: number }
        Returns: string
      }
      submit_timeout: { Args: { target_game: string }; Returns: undefined }
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
      games: {
        Row: {
          club_handle: string
          created_at: string
          id: string
          max_swaps: number
          mode: string
          par_swaps: number
          scramble: string
          solution: string
        }
        Insert: {
          club_handle: string
          created_at?: string
          id: string
          max_swaps: number
          mode: string
          par_swaps: number
          scramble: string
          solution: string
        }
        Update: {
          club_handle?: string
          created_at?: string
          id?: string
          max_swaps?: number
          mode?: string
          par_swaps?: number
          scramble?: string
          solution?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          board: string
          game_id: string
          solved: boolean
          solved_at: string | null
          swaps_used: number
          user_id: string
        }
        Insert: {
          board: string
          game_id: string
          solved?: boolean
          solved_at?: string | null
          swaps_used?: number
          user_id: string
        }
        Update: {
          board?: string
          game_id?: string
          solved?: boolean
          solved_at?: string | null
          swaps_used?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["id"]
          },
        ]
      }
      swaps: {
        Row: {
          created_at: string
          game_id: string
          letter_a: string
          letter_b: string
          pos_a: number
          pos_b: number
          swap_index: number
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          letter_a: string
          letter_b: string
          pos_a: number
          pos_b: number
          swap_index: number
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          letter_a?: string
          letter_b?: string
          pos_a?: number
          pos_b?: number
          swap_index?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swaps_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swaps_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      games_state: {
        Row: {
          club_handle: string | null
          created_at: string | null
          id: string | null
          max_swaps: number | null
          mode: string | null
          par_swaps: number | null
          scramble: string | null
          solution: string | null
        }
        Insert: {
          club_handle?: string | null
          created_at?: string | null
          id?: string | null
          max_swaps?: number | null
          mode?: string | null
          par_swaps?: number | null
          scramble?: string | null
          solution?: never
        }
        Update: {
          club_handle?: string | null
          created_at?: string | null
          id?: string | null
          max_swaps?: number | null
          mode?: string | null
          par_swaps?: number | null
          scramble?: string | null
          solution?: never
        }
        Relationships: []
      }
      players_state: {
        Row: {
          board: string | null
          colors: string | null
          game_id: string | null
          solved: boolean | null
          solved_at: string | null
          swaps_used: number | null
          user_id: string | null
        }
        Insert: {
          board?: never
          colors?: never
          game_id?: string | null
          solved?: boolean | null
          solved_at?: string | null
          swaps_used?: number | null
          user_id?: string | null
        }
        Update: {
          board?: never
          colors?: never
          game_id?: string | null
          solved?: boolean | null
          solved_at?: string | null
          swaps_used?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _board_visible: {
        Args: {
          cg: Database["waffle"]["Tables"]["games"]["Row"]
          row_user: string
          wg: Database["waffle"]["Tables"]["games"]["Row"]
        }
        Returns: boolean
      }
      _color_rank: { Args: { c: string }; Returns: number }
      _player_board_for: {
        Args: { g_id: string; row_user: string }
        Returns: string
      }
      _player_colors_for: {
        Args: { g_id: string; row_user: string }
        Returns: string
      }
      _solution_for: { Args: { g_id: string }; Returns: string }
      _wordle_colors: {
        Args: { answer: string; guess: string }
        Returns: string
      }
      compute_colors: {
        Args: { board: string; solution: string }
        Returns: string
      }
      create_game: {
        Args: {
          board: Json
          mode: string
          player_user_ids: string[]
          setup: Json
          target_club: string
        }
        Returns: {
          id: string
        }[]
      }
      end_game: { Args: { target_game: string }; Returns: undefined }
      submit_swap: {
        Args: { pos_a: number; pos_b: number; target_game: string }
        Returns: Json
      }
      submit_timeout: { Args: { target_game: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  wordknit: {
    Tables: {
      games: {
        Row: {
          board: Json
          club_handle: string
          created_at: string
          id: string
          mode: string
          puzzle_id: string
        }
        Insert: {
          board: Json
          club_handle: string
          created_at?: string
          id: string
          mode: string
          puzzle_id: string
        }
        Update: {
          board?: Json
          club_handle?: string
          created_at?: string
          id?: string
          mode?: string
          puzzle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "club_game_status"
            referencedColumns: ["game_id"]
          },
          {
            foreignKeyName: "games_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "puzzles"
            referencedColumns: ["id"]
          },
        ]
      }
      guesses: {
        Row: {
          game_id: string
          guessed_at: string
          id: string
          matched_category_rank: number | null
          mode: string
          result: string
          tiles: string[]
          user_id: string
        }
        Insert: {
          game_id: string
          guessed_at?: string
          id?: string
          matched_category_rank?: number | null
          mode: string
          result: string
          tiles: string[]
          user_id: string
        }
        Update: {
          game_id?: string
          guessed_at?: string
          id?: string
          matched_category_rank?: number | null
          mode?: string
          result?: string
          tiles?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guesses_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          game_id: string
          mistake_count: number
          user_id: string
        }
        Insert: {
          game_id: string
          mistake_count?: number
          user_id: string
        }
        Update: {
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
            referencedColumns: ["id"]
          },
        ]
      }
      puzzles: {
        Row: {
          categories: Json
          id: string
          imported_at: string
          nyt_date: string | null
          source_id: string
        }
        Insert: {
          categories: Json
          id?: string
          imported_at?: string
          nyt_date?: string | null
          source_id: string
        }
        Update: {
          categories?: Json
          id?: string
          imported_at?: string
          nyt_date?: string | null
          source_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      club_game_status: {
        Row: {
          club_handle: string | null
          game_id: string | null
          is_terminal: boolean | null
          mode: string | null
          nyt_date: string | null
          play_state: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_game: {
        Args: {
          mode: string
          player_user_ids: string[]
          setup: Json
          target_club: string
        }
        Returns: {
          id: string
        }[]
      }
      end_game: { Args: { target_game: string }; Returns: undefined }
      submit_guess: {
        Args: {
          matched_category_rank?: number
          result: string
          target_game: string
          tiles: string[]
        }
        Returns: undefined
      }
      submit_timeout: { Args: { target_game: string }; Returns: undefined }
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
      games: {
        Row: {
          club_handle: string
          created_at: string
          id: string
          max_guesses: number
          mode: string
          target: string
        }
        Insert: {
          club_handle: string
          created_at?: string
          id: string
          max_guesses: number
          mode: string
          target: string
        }
        Update: {
          club_handle?: string
          created_at?: string
          id?: string
          max_guesses?: number
          mode?: string
          target?: string
        }
        Relationships: []
      }
      guesses: {
        Row: {
          colors: string
          game_id: string
          guess: string
          guess_index: number
          guessed_at: string
          is_correct: boolean
          user_id: string
        }
        Insert: {
          colors: string
          game_id: string
          guess: string
          guess_index: number
          guessed_at?: string
          is_correct: boolean
          user_id: string
        }
        Update: {
          colors?: string
          game_id?: string
          guess?: string
          guess_index?: number
          guessed_at?: string
          is_correct?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guesses_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guesses_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          game_id: string
          guesses_used: number
          solved: boolean
          solved_at: string | null
          user_id: string
        }
        Insert: {
          game_id: string
          guesses_used?: number
          solved?: boolean
          solved_at?: string | null
          user_id: string
        }
        Update: {
          game_id?: string
          guesses_used?: number
          solved?: boolean
          solved_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games_state"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      games_state: {
        Row: {
          club_handle: string | null
          created_at: string | null
          id: string | null
          max_guesses: number | null
          mode: string | null
          target: string | null
        }
        Insert: {
          club_handle?: string | null
          created_at?: string | null
          id?: string | null
          max_guesses?: number | null
          mode?: string | null
          target?: never
        }
        Update: {
          club_handle?: string | null
          created_at?: string | null
          id?: string | null
          max_guesses?: number | null
          mode?: string | null
          target?: never
        }
        Relationships: []
      }
    }
    Functions: {
      _target_for: { Args: { g_id: string }; Returns: string }
      compute_colors: {
        Args: { answer: string; guess: string }
        Returns: string
      }
      create_game: {
        Args: {
          mode: string
          player_user_ids: string[]
          setup: Json
          target_club: string
        }
        Returns: {
          id: string
        }[]
      }
      end_game: { Args: { target_game: string }; Returns: undefined }
      submit_guess: {
        Args: { guess: string; target_game: string }
        Returns: Json
      }
      submit_timeout: { Args: { target_game: string }; Returns: undefined }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  common: {
    Enums: {},
  },
  freebee: {
    Enums: {},
  },
  graphql_public: {
    Enums: {},
  },
  monkeygram: {
    Enums: {},
  },
  psychicnum: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  stackdown: {
    Enums: {},
  },
  tinyspy: {
    Enums: {},
  },
  waffle: {
    Enums: {},
  },
  wordknit: {
    Enums: {},
  },
  wordle: {
    Enums: {},
  },
} as const

