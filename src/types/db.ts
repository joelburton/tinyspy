// cs-na

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "bananagrams": {
          Tables: {
            "events": {
                  Row: {
                    "created_at": string,"game_id": string,"id": number,"kind": string,"n_drawn": number,"tile": string | null,"took_turn": boolean,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"game_id": string,"id"?: never,"kind": string,"n_drawn": number,"tile"?: string | null,"took_turn"?: boolean,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"game_id"?: string,"id"?: never,"kind"?: string,"n_drawn"?: number,"tile"?: string | null,"took_turn"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "bag": string,"bunch": string,"bunch_at_setup": string,"dict_2": number,"dict_3plus": number,"dump_to_bag": boolean,"game_id": string,"hand_size": number,"word_check": string
                  }
                  Insert: {
                    "bag"?: string,"bunch": string,"bunch_at_setup": string,"dict_2": number,"dict_3plus": number,"dump_to_bag": boolean,"game_id": string,"hand_size": number,"word_check": string
                  }
                  Update: {
                    "bag"?: string,"bunch"?: string,"bunch_at_setup"?: string,"dict_2"?: number,"dict_3plus"?: number,"dump_to_bag"?: boolean,"game_id"?: string,"hand_size"?: number,"word_check"?: string
                  }
                  Relationships: [
                    
                  ]
                },"player_boards": {
                  Row: {
                    "board": string,"game_id": string,"tiles": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "board": string,"game_id": string,"tiles": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "board"?: string,"game_id"?: string,"tiles"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "player_boards_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_full_bag":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_main_block_size":
{ Args: { "p_board": string }; Returns: number
                           },
"_make_json_events":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_win_blockers":
{ Args: { "p_board": string,"p_check_words": boolean,"p_dict_2": number,"p_dict_3plus": number }; Returns: (number)[]
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"check_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_club_handle": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"dump":
{ Args: { "p_game_id": string,"p_tile": string }; Returns: Json
                           },
"peel":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"save_player_board":
{ Args: { "p_board": string,"p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"boggle": {
          Tables: {
            "found_words": {
                  Row: {
                    "found_at": string,"game_id": string,"is_bonus": boolean,"points": number,"user_id": string,"word": string
                  }
                  Insert: {
                    "found_at"?: string,"game_id": string,"is_bonus": boolean,"points": number,"user_id": string,"word": string
                  }
                  Update: {
                    "found_at"?: string,"game_id"?: string,"is_bonus"?: boolean,"points"?: number,"user_id"?: string,"word"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "found_words_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "board": string,"board_side_size": number,"bonus_words": NonNullable<Json>,"game_id": string,"legal_band": number,"min_word_length": number,"n_reqd_words": number,"reqd_words_score": number,"required_band": number,"required_words": NonNullable<Json>,"target_win_percent": number | null,"_make_json_puzzle": Json | null,"_make_json_tiles": Json | null
                  }
                  Insert: {
                    "board": string,"board_side_size": number,"bonus_words"?: NonNullable<Json>,"game_id": string,"legal_band": number,"min_word_length": number,"n_reqd_words": number,"reqd_words_score": number,"required_band": number,"required_words": NonNullable<Json>,"target_win_percent"?: number | null
                  }
                  Update: {
                    "board"?: string,"board_side_size"?: number,"bonus_words"?: NonNullable<Json>,"game_id"?: string,"legal_band"?: number,"min_word_length"?: number,"n_reqd_words"?: number,"reqd_words_score"?: number,"required_band"?: number,"required_words"?: NonNullable<Json>,"target_win_percent"?: number | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_finish":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason_detail": string }; Returns: undefined
                           },
"_make_json_found_counts":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"_make_json_found_words":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "g": Database["boggle"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_tiles":
{ Args: { "g": Database["boggle"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_words":
{ Args: { "p_bonus": boolean,"p_words": Json }; Returns: Json
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_board": Json,"p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_word":
{ Args: { "p_game_id": string,"p_is_bonus": boolean,"p_points": number,"p_word": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"codenamesduet": {
          Tables: {
            "events": {
                  Row: {
                    "clue_count": number | null,"clue_from_ai": boolean | null,"clue_word": string | null,"created_at": string,"game_id": string,"guess_position": number | null,"guess_result": string | null,"id": number,"kind": string,"seat": string,"took_turn": boolean,"turn_number": number,"user_id": string
                  }
                  Insert: {
                    "clue_count"?: number | null,"clue_from_ai"?: boolean | null,"clue_word"?: string | null,"created_at"?: string,"game_id": string,"guess_position"?: number | null,"guess_result"?: string | null,"id"?: never,"kind": string,"seat": string,"took_turn"?: boolean,"turn_number": number,"user_id": string
                  }
                  Update: {
                    "clue_count"?: number | null,"clue_from_ai"?: boolean | null,"clue_word"?: string | null,"created_at"?: string,"game_id"?: string,"guess_position"?: number | null,"guess_result"?: string | null,"id"?: never,"kind"?: string,"seat"?: string,"took_turn"?: boolean,"turn_number"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "current_clue_giver": string | null,"game_id": string,"key_card_a": NonNullable<Json>,"key_card_b": NonNullable<Json>,"max_turns": number,"player_a_user_id": string,"player_b_user_id": string,"turn_number": number
                  }
                  Insert: {
                    "current_clue_giver"?: string | null,"game_id": string,"key_card_a": NonNullable<Json>,"key_card_b": NonNullable<Json>,"max_turns": number,"player_a_user_id": string,"player_b_user_id": string,"turn_number"?: number
                  }
                  Update: {
                    "current_clue_giver"?: string | null,"game_id"?: string,"key_card_a"?: NonNullable<Json>,"key_card_b"?: NonNullable<Json>,"max_turns"?: number,"player_a_user_id"?: string,"player_b_user_id"?: string,"turn_number"?: number
                  }
                  Relationships: [
                    
                  ]
                },"word_pool": {
                  Row: {
                    "word": string
                  }
                  Insert: {
                    "word": string
                  }
                  Update: {
                    "word"?: string
                  }
                  Relationships: [
                    
                  ]
                },"words": {
                  Row: {
                    "game_id": string,"neutral_a": boolean,"neutral_b": boolean,"position": number,"revealed_as": string | null,"word": string
                  }
                  Insert: {
                    "game_id": string,"neutral_a"?: boolean,"neutral_b"?: boolean,"position": number,"revealed_as"?: string | null,"word": string
                  }
                  Update: {
                    "game_id"?: string,"neutral_a"?: boolean,"neutral_b"?: boolean,"position"?: number,"revealed_as"?: string | null,"word"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "words_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_end_turn":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_curr_clue":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_events":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_point_turn":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_require_clue_giver":
{ Args: { "p_game_id": string }; Returns: string
                           },
"_seat_has_agents_left":
{ Args: { "p_game_id": string,"p_seat": string }; Returns: boolean
                           },
"_seat_of":
{ Args: { "cg": Database["codenamesduet"]['Tables']["games"]['Row'],"p_user_id": string }; Returns: string
                           },
"_turns_remaining":
{ Args: { "p_max_turns": number,"p_turn_number": number }; Returns: number
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"create_game":
{ Args: { "p_club_handle": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"get_clue_context":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"log_hint":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"pass_turn":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_clue":
{ Args: { "p_clue_count": number,"p_clue_from_ai"?: boolean,"p_clue_word": string,"p_game_id": string }; Returns: Json
                           },
"submit_guess":
{ Args: { "p_game_id": string,"p_guess_position": number }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"common": {
          Tables: {
            "clubs": {
                  Row: {
                    "can_edit_settings": boolean,"created_at": string,"created_by": string,"handle": string,"is_solo": boolean,"name": string
                  }
                  Insert: {
                    "can_edit_settings"?: boolean,"created_at"?: string,"created_by": string,"handle": string,"is_solo"?: never,"name": string
                  }
                  Update: {
                    "can_edit_settings"?: boolean,"created_at"?: string,"created_by"?: string,"handle"?: string,"is_solo"?: never,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clubs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"clubs_gametypes": {
                  Row: {
                    "added_at": string,"club_handle": string,"default_setup": Json | null,"gametype": string,"is_enabled": boolean,"max_daily_games": number | null,"n_started_today": number,"started_on": string | null
                  }
                  Insert: {
                    "added_at"?: string,"club_handle": string,"default_setup"?: Json | null,"gametype": string,"is_enabled"?: boolean,"max_daily_games"?: number | null,"n_started_today"?: number,"started_on"?: string | null
                  }
                  Update: {
                    "added_at"?: string,"club_handle"?: string,"default_setup"?: Json | null,"gametype"?: string,"is_enabled"?: boolean,"max_daily_games"?: number | null,"n_started_today"?: number,"started_on"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "clubs_gametypes_club_handle_fkey"
      columns: ["club_handle"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["handle"]
    },{
      foreignKeyName: "clubs_gametypes_gametype_fkey"
      columns: ["gametype"]
isOneToOne: false
      referencedRelation: "gametypes"
      referencedColumns: ["gametype"]
    }
                  ]
                },"clubs_members": {
                  Row: {
                    "club_handle": string,"joined_at": string,"user_id": string
                  }
                  Insert: {
                    "club_handle": string,"joined_at"?: string,"user_id": string
                  }
                  Update: {
                    "club_handle"?: string,"joined_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clubs_members_club_handle_fkey"
      columns: ["club_handle"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["handle"]
    },{
      foreignKeyName: "clubs_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"game_players": {
                  Row: {
                    "final_ranking": number | null,"game_id": string,"joined_at": string,"outcome": string | null,"player_ended_at": string | null,"player_ended_reason": string | null,"player_ended_reason_detail": string | null,"solved_at": string | null,"turn_seat": number | null,"user_id": string
                  }
                  Insert: {
                    "final_ranking"?: number | null,"game_id": string,"joined_at"?: string,"outcome"?: string | null,"player_ended_at"?: string | null,"player_ended_reason"?: string | null,"player_ended_reason_detail"?: string | null,"solved_at"?: string | null,"turn_seat"?: number | null,"user_id": string
                  }
                  Update: {
                    "final_ranking"?: number | null,"game_id"?: string,"joined_at"?: string,"outcome"?: string | null,"player_ended_at"?: string | null,"player_ended_reason"?: string | null,"player_ended_reason_detail"?: string | null,"solved_at"?: string | null,"turn_seat"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "game_players_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"game_scratchpads": {
                  Row: {
                    "body": string,"game_id": string,"id": string,"owner_id": string | null,"version": number
                  }
                  Insert: {
                    "body"?: string,"game_id": string,"id"?: string,"owner_id"?: string | null,"version"?: number
                  }
                  Update: {
                    "body"?: string,"game_id"?: string,"id"?: string,"owner_id"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "game_scratchpads_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "game_scratchpads_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "club_handle": string,"created_by": string | null,"current_turn_user_id": string | null,"ended_at": string | null,"game_data": Json | null,"game_ended_by_user_id": string | null,"game_ended_outcome": string | null,"game_ended_reason": string | null,"game_ended_reason_detail": string | null,"gametype": string,"id": string,"is_current_view": boolean,"mode": string,"restart_count": number,"setup": NonNullable<Json>,"shell_data": Json | null,"started_at": string,"static_game_data": Json | null,"status_changed_at": string,"summary_data": Json | null,"title": string,"updated_at": string,"_make_json_ending": Json | null
                  }
                  Insert: {
                    "club_handle": string,"created_by"?: string | null,"current_turn_user_id"?: string | null,"ended_at"?: string | null,"game_data"?: Json | null,"game_ended_by_user_id"?: string | null,"game_ended_outcome"?: string | null,"game_ended_reason"?: string | null,"game_ended_reason_detail"?: string | null,"gametype": string,"id"?: string,"is_current_view"?: boolean,"mode": string,"restart_count"?: number,"setup": NonNullable<Json>,"shell_data"?: Json | null,"started_at"?: string,"static_game_data"?: Json | null,"status_changed_at"?: string,"summary_data"?: Json | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "club_handle"?: string,"created_by"?: string | null,"current_turn_user_id"?: string | null,"ended_at"?: string | null,"game_data"?: Json | null,"game_ended_by_user_id"?: string | null,"game_ended_outcome"?: string | null,"game_ended_reason"?: string | null,"game_ended_reason_detail"?: string | null,"gametype"?: string,"id"?: string,"is_current_view"?: boolean,"mode"?: string,"restart_count"?: number,"setup"?: NonNullable<Json>,"shell_data"?: Json | null,"started_at"?: string,"static_game_data"?: Json | null,"status_changed_at"?: string,"summary_data"?: Json | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "games_club_handle_fkey"
      columns: ["club_handle"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["handle"]
    },{
      foreignKeyName: "games_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "games_current_turn_user_id_fkey"
      columns: ["current_turn_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "games_game_ended_by_user_id_fkey"
      columns: ["game_ended_by_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "games_gametype_fkey"
      columns: ["gametype"]
isOneToOne: false
      referencedRelation: "gametypes"
      referencedColumns: ["gametype"]
    }
                  ]
                },"gametypes": {
                  Row: {
                    "brand": string,"default_enroll": boolean,"gametype": string,"min_players": number
                  }
                  Insert: {
                    "brand": string,"default_enroll"?: boolean,"gametype": string,"min_players"?: number
                  }
                  Update: {
                    "brand"?: string,"default_enroll"?: boolean,"gametype"?: string,"min_players"?: number
                  }
                  Relationships: [
                    
                  ]
                },"messages": {
                  Row: {
                    "club_handle": string,"content": string,"id": string,"sent_at": string,"user_id": string
                  }
                  Insert: {
                    "club_handle": string,"content": string,"id"?: string,"sent_at"?: string,"user_id": string
                  }
                  Update: {
                    "club_handle"?: string,"content"?: string,"id"?: string,"sent_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "messages_club_handle_fkey"
      columns: ["club_handle"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["handle"]
    },{
      foreignKeyName: "messages_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "ai_member": boolean,"can_edit_words": boolean,"color": string,"created_at": string,"sounds_enabled": boolean,"theme": string | null,"user_id": string,"username": string
                  }
                  Insert: {
                    "ai_member"?: boolean,"can_edit_words"?: boolean,"color": string,"created_at"?: string,"sounds_enabled"?: boolean,"theme"?: string | null,"user_id": string,"username": string
                  }
                  Update: {
                    "ai_member"?: boolean,"can_edit_words"?: boolean,"color"?: string,"created_at"?: string,"sounds_enabled"?: boolean,"theme"?: string | null,"user_id"?: string,"username"?: string
                  }
                  Relationships: [
                    
                  ]
                },"timers": {
                  Row: {
                    "countdown_seconds_at_setup": number | null,"game_id": string,"kind": string,"last_tick": string,"ticks": number
                  }
                  Insert: {
                    "countdown_seconds_at_setup"?: number | null,"game_id": string,"kind": string,"last_tick"?: string,"ticks"?: number
                  }
                  Update: {
                    "countdown_seconds_at_setup"?: number | null,"game_id"?: string,"kind"?: string,"last_tick"?: string,"ticks"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "timers_game_id_fkey"
      columns: ["game_id"]
isOneToOne: true
      referencedRelation: "games"
      referencedColumns: ["id"]
    }
                  ]
                },"words": {
                  Row: {
                    "american": boolean,"australian": boolean,"band": number,"british": boolean,"canadian": boolean,"crude": number,"definition": string | null,"definition_source": string | null,"hint": string | null,"len": number,"letter_mask": number | null,"root_word": string | null,"slang": boolean,"slur": number,"word": string,"wordle": boolean
                  }
                  Insert: {
                    "american": boolean,"australian": boolean,"band": number,"british": boolean,"canadian": boolean,"crude"?: number,"definition"?: string | null,"definition_source"?: string | null,"hint"?: string | null,"len": number,"letter_mask"?: never,"root_word"?: string | null,"slang"?: boolean,"slur"?: number,"word": string,"wordle"?: boolean
                  }
                  Update: {
                    "american"?: boolean,"australian"?: boolean,"band"?: number,"british"?: boolean,"canadian"?: boolean,"crude"?: number,"definition"?: string | null,"definition_source"?: string | null,"hint"?: string | null,"len"?: number,"letter_mask"?: never,"root_word"?: string | null,"slang"?: boolean,"slur"?: number,"word"?: string,"wordle"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"words_edits": {
                  Row: {
                    "edited_at": string,"edited_by": string,"edited_by_username": string,"id": number,"kind": string,"new": Json | null,"note": string | null,"old": Json | null,"word": string
                  }
                  Insert: {
                    "edited_at"?: string,"edited_by": string,"edited_by_username": string,"id"?: never,"kind": string,"new"?: Json | null,"note"?: string | null,"old"?: Json | null,"word": string
                  }
                  Update: {
                    "edited_at"?: string,"edited_by"?: string,"edited_by_username"?: string,"id"?: never,"kind"?: string,"new"?: Json | null,"note"?: string | null,"old"?: Json | null,"word"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "clubs_gametypes_today": {
                  Row: {
                    "club_handle": string | null,"default_setup": Json | null,"gametype": string | null,"is_enabled": boolean | null,"max_daily_games": number | null,"used_today": number | null
                  }
                  Insert: {
                           "club_handle"?: string | null,"default_setup"?: Json | null,"gametype"?: string | null,"is_enabled"?: boolean | null,"max_daily_games"?: number | null,"used_today"?: never
                         }
                        Update: {
                           "club_handle"?: string | null,"default_setup"?: Json | null,"gametype"?: string | null,"is_enabled"?: boolean | null,"max_daily_games"?: number | null,"used_today"?: never
                         }
                        Relationships: [
                    {
      foreignKeyName: "clubs_gametypes_club_handle_fkey"
      columns: ["club_handle"]
isOneToOne: false
      referencedRelation: "clubs"
      referencedColumns: ["handle"]
    },{
      foreignKeyName: "clubs_gametypes_gametype_fkey"
      columns: ["gametype"]
isOneToOne: false
      referencedRelation: "gametypes"
      referencedColumns: ["gametype"]
    }
                  ]
                }
          }
          Functions: {
            "_advance_turn":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"_anagram_fits":
{ Args: { "floats": (number)[],"pat": string,"w": string,"wilds": number }; Returns: boolean
                           },
"_assign_turn_order":
{ Args: { "first_user_id": string,"target_game": string }; Returns: undefined
                           },
"_color_for_username":
{ Args: { "username": string }; Returns: string
                           },
"_concede":
{ Args: { "p_game_id": string }; Returns: string
                           },
"_create_game":
{ Args: { "p_club_handle": string,"p_default_setup": Json,"p_gametype": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json,"p_title": string }; Returns: string
                           },
"_default_gametypes_for_club":
{ Args: { "target_handle": string }; Returns: {
              "gametype": string
            }[]
                           },
"_end_game":
{ Args: { "p_ended_by_user_id": string,"p_final_rankings": Json,"p_game_id": string,"p_is_no_result": boolean,"p_reason": string,"p_reason_detail": string }; Returns: undefined
                           },
"_enroll_club_gametypes":
{ Args: { "target_handle": string }; Returns: undefined
                           },
"_is_club_member":
{ Args: { "target_club": string }; Returns: boolean
                           },
"_is_turn_based":
{ Args: { "p_game_id": string }; Returns: boolean
                           },
"_make_json_ending":
{ Args: { "g": Database["common"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_player":
{ Args: { "g": Database["common"]['Tables']["games"]['Row'],"gp": Database["common"]['Tables']["game_players"]['Row'],"p_turn_based": boolean,"prof": Database["common"]['Tables']["profiles"]['Row'] }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: {
              "id": string,"ord": number,"player": Json
            }[]
                           },
"_make_json_shell_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_shell_player":
{ Args: { "player": Json }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_ok_envelope":
{ Args: { "data"?: Json,"message"?: string,"meta"?: Json,"outcome"?: string }; Returns: Json
                           },
"_raise_already_conceded":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_raise_game_deleted":
{ Args: { "p_schema": string }; Returns: undefined
                           },
"_raise_game_over":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"_raised_envelope":
{ Args: { "detail"?: string,"field"?: string,"hint": string,"message": string,"outcome"?: string,"sqlstate_code": string }; Returns: Json
                           },
"_rank_idx":
{ Args: { "score": number,"total": number }; Returns: number
                           },
"_require_club_member":
{ Args: { "target_club": string }; Returns: string
                           },
"_require_compete":
{ Args: { "p_mode": string }; Returns: undefined
                           },
"_require_game_player":
{ Args: { "target_game": string }; Returns: string
                           },
"_require_player_count_max":
{ Args: { "max_count": number,"player_user_ids": (string)[] }; Returns: undefined
                           },
"_require_turn":
{ Args: { "caller": string,"target_game": string }; Returns: undefined
                           },
"_require_valid_mode":
{ Args: { "p_mode": string }; Returns: undefined
                           },
"_require_valid_timer":
{ Args: { "timer": Json }; Returns: undefined
                           },
"_require_word_editor":
{ Args: Record<PropertyKey, never>; Returns: {
              "editor_id": string,"editor_username": string
            }[]
                           },
"_reset_game":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"_set_player_ended":
{ Args: { "p_game_id": string,"p_outcome": string,"p_reason": string,"p_reason_detail": string,"p_user_id": string }; Returns: undefined
                           },
"_slugify_club_name":
{ Args: { "name": string }; Returns: string
                           },
"_stop":
{ Args: { "p_game_id": string }; Returns: string
                           },
"_validate_word_fields":
{ Args: { "fields": Json }; Returns: undefined
                           },
"_wordle_colors":
{ Args: { "answer": string,"guess": string }; Returns: string
                           },
"add_word":
{ Args: { "fields": Json,"new_word": string,"note"?: string }; Returns: Json
                           },
"anagrams":
{ Args: { "letters": string }; Returns: Json
                           },
"cache_definition":
{ Args: { "p_def": string,"p_source": string,"p_word": string }; Returns: undefined
                           },
"claim_username":
{ Args: { "chosen_color": string,"desired": string }; Returns: Json
                           },
"create_club":
{ Args: { "club_name": string,"member_usernames": (string)[] }; Returns: Json
                           },
"delete_game":
{ Args: { "target_game": string }; Returns: Json
                           },
"delete_word":
{ Args: { "note"?: string,"target_word": string }; Returns: Json
                           },
"get_club_page":
{ Args: { "target_handle": string }; Returns: Json
                           },
"send_message":
{ Args: { "content": string,"target_club": string }; Returns: Json
                           },
"set_club_gametypes":
{ Args: { "p_club_handle": string,"p_settings": Json }; Returns: Json
                           },
"set_current_view":
{ Args: { "target_game": string }; Returns: Json
                           },
"set_scratchpad":
{ Args: { "p_body": string,"p_owner_id": string,"target_game": string }; Returns: Json
                           },
"tick_timer":
{ Args: { "target_game": string }; Returns: Json
                           },
"unset_current_view":
{ Args: { "target_game": string }; Returns: Json
                           },
"update_profile":
{ Args: { "new_color": string,"new_sounds_enabled": boolean }; Returns: Json
                           },
"update_word":
{ Args: { "note"?: string,"patch": Json,"target_word": string }; Returns: Json
                           },
"word_letter_mask":
{ Args: { "w": string }; Returns: number
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"connections": {
          Tables: {
            "events": {
                  Row: {
                    "created_at": string,"game_id": string,"id": number,"kind": string,"matched_cat_rank": number | null,"result": string,"tiles": (string)[],"took_turn": boolean,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"game_id": string,"id"?: never,"kind": string,"matched_cat_rank"?: number | null,"result": string,"tiles": (string)[],"took_turn"?: boolean,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"game_id"?: string,"id"?: never,"kind"?: string,"matched_cat_rank"?: number | null,"result"?: string,"tiles"?: (string)[],"took_turn"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "board": NonNullable<Json>,"game_id": string,"puzzle_date": string | null,"puzzle_id": string | null,"_make_json_puzzle": Json | null
                  }
                  Insert: {
                    "board": NonNullable<Json>,"game_id": string,"puzzle_date"?: string | null,"puzzle_id"?: string | null
                  }
                  Update: {
                    "board"?: NonNullable<Json>,"game_id"?: string,"puzzle_date"?: string | null,"puzzle_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "games_puzzle_id_fkey"
      columns: ["puzzle_id"]
isOneToOne: false
      referencedRelation: "puzzles"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "game_id": string,"n_matched_cats": number,"n_mistakes": number,"user_id": string
                  }
                  Insert: {
                    "game_id": string,"n_matched_cats"?: number,"n_mistakes"?: number,"user_id": string
                  }
                  Update: {
                    "game_id"?: string,"n_matched_cats"?: number,"n_mistakes"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"puzzles": {
                  Row: {
                    "categories": NonNullable<Json>,"id": string,"imported_at": string,"puzzle_date": string | null,"source_id": string
                  }
                  Insert: {
                    "categories": NonNullable<Json>,"id"?: string,"imported_at"?: string,"puzzle_date"?: string | null,"source_id": string
                  }
                  Update: {
                    "categories"?: NonNullable<Json>,"id"?: string,"imported_at"?: string,"puzzle_date"?: string | null,"source_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_make_json_board":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"_make_json_cat":
{ Args: { "p_cat": Json }; Returns: Json
                           },
"_make_json_events":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "g": Database["connections"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_team_counts":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_tile":
{ Args: { "p_word": string }; Returns: Json
                           },
"_make_json_tiles":
{ Args: { "p_words": Json }; Returns: Json
                           },
"_maybe_finish_compete":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason": string,"p_reason_detail": string }; Returns: boolean
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"next_puzzle_for_club":
{ Args: { "p_seen_by": (string)[] }; Returns: Json
                           },
"puzzle_for_date":
{ Args: { "target_date": string }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_guess":
{ Args: { "p_game_id": string,"p_matched_cat_rank"?: number,"p_result": string,"p_tiles": (string)[] }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"crosswords": {
          Tables: {
            "games": {
                  Row: {
                    "game_id": string,"puzzle_content": NonNullable<Json>,"puzzle_date": string | null,"puzzle_id": string | null,"revision": number,"solution": NonNullable<Json>
                  }
                  Insert: {
                    "game_id": string,"puzzle_content": NonNullable<Json>,"puzzle_date"?: string | null,"puzzle_id"?: string | null,"revision"?: number,"solution": NonNullable<Json>
                  }
                  Update: {
                    "game_id"?: string,"puzzle_content"?: NonNullable<Json>,"puzzle_date"?: string | null,"puzzle_id"?: string | null,"revision"?: number,"solution"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "games_puzzle_id_fkey"
      columns: ["puzzle_id"]
isOneToOne: false
      referencedRelation: "puzzles"
      referencedColumns: ["id"]
    }
                  ]
                },"grids": {
                  Row: {
                    "cells": NonNullable<Json>,"game_id": string,"id": number,"owner_id": string | null
                  }
                  Insert: {
                    "cells"?: NonNullable<Json>,"game_id": string,"id"?: never,"owner_id"?: string | null
                  }
                  Update: {
                    "cells"?: NonNullable<Json>,"game_id"?: string,"id"?: never,"owner_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "grids_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"puzzles": {
                  Row: {
                    "content_hash": string,"created_at": string,"id": string,"puzzle_content": NonNullable<Json>,"solution": NonNullable<Json>,"source": string
                  }
                  Insert: {
                    "content_hash": string,"created_at"?: string,"id"?: string,"puzzle_content": NonNullable<Json>,"solution": NonNullable<Json>,"source": string
                  }
                  Update: {
                    "content_hash"?: string,"created_at"?: string,"id"?: string,"puzzle_content"?: NonNullable<Json>,"solution"?: NonNullable<Json>,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_fillable_cells":
{ Args: { "p_puzzle_content": Json }; Returns: {
              "col": number,"key": string,"row": number
            }[]
                           },
"_is_fillable":
{ Args: { "p_col": number,"p_puzzle_content": Json,"p_row": number }; Returns: boolean
                           },
"_is_solved":
{ Args: { "p_game_id": string,"p_owner_id": string }; Returns: boolean
                           },
"_lock_game":
{ Args: { "p_game_id": string }; Returns: {
              "game_id": string,
"puzzle_content": NonNullable<Json>,
"puzzle_date": string | null,
"puzzle_id": string | null,
"revision": number,
"solution": NonNullable<Json>
            }
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: true
        isSetofReturn: false
      } },
"_make_cell_id":
{ Args: { "p_col": number,"p_row": number }; Returns: string
                           },
"_make_json_board":
{ Args: { "p_cells": Json,"p_puzzle_content": Json,"p_writer_ids": (string)[] }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "g": Database["crosswords"]['Tables']["games"]['Row'],"p_ended": boolean }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_starting_cells":
{ Args: { "p_puzzle_content": Json }; Returns: Json
                           },
"_matches":
{ Args: { "p_fill": string,"p_sols": Json }; Returns: boolean
                           },
"_maybe_finish":
{ Args: { "p_caller": string,"p_game_id": string,"p_owner_id": string }; Returns: boolean
                           },
"_merge_cell":
{ Args: { "p_cells": Json,"p_changes": Json,"p_key": string }; Returns: Json
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_require_cell_write":
{ Args: { "p_game_id": string }; Returns: string
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"_writer_ids":
{ Args: { "p_game_id": string }; Returns: (string)[]
                           },
"check_cells":
{ Args: { "p_cells": Json,"p_game_id": string }; Returns: Json
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_board"?: Json,"p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"export_solution":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"library_for_club":
{ Args: { "p_club_handle": string }; Returns: Json
                           },
"next_nyt_date_for_club":
{ Args: { "p_dow": number,"p_seen_by": (string)[] }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"reveal_cells":
{ Args: { "p_cells": Json,"p_game_id": string }; Returns: Json
                           },
"reveal_solved_word":
{ Args: { "p_cells": Json,"p_game_id": string }; Returns: Json
                           },
"set_cell":
{ Args: { "p_col": number,"p_fill": string,"p_game_id": string,"p_pencil": boolean,"p_row": number }; Returns: Json
                           },
"set_mark":
{ Args: { "p_col": number,"p_game_id": string,"p_mark": string,"p_row": number,"p_side": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"letterboxed": {
          Tables: {
            "events": {
                  Row: {
                    "created_at": string,"game_id": string,"id": number,"kind": string,"n_covered_letters": number,"took_turn": boolean,"user_id": string,"word": string | null
                  }
                  Insert: {
                    "created_at"?: string,"game_id": string,"id"?: never,"kind": string,"n_covered_letters": number,"took_turn"?: boolean,"user_id": string,"word"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"game_id"?: string,"id"?: never,"kind"?: string,"n_covered_letters"?: number,"took_turn"?: boolean,"user_id"?: string,"word"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "game_id": string,"legal_band": number,"max_words": number,"sides": string,"solution": (string)[],"words": NonNullable<Json>
                  }
                  Insert: {
                    "game_id": string,"legal_band": number,"max_words": number,"sides": string,"solution": (string)[],"words": NonNullable<Json>
                  }
                  Update: {
                    "game_id"?: string,"legal_band"?: number,"max_words"?: number,"sides"?: string,"solution"?: (string)[],"words"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"players": {
                  Row: {
                    "chain": (string)[],"game_id": string,"hints_used": number,"user_id": string
                  }
                  Insert: {
                    "chain"?: (string)[],"game_id": string,"hints_used"?: number,"user_id": string
                  }
                  Update: {
                    "chain"?: (string)[],"game_id"?: string,"hints_used"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"seeds": {
                  Row: {
                    "band": number,"letters": string,"mask": number | null,"word_a": string,"word_b": string
                  }
                  Insert: {
                    "band": number,"letters": string,"mask"?: never,"word_a": string,"word_b": string
                  }
                  Update: {
                    "band"?: number,"letters"?: string,"mask"?: never,"word_a"?: string,"word_b"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_covered":
{ Args: { "p_chain": (string)[] }; Returns: number
                           },
"_make_json_asks":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"_make_json_chain":
{ Args: { "p_chain": (string)[] }; Returns: Json
                           },
"_make_json_events":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "lg": Database["letterboxed"]['Tables']["games"]['Row'],"p_ended": boolean }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_team_counts":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_tiles":
{ Args: { "p_sides": string }; Returns: Json
                           },
"_make_json_unclean_words":
{ Args: { "p_words": Json }; Returns: Json
                           },
"_n_par_words":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_require_chain_move":
{ Args: { "p_game_id": string }; Returns: string
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"candidate_words":
{ Args: { "p_board_mask": number,"p_max_band": number }; Returns: {
              "is_clean": boolean,"word": string
            }[]
                           },
"clear_chain":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_board": Json,"p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"log_hint_or_spoiler":
{ Args: { "p_game_id": string,"p_kind": string,"p_word_shown": string }; Returns: Json
                           },
"pick_seed":
{ Args: { "p_max_band": number }; Returns: {
              "band": number,"letters": string,"word_a": string,"word_b": string
            }[]
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"seed_for":
{ Args: { "p_board_letters": string }; Returns: {
              "band": number,"letters": string,"word_a": string,"word_b": string
            }[]
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_word":
{ Args: { "p_game_id": string,"p_word": string }; Returns: Json
                           },
"undo_word":
{ Args: { "p_game_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"psychicnum": {
          Tables: {
            "events": {
                  Row: {
                    "created_at": string,"game_id": string,"id": number,"is_correct": boolean,"kind": string,"took_turn": boolean,"user_id": string,"word": string
                  }
                  Insert: {
                    "created_at"?: string,"game_id": string,"id"?: never,"is_correct": boolean,"kind": string,"took_turn"?: boolean,"user_id": string,"word": string
                  }
                  Update: {
                    "created_at"?: string,"game_id"?: string,"id"?: never,"is_correct"?: boolean,"kind"?: string,"took_turn"?: boolean,"user_id"?: string,"word"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "game_id": string,"max_guesses": number,"secrets": (string)[],"words": (string)[]
                  }
                  Insert: {
                    "game_id": string,"max_guesses": number,"secrets": (string)[],"words": (string)[]
                  }
                  Update: {
                    "game_id"?: string,"max_guesses"?: number,"secrets"?: (string)[],"words"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"players": {
                  Row: {
                    "game_id": string,"n_found_secrets": number,"n_guesses_used": number,"user_id": string
                  }
                  Insert: {
                    "game_id": string,"n_found_secrets"?: number,"n_guesses_used"?: number,"user_id": string
                  }
                  Update: {
                    "game_id"?: string,"n_found_secrets"?: number,"n_guesses_used"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_make_json_board":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"_make_json_events":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "p_ended": boolean,"pg": Database["psychicnum"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_team_counts":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_maybe_finish_compete":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason": string,"p_reason_detail": string }; Returns: boolean
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_unfound_secret":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: string
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"request_hint":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"request_spoiler":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_guess":
{ Args: { "p_game_id": string,"p_guess": string }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
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
        },"scrabble": {
          Tables: {
            "events": {
                  Row: {
                    "created_at": string,"game_id": string,"id": number,"kind": string,"placements": Json | null,"score": number | null,"tile_count": number | null,"took_turn": boolean,"user_id": string,"words": (string)[] | null
                  }
                  Insert: {
                    "created_at"?: string,"game_id": string,"id"?: never,"kind": string,"placements"?: Json | null,"score"?: number | null,"tile_count"?: number | null,"took_turn"?: boolean,"user_id": string,"words"?: (string)[] | null
                  }
                  Update: {
                    "created_at"?: string,"game_id"?: string,"id"?: never,"kind"?: string,"placements"?: Json | null,"score"?: number | null,"tile_count"?: number | null,"took_turn"?: boolean,"user_id"?: string,"words"?: (string)[] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "bag": (string)[],"board": NonNullable<Json>,"consecutive_passes": number,"dict_2": number,"dict_3plus": number,"game_id": string,"team_rack": (string)[] | null,"version": number
                  }
                  Insert: {
                    "bag": (string)[],"board": NonNullable<Json>,"consecutive_passes"?: number,"dict_2": number,"dict_3plus": number,"game_id": string,"team_rack"?: (string)[] | null,"version"?: number
                  }
                  Update: {
                    "bag"?: (string)[],"board"?: NonNullable<Json>,"consecutive_passes"?: number,"dict_2"?: number,"dict_3plus"?: number,"game_id"?: string,"team_rack"?: (string)[] | null,"version"?: number
                  }
                  Relationships: [
                    
                  ]
                },"players": {
                  Row: {
                    "ai_level": string | null,"game_id": string,"rack": (string)[] | null,"score": number,"user_id": string
                  }
                  Insert: {
                    "ai_level"?: string | null,"game_id": string,"rack"?: (string)[] | null,"score"?: number,"user_id": string
                  }
                  Update: {
                    "ai_level"?: string | null,"game_id"?: string,"rack"?: (string)[] | null,"score"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_commit_exchange":
{ Args: { "p_base_version": number,"p_game_id": string,"p_rack_tiles": (string)[],"p_user_id": string }; Returns: Json
                           },
"_commit_pass":
{ Args: { "p_base_version": number,"p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"_commit_word":
{ Args: { "p_base_version": number,"p_game_id": string,"p_placements": Json,"p_score": number,"p_user_id": string,"p_words": (string)[] }; Returns: Json
                           },
"_finish":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_going_out_user_id": string,"p_reason": string,"p_reason_detail": string }; Returns: undefined
                           },
"_make_json_board":
{ Args: { "p_board": Json }; Returns: Json
                           },
"_make_json_events":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_placements":
{ Args: { "p_placements": Json }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_maybe_finish_compete":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string }; Returns: boolean
                           },
"_new_bag":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_remove_tiles":
{ Args: { "p_rack": (string)[],"p_remove": (string)[] }; Returns: (string)[]
                           },
"_require_bot":
{ Args: { "p_code": string,"p_game_id": string,"p_user_id": string }; Returns: string
                           },
"_require_move":
{ Args: { "p_base_version": number,"p_game_id": string,"p_race_code": string }; Returns: {
              "bag": (string)[],
"board": NonNullable<Json>,
"consecutive_passes": number,
"dict_2": number,
"dict_3plus": number,
"game_id": string,
"team_rack": (string)[] | null,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "games"
        isOneToOne: true
        isSetofReturn: false
      } },
"_require_person":
{ Args: { "p_code": string,"p_game_id": string }; Returns: string
                           },
"_score_leftovers":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_going_out_user_id": string }; Returns: undefined
                           },
"_team_score":
{ Args: { "p_game_id": string }; Returns: number
                           },
"_tile_value":
{ Args: { "p_tile": string }; Returns: number
                           },
"_title_for":
{ Args: { "p_game_id": string }; Returns: string
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"ai_exchange_tiles":
{ Args: { "p_base_version": number,"p_game_id": string,"p_rack_tiles": (string)[],"p_user_id": string }; Returns: Json
                           },
"ai_pass_turn":
{ Args: { "p_base_version": number,"p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"ai_play_word":
{ Args: { "p_base_version": number,"p_game_id": string,"p_placements": Json,"p_score": number,"p_user_id": string,"p_words": (string)[] }; Returns: Json
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"exchange_tiles":
{ Args: { "p_base_version": number,"p_game_id": string,"p_rack_tiles": (string)[] }; Returns: Json
                           },
"get_ai_context":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"get_suggest_context":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"pass_turn":
{ Args: { "p_base_version": number,"p_game_id": string }; Returns: Json
                           },
"play_word":
{ Args: { "p_base_version": number,"p_game_id": string,"p_placements": Json,"p_score": number,"p_words": (string)[] }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"setgame": {
          Tables: {
            "events": {
                  Row: {
                    "board_after": (number)[],"created_at": string,"game_id": string,"id": number,"kind": string,"tiles": (number)[],"took_turn": boolean,"user_id": string
                  }
                  Insert: {
                    "board_after": (number)[],"created_at"?: string,"game_id": string,"id"?: never,"kind": string,"tiles": (number)[],"took_turn"?: boolean,"user_id": string
                  }
                  Update: {
                    "board_after"?: (number)[],"created_at"?: string,"game_id"?: string,"id"?: never,"kind"?: string,"tiles"?: (number)[],"took_turn"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "board": (number)[],"deck": (number)[],"deck_kind": string,"deck_pos": number,"game_id": string,"palette": string
                  }
                  Insert: {
                    "board": (number)[],"deck": (number)[],"deck_kind": string,"deck_pos"?: number,"game_id": string,"palette": string
                  }
                  Update: {
                    "board"?: (number)[],"deck"?: (number)[],"deck_kind"?: string,"deck_pos"?: number,"game_id"?: string,"palette"?: string
                  }
                  Relationships: [
                    
                  ]
                },"players": {
                  Row: {
                    "game_id": string,"n_hints_used": number,"n_sets_found": number,"user_id": string
                  }
                  Insert: {
                    "game_id": string,"n_hints_used"?: number,"n_sets_found"?: number,"user_id": string
                  }
                  Update: {
                    "game_id"?: string,"n_hints_used"?: number,"n_sets_found"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_board_min":
{ Args: { "p_deck_kind": string }; Returns: number
                           },
"_deal_to_playable":
{ Args: { "p_board": (number)[],"p_deck": (number)[],"p_deck_kind": string,"p_deck_pos": number }; Returns: Record<string, unknown>
                           },
"_deck_size":
{ Args: { "p_deck_kind": string }; Returns: number
                           },
"_find_set":
{ Args: { "p_tiles": (number)[] }; Returns: (number)[]
                           },
"_find_set_with":
{ Args: { "p_tile": number,"p_tiles": (number)[] }; Returns: (number)[]
                           },
"_finish":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason_detail": string }; Returns: undefined
                           },
"_is_set":
{ Args: { "p_a": number,"p_b": number,"p_c": number }; Returns: boolean
                           },
"_make_json_events":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_tiles":
{ Args: { "p_tiles": (number)[] }; Returns: Json
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_third":
{ Args: { "p_a": number,"p_b": number }; Returns: number
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"record_hint":
{ Args: { "p_game_id": string,"p_tiles": (number)[] }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_set":
{ Args: { "p_game_id": string,"p_tiles": (number)[] }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"spellingbee": {
          Tables: {
            "found_words": {
                  Row: {
                    "found_at": string,"game_id": string,"is_bonus": boolean,"is_pangram": boolean,"points": number,"user_id": string,"word": string
                  }
                  Insert: {
                    "found_at"?: string,"game_id": string,"is_bonus": boolean,"is_pangram": boolean,"points": number,"user_id": string,"word": string
                  }
                  Update: {
                    "found_at"?: string,"game_id"?: string,"is_bonus"?: boolean,"is_pangram"?: boolean,"points"?: number,"user_id"?: string,"word"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "found_words_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "bonus_words": NonNullable<Json>,"center_letter": string,"game_id": string,"legal_band": number,"n_reqd_words": number,"outer_letters": string,"reqd_words_score": number,"required_band": number,"required_words": NonNullable<Json>,"target_rank": number | null,"_make_json_puzzle": Json | null,"_make_json_tiles": Json | null
                  }
                  Insert: {
                    "bonus_words": NonNullable<Json>,"center_letter": string,"game_id": string,"legal_band": number,"n_reqd_words": number,"outer_letters": string,"reqd_words_score": number,"required_band": number,"required_words": NonNullable<Json>,"target_rank"?: number | null
                  }
                  Update: {
                    "bonus_words"?: NonNullable<Json>,"center_letter"?: string,"game_id"?: string,"legal_band"?: number,"n_reqd_words"?: number,"outer_letters"?: string,"reqd_words_score"?: number,"required_band"?: number,"required_words"?: NonNullable<Json>,"target_rank"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"pangrams": {
                  Row: {
                    "has_rare_letters": boolean,"mask": number,"n_reqd_words": number
                  }
                  Insert: {
                    "has_rare_letters": boolean,"mask": number,"n_reqd_words": number
                  }
                  Update: {
                    "has_rare_letters"?: boolean,"mask"?: number,"n_reqd_words"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_make_json_found_words":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "g": Database["spellingbee"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_tiles":
{ Args: { "g": Database["spellingbee"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_word":
{ Args: { "p_bonus": boolean,"p_word": Json }; Returns: Json
                           },
"_make_json_words":
{ Args: { "p_bonus": boolean,"p_words": Json }; Returns: Json
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"candidate_words":
{ Args: { "p_center_bit": number,"p_legal_band": number,"p_puzzle_mask": number,"p_required_band": number }; Returns: {
              "is_required": boolean,"letter_mask": number,"word": string
            }[]
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_board": Json,"p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_word":
{ Args: { "p_game_id": string,"p_is_bonus": boolean,"p_is_pangram": boolean,"p_points": number,"p_word": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"stackdown": {
          Tables: {
            "boards": {
                  Row: {
                    "band": number,"created_at": string,"id": string,"tiles": NonNullable<Json>,"words": (string)[]
                  }
                  Insert: {
                    "band": number,"created_at"?: string,"id"?: string,"tiles": NonNullable<Json>,"words": (string)[]
                  }
                  Update: {
                    "band"?: number,"created_at"?: string,"id"?: string,"tiles"?: NonNullable<Json>,"words"?: (string)[]
                  }
                  Relationships: [
                    
                  ]
                },"events": {
                  Row: {
                    "created_at": string,"for_word_index": number | null,"game_id": string,"id": number,"kind": string,"tile_ids": (number)[] | null,"took_turn": boolean,"user_id": string,"valid": boolean | null,"word": string | null
                  }
                  Insert: {
                    "created_at"?: string,"for_word_index"?: number | null,"game_id": string,"id"?: never,"kind": string,"tile_ids"?: (number)[] | null,"took_turn"?: boolean,"user_id": string,"valid"?: boolean | null,"word"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"for_word_index"?: number | null,"game_id"?: string,"id"?: never,"kind"?: string,"tile_ids"?: (number)[] | null,"took_turn"?: boolean,"user_id"?: string,"valid"?: boolean | null,"word"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "board_id": string | null,"game_id": string,"solution": (string)[],"tiles": NonNullable<Json>
                  }
                  Insert: {
                    "board_id"?: string | null,"game_id": string,"solution": (string)[],"tiles": NonNullable<Json>
                  }
                  Update: {
                    "board_id"?: string | null,"game_id"?: string,"solution"?: (string)[],"tiles"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "games_board_id_fkey"
      columns: ["board_id"]
isOneToOne: false
      referencedRelation: "boards"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "game_id": string,"n_found_words": number,"user_id": string
                  }
                  Insert: {
                    "game_id": string,"n_found_words"?: number,"user_id": string
                  }
                  Update: {
                    "game_id"?: string,"n_found_words"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_cleared_tile_ids":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: (number)[]
                           },
"_found_title":
{ Args: { "n": number,"solution": (string)[] }; Returns: string
                           },
"_is_exposed":
{ Args: { "gone": (number)[],"tid": number,"tiles": Json }; Returns: boolean
                           },
"_make_json_board":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"_make_json_counts":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"_make_json_events":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "p_ended": boolean,"sg": Database["stackdown"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_team_counts":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_tiles":
{ Args: { "p_cleared_ids": (number)[],"p_tiles": Json }; Returns: Json
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_word":
{ Args: { "ids": (number)[],"tiles": Json }; Returns: string
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"reveal_next_hint":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"reveal_next_word":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_word":
{ Args: { "p_game_id": string,"p_tile_ids": (number)[] }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"strands": {
          Tables: {
            "events": {
                  Row: {
                    "created_at": string,"game_id": string,"id": number,"kind": string,"path": NonNullable<Json>,"result": string | null,"took_turn": boolean,"user_id": string,"word": string | null
                  }
                  Insert: {
                    "created_at"?: string,"game_id": string,"id"?: never,"kind": string,"path": NonNullable<Json>,"result"?: string | null,"took_turn"?: boolean,"user_id": string,"word"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"game_id"?: string,"id"?: never,"kind"?: string,"path"?: NonNullable<Json>,"result"?: string | null,"took_turn"?: boolean,"user_id"?: string,"word"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "band": number,"board": (string)[],"game_id": string,"hint_cost": number,"min_word_length": number,"puzzle_date": string | null,"puzzle_id": string | null,"puzzle_title": string,"solution": NonNullable<Json>
                  }
                  Insert: {
                    "band": number,"board": (string)[],"game_id": string,"hint_cost": number,"min_word_length": number,"puzzle_date"?: string | null,"puzzle_id"?: string | null,"puzzle_title": string,"solution": NonNullable<Json>
                  }
                  Update: {
                    "band"?: number,"board"?: (string)[],"game_id"?: string,"hint_cost"?: number,"min_word_length"?: number,"puzzle_date"?: string | null,"puzzle_id"?: string | null,"puzzle_title"?: string,"solution"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "games_puzzle_id_fkey"
      columns: ["puzzle_id"]
isOneToOne: false
      referencedRelation: "puzzles"
      referencedColumns: ["id"]
    }
                  ]
                },"players": {
                  Row: {
                    "active_hint_coords": Json | null,"game_id": string,"hint_points": number,"n_hints_used": number,"user_id": string
                  }
                  Insert: {
                    "active_hint_coords"?: Json | null,"game_id": string,"hint_points"?: number,"n_hints_used"?: number,"user_id": string
                  }
                  Update: {
                    "active_hint_coords"?: Json | null,"game_id"?: string,"hint_points"?: number,"n_hints_used"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"puzzles": {
                  Row: {
                    "board": (string)[],"id": string,"imported_at": string,"puzzle_date": string,"solution": NonNullable<Json>,"source_id": string,"title": string
                  }
                  Insert: {
                    "board": (string)[],"id"?: string,"imported_at"?: string,"puzzle_date": string,"solution": NonNullable<Json>,"source_id": string,"title": string
                  }
                  Update: {
                    "board"?: (string)[],"id"?: string,"imported_at"?: string,"puzzle_date"?: string,"solution"?: NonNullable<Json>,"source_id"?: string,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_consumed_keys":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: (string)[]
                           },
"_count_found_puzzle_words":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: number
                           },
"_finish_compete":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason": string,"p_reason_detail": string }; Returns: undefined
                           },
"_make_json_board":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"_make_json_events":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_found_puzzle_words":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "p_ended": boolean,"sg": Database["strands"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_puzzle_words":
{ Args: { "p_solution": Json }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_team_counts":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_tile_ids":
{ Args: { "p_coords": Json }; Returns: Json
                           },
"_make_json_tiles":
{ Args: { "p_board": (string)[] }; Returns: Json
                           },
"_maybe_finish_compete":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason": string,"p_reason_detail": string }; Returns: boolean
                           },
"_path_key":
{ Args: { "p_coords": Json }; Returns: (string)[]
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"next_puzzle_for_club":
{ Args: { "p_seen_by": (string)[] }; Returns: Json
                           },
"puzzle_for_date":
{ Args: { "p_date": string }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"spend_hint":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_path":
{ Args: { "p_game_id": string,"p_path": Json }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"waffle": {
          Tables: {
            "events": {
                  Row: {
                    "colors": string,"created_at": string,"game_id": string,"id": number,"kind": string,"letter_a": string,"letter_b": string,"pos_a": number,"pos_b": number,"took_turn": boolean,"user_id": string
                  }
                  Insert: {
                    "colors": string,"created_at"?: string,"game_id": string,"id"?: never,"kind": string,"letter_a": string,"letter_b": string,"pos_a": number,"pos_b": number,"took_turn"?: boolean,"user_id": string
                  }
                  Update: {
                    "colors"?: string,"created_at"?: string,"game_id"?: string,"id"?: never,"kind"?: string,"letter_a"?: string,"letter_b"?: string,"pos_a"?: number,"pos_b"?: number,"took_turn"?: boolean,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "board_at_setup": string,"game_id": string,"max_swaps": number,"par_swaps": number,"solution": string
                  }
                  Insert: {
                    "board_at_setup": string,"game_id": string,"max_swaps": number,"par_swaps": number,"solution": string
                  }
                  Update: {
                    "board_at_setup"?: string,"game_id"?: string,"max_swaps"?: number,"par_swaps"?: number,"solution"?: string
                  }
                  Relationships: [
                    
                  ]
                },"players": {
                  Row: {
                    "board": string,"game_id": string,"n_swaps_used": number,"user_id": string
                  }
                  Insert: {
                    "board": string,"game_id": string,"n_swaps_used"?: number,"user_id": string
                  }
                  Update: {
                    "board"?: string,"game_id"?: string,"n_swaps_used"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_board_colors":
{ Args: { "board": string,"solution": string }; Returns: string
                           },
"_color_rank":
{ Args: { "c": string }; Returns: number
                           },
"_correct_words":
{ Args: { "board": string,"solution": string }; Returns: (string)[]
                           },
"_finish_compete":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason": string,"p_reason_detail": string }; Returns: undefined
                           },
"_format_title":
{ Args: { "placeholder": string,"words": (string)[] }; Returns: string
                           },
"_make_json_board":
{ Args: { "p_board": string,"p_solution": string }; Returns: Json
                           },
"_make_json_events":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "p_ended": boolean,"wg": Database["waffle"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_team_counts":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_tiles":
{ Args: { "p_board": string,"p_colors": string }; Returns: Json
                           },
"_maybe_finish_compete":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason": string,"p_reason_detail": string }; Returns: boolean
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_sync_title":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"_word_slots":
{ Args: Record<PropertyKey, never>; Returns: {
              "start1": number,"stride": number
            }[]
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_board": Json,"p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_swap":
{ Args: { "p_game_id": string,"p_pos_a": number,"p_pos_b": number }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"wordiply": {
          Tables: {
            "events": {
                  Row: {
                    "created_at": string,"game_id": string,"id": number,"kind": string,"len": number,"reason": string | null,"took_turn": boolean,"user_id": string,"valid": boolean,"word": string
                  }
                  Insert: {
                    "created_at"?: string,"game_id": string,"id"?: never,"kind": string,"len": number,"reason"?: string | null,"took_turn"?: boolean,"user_id": string,"valid"?: boolean,"word": string
                  }
                  Update: {
                    "created_at"?: string,"game_id"?: string,"id"?: never,"kind"?: string,"len"?: number,"reason"?: string | null,"took_turn"?: boolean,"user_id"?: string,"valid"?: boolean,"word"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "base": string,"game_id": string,"legal_words": NonNullable<Json>,"longest_words": NonNullable<Json>,"max_word_len": number,"_make_json_puzzle": Json | null
                  }
                  Insert: {
                    "base": string,"game_id": string,"legal_words": NonNullable<Json>,"longest_words": NonNullable<Json>,"max_word_len": number
                  }
                  Update: {
                    "base"?: string,"game_id"?: string,"legal_words"?: NonNullable<Json>,"longest_words"?: NonNullable<Json>,"max_word_len"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_finish_compete":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason": string,"p_reason_detail": string }; Returns: undefined
                           },
"_length_score":
{ Args: { "p_longest": number,"p_max_len": number }; Returns: number
                           },
"_make_json_board":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"_make_json_events":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "g": Database["wordiply"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_track":
{ Args: { "p_ended": boolean,"p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"_maybe_finish_compete":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason": string,"p_reason_detail": string }; Returns: boolean
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_track_totals":
{ Args: { "p_game_id": string }; Returns: {
              "last_guess_at": string,"length_score": number,"longest_word_len": number,"n_guesses_used": number,"n_letters": number,"user_id": string
            }[]
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"candidate_bases":
{ Args: { "p_n": number,"p_source_band": number }; Returns: {
              "base": string
            }[]
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_board": Json,"p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"matching_words":
{ Args: { "p_base": string,"p_legal_band": number }; Returns: {
              "len": number,"word": string
            }[]
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_guess":
{ Args: { "p_fe_legal"?: boolean,"p_game_id": string,"p_word": string }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"try_base":
{ Args: { "p_base": string,"p_legal_band": number,"p_max_children": number,"p_min_children": number,"p_min_headroom": number }; Returns: {
              "legal_words": Json,"longest_words": Json,"max_word_len": number
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"wordle": {
          Tables: {
            "events": {
                  Row: {
                    "colors": string,"created_at": string,"game_id": string,"id": number,"is_correct": boolean,"kind": string,"took_turn": boolean,"user_id": string,"word": string
                  }
                  Insert: {
                    "colors": string,"created_at"?: string,"game_id": string,"id"?: never,"is_correct": boolean,"kind": string,"took_turn"?: boolean,"user_id": string,"word": string
                  }
                  Update: {
                    "colors"?: string,"created_at"?: string,"game_id"?: string,"id"?: never,"is_correct"?: boolean,"kind"?: string,"took_turn"?: boolean,"user_id"?: string,"word"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "game_id": string,"legal_band": number,"max_guesses": number,"target": string
                  }
                  Insert: {
                    "game_id": string,"legal_band"?: number,"max_guesses": number,"target": string
                  }
                  Update: {
                    "game_id"?: string,"legal_band"?: number,"max_guesses"?: number,"target"?: string
                  }
                  Relationships: [
                    
                  ]
                },"players": {
                  Row: {
                    "game_id": string,"n_guesses_used": number,"user_id": string
                  }
                  Insert: {
                    "game_id": string,"n_guesses_used"?: number,"user_id": string
                  }
                  Update: {
                    "game_id"?: string,"n_guesses_used"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_finish_compete":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason": string,"p_reason_detail": string }; Returns: undefined
                           },
"_make_json_board":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"_make_json_events":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "p_ended": boolean,"wg": Database["wordle"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_team_counts":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_maybe_finish_compete":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason": string,"p_reason_detail": string }; Returns: boolean
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_sync_title":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_guess":
{ Args: { "p_game_id": string,"p_guess": string }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"wordleone": {
          Tables: {
            "events": {
                  Row: {
                    "colors": string | null,"created_at": string,"game_id": string,"id": number,"is_correct": boolean | null,"kind": string,"took_turn": boolean,"user_id": string,"verdict": string,"word": string
                  }
                  Insert: {
                    "colors"?: string | null,"created_at"?: string,"game_id": string,"id"?: never,"is_correct"?: never,"kind": string,"took_turn"?: boolean,"user_id": string,"verdict": string,"word": string
                  }
                  Update: {
                    "colors"?: string | null,"created_at"?: string,"game_id"?: string,"id"?: never,"is_correct"?: never,"kind"?: string,"took_turn"?: boolean,"user_id"?: string,"verdict"?: string,"word"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "difficulty": string,"game_id": string,"legal_band": number,"load_bearing": number | null,"positive_space": number | null,"starter": string,"starter_colors": string,"target": string
                  }
                  Insert: {
                    "difficulty": string,"game_id": string,"legal_band": number,"load_bearing"?: number | null,"positive_space"?: number | null,"starter": string,"starter_colors": string,"target": string
                  }
                  Update: {
                    "difficulty"?: string,"game_id"?: string,"legal_band"?: number,"load_bearing"?: number | null,"positive_space"?: number | null,"starter"?: string,"starter_colors"?: string,"target"?: string
                  }
                  Relationships: [
                    
                  ]
                },"players": {
                  Row: {
                    "game_id": string,"n_misses": number,"user_id": string
                  }
                  Insert: {
                    "game_id": string,"n_misses"?: number,"user_id": string
                  }
                  Update: {
                    "game_id"?: string,"n_misses"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "players_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"ratings": {
                  Row: {
                    "answer": string,"answer_band": number | null,"comment": string | null,"created_at": string,"difficulty_asked": string | null,"game_id": string | null,"greens": number | null,"id": number,"legal_band": number,"load_bearing": number | null,"n_misses": number | null,"n_submits": number | null,"positive_space": number | null,"rated_difficulty": number | null,"seconds_measured": number | null,"seconds_reported": number | null,"solved_at": string | null,"starter": string,"starter_colors": string,"suggested_band": number | null,"user_id": string | null
                  }
                  Insert: {
                    "answer": string,"answer_band"?: number | null,"comment"?: string | null,"created_at"?: string,"difficulty_asked"?: string | null,"game_id"?: string | null,"greens"?: never,"id"?: never,"legal_band": number,"load_bearing"?: number | null,"n_misses"?: number | null,"n_submits"?: number | null,"positive_space"?: number | null,"rated_difficulty"?: number | null,"seconds_measured"?: number | null,"seconds_reported"?: number | null,"solved_at"?: string | null,"starter": string,"starter_colors": string,"suggested_band"?: number | null,"user_id"?: string | null
                  }
                  Update: {
                    "answer"?: string,"answer_band"?: number | null,"comment"?: string | null,"created_at"?: string,"difficulty_asked"?: string | null,"game_id"?: string | null,"greens"?: never,"id"?: never,"legal_band"?: number,"load_bearing"?: number | null,"n_misses"?: number | null,"n_submits"?: number | null,"positive_space"?: number | null,"rated_difficulty"?: number | null,"seconds_measured"?: number | null,"seconds_reported"?: number | null,"solved_at"?: string | null,"starter"?: string,"starter_colors"?: string,"suggested_band"?: number | null,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_finish_compete":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason": string,"p_reason_detail": string }; Returns: undefined
                           },
"_make_json_board":
{ Args: { "p_game_id": string,"p_user_id": string }; Returns: Json
                           },
"_make_json_events":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "p_ended": boolean,"wg": Database["wordleone"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_team_counts":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_maybe_finish_compete":
{ Args: { "p_ended_by_user_id": string,"p_game_id": string,"p_reason": string,"p_reason_detail": string }; Returns: boolean
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_sync_title":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_board": Json,"p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"rate_puzzle":
{ Args: { "p_comment"?: string,"p_game_id": string,"p_rated_difficulty"?: number,"p_seconds_reported"?: number,"p_suggested_band"?: number }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_guess":
{ Args: { "p_game_id": string,"p_guess": string }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"wordwheel": {
          Tables: {
            "found_words": {
                  Row: {
                    "found_at": string,"game_id": string,"is_bonus": boolean,"is_pangram": boolean,"points": number,"user_id": string,"word": string
                  }
                  Insert: {
                    "found_at"?: string,"game_id": string,"is_bonus": boolean,"is_pangram": boolean,"points": number,"user_id": string,"word": string
                  }
                  Update: {
                    "found_at"?: string,"game_id"?: string,"is_bonus"?: boolean,"is_pangram"?: boolean,"points"?: number,"user_id"?: string,"word"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "found_words_game_id_fkey"
      columns: ["game_id"]
isOneToOne: false
      referencedRelation: "games"
      referencedColumns: ["game_id"]
    }
                  ]
                },"games": {
                  Row: {
                    "bonus_words": NonNullable<Json>,"center_letter": string,"game_id": string,"legal_band": number,"n_reqd_words": number,"outer_letters": string,"reqd_words_score": number,"required_band": number,"required_words": NonNullable<Json>,"target_rank": number | null,"_make_json_puzzle": Json | null,"_make_json_tiles": Json | null
                  }
                  Insert: {
                    "bonus_words": NonNullable<Json>,"center_letter": string,"game_id": string,"legal_band": number,"n_reqd_words": number,"outer_letters": string,"reqd_words_score": number,"required_band": number,"required_words": NonNullable<Json>,"target_rank"?: number | null
                  }
                  Update: {
                    "bonus_words"?: NonNullable<Json>,"center_letter"?: string,"game_id"?: string,"legal_band"?: number,"n_reqd_words"?: number,"outer_letters"?: string,"reqd_words_score"?: number,"required_band"?: number,"required_words"?: NonNullable<Json>,"target_rank"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"pangrams": {
                  Row: {
                    "band": number,"has_rare_letters": boolean,"letters": string,"mask": number | null,"word_counts": NonNullable<Json>
                  }
                  Insert: {
                    "band": number,"has_rare_letters": boolean,"letters": string,"mask"?: never,"word_counts": NonNullable<Json>
                  }
                  Update: {
                    "band"?: number,"has_rare_letters"?: boolean,"letters"?: string,"mask"?: never,"word_counts"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_make_json_found_words":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_players":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_puzzle":
{ Args: { "g": Database["wordwheel"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_static_game_data":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_summary_data":
{ Args: { "p_game_id": string,"p_status_changed_at": string }; Returns: Json
                           },
"_make_json_team":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"_make_json_tiles":
{ Args: { "g": Database["wordwheel"]['Tables']["games"]['Row'] }; Returns: Json
                           },
"_make_json_word":
{ Args: { "p_bonus": boolean,"p_word": Json }; Returns: Json
                           },
"_make_json_words":
{ Args: { "p_bonus": boolean,"p_words": Json }; Returns: Json
                           },
"_rebuild_data_cols":
{ Args: { "p_game_id": string,"p_update_status_changed_at": boolean }; Returns: undefined
                           },
"_rebuild_data_cols_for_all":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"_write_static_game_data":
{ Args: { "p_game_id": string }; Returns: undefined
                           },
"candidate_words":
{ Args: { "p_center_bit": number,"p_legal_band": number,"p_puzzle_mask": number,"p_required_band": number }; Returns: {
              "is_required": boolean,"letter_mask": number,"word": string
            }[]
                           },
"concede":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"create_game":
{ Args: { "p_board": Json,"p_club_handle": string,"p_mode": string,"p_player_user_ids": (string)[],"p_setup": Json }; Returns: Json
                           },
"replay_board":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"stop_game":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_timeout":
{ Args: { "p_game_id": string }; Returns: Json
                           },
"submit_word":
{ Args: { "p_game_id": string,"p_is_bonus": boolean,"p_is_pangram": boolean,"p_points": number,"p_word": string }; Returns: Json
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "bananagrams": {
          Enums: {
            
          }
        },"boggle": {
          Enums: {
            
          }
        },"codenamesduet": {
          Enums: {
            
          }
        },"common": {
          Enums: {
            
          }
        },"connections": {
          Enums: {
            
          }
        },"crosswords": {
          Enums: {
            
          }
        },"graphql_public": {
          Enums: {
            
          }
        },"letterboxed": {
          Enums: {
            
          }
        },"psychicnum": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        },"scrabble": {
          Enums: {
            
          }
        },"setgame": {
          Enums: {
            
          }
        },"spellingbee": {
          Enums: {
            
          }
        },"stackdown": {
          Enums: {
            
          }
        },"strands": {
          Enums: {
            
          }
        },"waffle": {
          Enums: {
            
          }
        },"wordiply": {
          Enums: {
            
          }
        },"wordle": {
          Enums: {
            
          }
        },"wordleone": {
          Enums: {
            
          }
        },"wordwheel": {
          Enums: {
            
          }
        }
} as const
