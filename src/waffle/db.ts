import { supabase } from '../common/lib/supabase'

/**
 * Pre-bound DB handle for the `waffle` (SyrupSwap) Postgres schema.
 *
 * Usage from inside `src/waffle/`:
 *
 *     import { db } from '../db'
 *     await db.from('games_state').select(...)
 *     await db.rpc('submit_swap', { target_game: id, pos_a, pos_b })
 *
 * Same pattern as the other games. The FE reads `games_state` /
 * `players_state` (the security_invoker views), never the base
 * `waffle.games` / `waffle.players` tables — the views are the only
 * path to the gated `solution` (revealed post-terminal) and to the
 * board/colors (an opponent's board is hidden mid-compete).
 */
export const db = supabase.schema('waffle')
