import { supabase } from '../common/lib/supabase'

/**
 * stackdown's PostgREST handle — scopes every query/RPC to the
 * `stackdown` schema so call sites read `db.from('games')` rather
 * than repeating the schema name. Same one-liner every game folder
 * exports.
 *
 * Note: the FE never reads the base `games` table for the solution —
 * that column is grant-excluded. It reads the `games_state` view,
 * which only exposes `solution` once the game is terminal (see
 * docs/games/stackdown.md → hidden-solution pattern).
 */
export const db = supabase.schema('stackdown')
