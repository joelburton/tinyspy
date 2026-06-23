import { supabase } from '../common/lib/supabase'

/**
 * Pre-bound DB handle for the `wordle` (WordNerd) Postgres schema.
 *
 * Usage from inside `src/wordle/`:
 *
 *     import { db } from '../db'
 *     await db.from('games_state').select(...)
 *     await db.rpc('submit_guess', { target_game: id, guess })
 *
 * Same pattern as the other games. The FE reads `games_state` (the
 * security_invoker view) for the game header, never the base
 * `wordle.games` table — the view is the only path to the gated
 * `target` (revealed post-terminal).
 */
export const db = supabase.schema('wordle')
