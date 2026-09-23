// cs-met-spellingbee

import { supabase } from '@/common/supabase/supabase'

/**
 * spellingbee-schema-scoped supabase client. Imported by every
 * spellingbee-side query (.from('games_state'), .from('found_words'))
 * and RPC call (.rpc('submit_word', ...)) so the schema is
 * applied uniformly without each call site repeating it.
 *
 * The header is read through the `games_state` view, never the table — the
 * uniform seam every game reads, even though this one hides no column.
 */
export const db = supabase.schema('spellingbee')
