import { supabase } from '../common/lib/supabase'

/**
 * connections-schema-scoped supabase client. Imported by every
 * connections-side query (.from('games'), .from('guesses'), ...)
 * and RPC call (.rpc('create_game', ...)) so the schema is
 * applied uniformly without each call site spelling it.
 */
export const db = supabase.schema('connections')
