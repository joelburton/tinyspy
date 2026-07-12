import { supabase } from '../common/lib/supabase/supabase'

/**
 * wordiply-schema-scoped supabase client. Imported by every wordiply-side
 * query (`.from('games_state')`, `.from('guesses')`) and RPC call
 * (`.rpc('submit_guess', ...)`) so the schema is applied uniformly without
 * each call site repeating it.
 *
 * Unlike the hidden-solution games, `wordiply.games_state` hides nothing —
 * the base, the length lists, and the longest word all ship to the FE
 * (we don't care about cheating). The FE simply declines to RENDER the
 * scores + the longest word until terminal.
 */
export const db = supabase.schema('wordiply')
