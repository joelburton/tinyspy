import { supabase } from '../common/lib/supabase/supabase'

/**
 * letterboxed-schema-scoped supabase client. Imported by every letterboxed
 * query (`.from('games_state')`, `.from('players_state')`, `.from('events')`)
 * and RPC call (`.rpc('submit_word', …)`) so the schema is applied uniformly
 * without each call site repeating it.
 *
 * `games_state` hides nothing: the board's whole playable word list ships to
 * the FE from game start (it is what the local hint search will run over), and
 * so does the seeded two-word solution — the FE simply declines to RENDER the
 * solution until terminal. The one thing that IS gated is a compete rival's
 * CHAIN, and that lives behind `players_state` rather than here.
 */
export const db = supabase.schema('letterboxed')
