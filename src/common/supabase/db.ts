// cs-audited-supabase

import { supabase } from './supabase'

/**
 * Pre-bound DB handle for the `common` Postgres schema.
 *
 * Usage from inside `src/common/`:
 *
 *     import { db } from '../supabase/db'
 *
 *     const { data } = await db.from('profiles').select('username')...
 *     await db.rpc('some_common_rpc', { ... })
 *
 * Equivalent to `supabase.schema('common').from(...)` at every call
 * site — the handle just saves the repetition and reads more like
 * "this is a common-schema query." For auth, edge functions, and
 * Realtime channels, keep using `supabase` directly (those aren't
 * schema-scoped).
 *
 * A game folder has a `db` of its own, bound to the game's schema, and its
 * `'../db'` is that one. Game code that needs `common` tables imports this
 * handle through the alias and renames it clear of the local one:
 * `import { db as commonDb } from '@/common/supabase/db'`.
 */
export const db = supabase.schema('common')
