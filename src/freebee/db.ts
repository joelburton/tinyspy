import { supabase } from '../common/lib/supabase'

/**
 * Freebee-schema-scoped supabase client. Imported by every
 * freebee-side query (.from('games_state'), .from('found_words'))
 * and RPC call (.rpc('submit_word', ...)) so the schema is
 * applied uniformly without each call site repeating it.
 *
 * Note that `freebee.games_state` is a VIEW that conditionally
 * exposes the hidden scoring_words / legal_words columns based
 * on common.games.is_terminal. The base `freebee.games` table
 * has a column-level grant that blocks the wordlists for the
 * `authenticated` role; the view is the only path to them. The
 * FE never queries `freebee.games` directly.
 */
export const db = supabase.schema('freebee')
