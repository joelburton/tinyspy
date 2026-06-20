import { supabase } from '../common/lib/supabase'

/**
 * Pre-bound DB handle for the `monkeygram` Postgres schema.
 *
 * Usage from inside `src/monkeygram/`:
 *
 *     import { db } from '../db'
 *
 *     const { data } = await db.from('player_boards').select('board, tiles')...
 *     await db.rpc('create_game', { target_club, setup, player_user_ids })
 *
 * Same pattern as the other game schemas — gametype schemas are
 * deliberately omitted from PostgREST's `extra_search_path` (see
 * docs/code-conventions.md), so addressing monkeygram tables from
 * the FE goes through this handle.
 */
export const db = supabase.schema('monkeygram')
