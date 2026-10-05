// cs-unmet

import { supabase } from '@/common/supabase/supabase'

/**
 * Pre-bound DB handle for the `letterboxed` Postgres schema.
 *
 * Usage from inside `src/letterboxed/`:
 *
 *     import { db } from '../db'
 *     await db.rpc('submit_word', { p_game_id: id, p_word: word })
 *
 * The page reads no table: what it draws is the `game_data` blob the RPCs
 * rebuild after every move (plans/seat-view.md), so this handle is for the
 * RPCs.
 */
export const db = supabase.schema('letterboxed')
