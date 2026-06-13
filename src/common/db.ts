import { supabase } from './lib/supabase'

/**
 * Pre-bound DB handle for the `common` Postgres schema.
 *
 * Usage from inside `src/common/`:
 *
 *     import { db } from '../db'
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
 * Cross-feature components/hooks that need to address `common`
 * tables from inside a game folder can import this as
 * `import { db as commonDb } from '../../common/db'` to alias around
 * a same-named `db` from the local feature.
 */
export const db = supabase.schema('common')
