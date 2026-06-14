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
      club_active_game: {
        Row: {
          club_id: string
          game_id: string
          gametype: string
          set_active_at: string
        }
        Insert: {
          club_id: string
          game_id: string
          gametype: string
          set_active_at?: string
        }
        Update: {
          club_id?: string
          game_id?: string
          gametype?: string
          set_active_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_active_game_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: true
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      club_members: {
        Row: {
          club_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          club_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          club_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      clubs: {
        Row: {
          created_at: string
          created_by: string
          handle: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          handle: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          handle?: string
          id?: string
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
      messages: {
        Row: {
          club_id: string
          content: string
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          club_id: string
          content: string
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          club_id?: string
          content?: string
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
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
          created_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_club: {
        Args: { club_name: string; member_usernames: string[] }
        Returns: {
          handle: string
          id: string
        }[]
      }
      is_club_member: { Args: { target_club: string }; Returns: boolean }
      send_message: {
        Args: { content: string; target_club: string }
        Returns: undefined
      }
      slugify_club_name: { Args: { name: string }; Returns: string }
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
      game_players: {
        Row: {
          game_id: string
          joined_at: string
          key_card: Json | null
          seat: string
          user_id: string
        }
        Insert: {
          game_id: string
          joined_at?: string
          key_card?: Json | null
          seat: string
          user_id: string
        }
        Update: {
          game_id?: string
          joined_at?: string
          key_card?: Json | null
          seat?: string
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
        ]
      }
      games: {
        Row: {
          club_id: string
          created_at: string
          current_clue_giver: string | null
          id: string
          next_game_id: string | null
          status: string
          turn_number: number
          turns_remaining: number
        }
        Insert: {
          club_id: string
          created_at?: string
          current_clue_giver?: string | null
          id?: string
          next_game_id?: string | null
          status?: string
          turn_number?: number
          turns_remaining?: number
        }
        Update: {
          club_id?: string
          created_at?: string
          current_clue_giver?: string | null
          id?: string
          next_game_id?: string | null
          status?: string
          turn_number?: number
          turns_remaining?: number
        }
        Relationships: [
          {
            foreignKeyName: "games_next_game_id_fkey"
            columns: ["next_game_id"]
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
          position: number
          revealed_as: string | null
          revealed_at: string | null
          revealed_by: string | null
          revealed_in_turn: number | null
          word: string
        }
        Insert: {
          game_id: string
          position: number
          revealed_as?: string | null
          revealed_at?: string | null
          revealed_by?: string | null
          revealed_in_turn?: number | null
          word: string
        }
        Update: {
          game_id?: string
          position?: number
          revealed_as?: string | null
          revealed_at?: string | null
          revealed_by?: string | null
          revealed_in_turn?: number | null
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
        Args: { target_club: string }
        Returns: {
          id: string
        }[]
      }
      get_clue_context: { Args: { target_game: string }; Returns: Json }
      is_player_in_game: { Args: { target_game: string }; Returns: boolean }
      pass_turn: { Args: { target_game: string }; Returns: undefined }
      play_again: {
        Args: { prev_game: string }
        Returns: {
          id: string
        }[]
      }
      submit_clue: {
        Args: { clue_count: number; target_game: string; word: string }
        Returns: undefined
      }
      submit_guess: {
        Args: { target_game: string; target_position: number }
        Returns: string
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  tinyspy: {
    Enums: {},
  },
} as const

