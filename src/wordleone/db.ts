// cs-unmet

import { supabase } from '@/common/supabase/supabase'

/**
 * Pre-bound DB handle for the `wordleone` Postgres schema, for its RPCs:
 *
 *     import { db } from '../db'
 *     await db.rpc('submit_guess', { p_game_id: id, p_guess: guess })
 *
 * The page reads none of the schema's tables; it reads the blobs its builder
 * writes onto `common.games`. A new game is the `wordleone-build-board` edge
 * function's, not an RPC here.
 */
export const db = supabase.schema('wordleone')
