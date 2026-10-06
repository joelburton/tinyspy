// cs-unmet

import { supabase } from '@/common/supabase/supabase'

/**
 * strands' PostgREST handle — scopes every RPC to the `strands` schema so call
 * sites read `db.rpc('submit_path', …)` rather than repeating the schema name.
 * Same one-liner every game folder exports.
 *
 * The page reads none of this schema's tables: everything it shows arrives in
 * the `game_data` blob. What goes through here is the RPCs.
 */
export const db = supabase.schema('strands')
