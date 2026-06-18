import { supabase } from '../common/lib/supabase'

/**
 * wordknit-schema-scoped supabase client. Imported by every
 * wordknit-side query (.from('games'), .from('guesses'), ...)
 * and RPC call (.rpc('create_game', ...)) so the schema is
 * applied uniformly without each call site spelling it.
 */
export const db = supabase.schema('wordknit')
