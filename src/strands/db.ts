import { supabase } from '../common/lib/supabase/supabase'

/**
 * Pre-bound DB handle for the `strands` Postgres schema.
 *
 *     import { db } from '../db'
 *     await db.from('games_state').select(...)
 *     await db.rpc('submit_path', { target_game: id, path })
 *
 * The FE reads `games_state` — the `security_invoker` view — and never the base
 * `strands.games` table. That is not a style preference here: `solution` is
 * hidden by a column grant, and the view is the only path by which it is ever
 * handed over (once `common.games.solution_revealed`). Reading the base table
 * would simply error.
 */
export const db = supabase.schema('strands')
