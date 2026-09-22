// cs-met-wordle

import { supabase } from '@/common/supabase/supabase'

/**
 * Pre-bound DB handle for the `wordle` Postgres schema.
 *
 * Usage from inside `src/wordle/`:
 *
 *     import { db } from '../db'
 *     await db.from('games_state').select(...)
 *     await db.rpc('submit_guess', { target_game: id, guess })
 *
 * The FE reads `games_state` (the security_invoker view) for the game
 * header, never the base `wordle.games` table — the view is the path to
 * the gated `target`, which it hands over once the game is terminal.
 */
export const db = supabase.schema('wordle')
