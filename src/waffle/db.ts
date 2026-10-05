// cs-unmet

import { supabase } from '@/common/supabase/supabase'

/**
 * Pre-bound DB handle for the `waffle` (waffle) Postgres schema.
 *
 * Usage from inside `src/waffle/`:
 *
 *     import { db } from '../db'
 *     await db.rpc('submit_swap', { p_game_id: id, p_pos_a: a, p_pos_b: b })
 *
 * The page reads no table: what it draws is the `game_data` blob the RPCs
 * rebuild after every move (plans/seat-view.md), so this handle is for the
 * RPCs.
 */
export const db = supabase.schema('waffle')
