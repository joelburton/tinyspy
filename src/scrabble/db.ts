// cs-unmet

import { supabase } from '@/common/supabase/supabase'

/**
 * scrabble's PostgREST handle, scoped to the `scrabble` schema, so a call site
 * reads `db.rpc('play_word', …)` rather than repeating the schema name. The
 * page calls RPCs through it and reads nothing: what it shows comes from the
 * blobs on `common.games` (docs/games/scrabble.md → The page blobs).
 */
export const db = supabase.schema('scrabble')
