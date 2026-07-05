import { supabase } from '../common/lib/supabase/supabase'

/** Schema-scoped Supabase client for crosswords. Every `.from(...)` /
 *  `.rpc(...)` in this game folder goes through it. Common-side reads
 *  (the game header, players, presence) go through `useCommonGame`, not
 *  this client. */
export const db = supabase.schema('crosswords')
