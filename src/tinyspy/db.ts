import { supabase } from '../common/lib/supabase'

/**
 * Pre-bound DB handle for the `tinyspy` Postgres schema.
 *
 * Usage from inside `src/tinyspy/`:
 *
 *     import { db } from '../db'
 *
 *     const { data } = await db.from('games').select('*')...
 *     await db.rpc('submit_clue', { ... })
 *
 * Equivalent to `supabase.schema('tinyspy').from(...)` at every call
 * site, but reads better and keeps the schema name in one place. For
 * auth, edge functions, and Realtime channels, keep using `supabase`
 * directly (those aren't schema-scoped).
 *
 * Game schemas are deliberately omitted from PostgREST's
 * `extra_search_path` (see docs/naming.md), so going through this
 * handle is also the only way to address tinyspy tables from the FE.
 */
export const db = supabase.schema('tinyspy')
