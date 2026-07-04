import { supabase } from '../common/lib/supabase/supabase'

/**
 * scrabble's PostgREST handle — scopes every query/RPC to the
 * `scrabble` schema so call sites read `db.from('games_state')` rather
 * than repeating the schema name.
 *
 * The FE reads the `games_state` / `players_state` VIEWS, never the base
 * tables: the views hide the bag (exposing only `bag_count`) and gate a
 * compete player's rack to its owner until the game ends. See
 * docs/games/scrabble.md §4.3.
 */
export const db = supabase.schema('scrabble')
