import { supabase } from '../common/lib/supabase/supabase'

/**
 * Pre-bound DB handle for the `setgame` Postgres schema.
 *
 *     import { db } from '../db'
 *     await db.from('games_state').select(...)
 *     await db.rpc('submit_set', { target_game: id, cards })
 *
 * The FE reads `games_state` — the `security_invoker` view — and never the base
 * `setgame.games` table, because `deck` is withheld by a column grant and a
 * `select *` on the base table would simply error. The view answers "how many
 * cards are left" (`deck_left`) without saying which, which is the only thing
 * about this game that is ever hidden from a player.
 */
export const db = supabase.schema('setgame')
