// cs-blessed-psychicnum

import { supabase } from '@/common/supabase/supabase'

/**
 * Pre-bound DB handle for the `psychicnum` Postgres schema.
 *
 * Usage from inside `src/psychicnum/`:
 *
 *     import { db } from '../db'
 *
 *     const { data } = await db.from('games_state').select('words,secrets')...
 *     await db.rpc('submit_guess', { target_game: id, guess: 'lantern' })
 *
 * Same pattern as `src/codenamesduet/db.ts` — game schemas are
 * deliberately omitted from PostgREST's `extra_search_path`
 * (see docs/code-conventions.md), so addressing psychicnum tables
 * from the FE goes through this handle.
 */
export const db = supabase.schema('psychicnum')
