// cs-unmet

import { supabase } from '@/common/supabase/supabase'

/**
 * Pre-bound DB handle for the `wordsy` Postgres schema. The page reads the
 * blobs on `common.games`, so the only calls through this are the RPCs.
 */
export const db = supabase.schema('wordsy')
