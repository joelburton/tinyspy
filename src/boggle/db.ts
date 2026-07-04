import { supabase } from '../common/lib/supabase/supabase'

/**
 * boggle-schema-scoped supabase client. Imported by every boggle-side query
 * (`.from('games')`, `.from('found_words')`) and RPC call (`.rpc('submit_word')`,
 * `.rpc('end_game')`, `.rpc('submit_timeout')`) so the schema is applied
 * uniformly without each call site repeating it.
 *
 * Unlike spellingbee, boggle has NO hidden-solution view — `required_words` is a
 * readable column on `boggle.games` (the trust model doesn't withhold it; the FE
 * uses it to classify guesses + render the missed-words reveal). So the FE reads
 * `boggle.games` directly.
 */
export const db = supabase.schema('boggle')
