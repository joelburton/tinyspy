// Shared game-creation scaffolding for the board-builder edge functions (boggle,
// waffle, spellingbee). Like `_shared/http.ts`, this lives under `_shared/` so the
// deployed functions can import it but it isn't itself deployed. It captures the two
// log-free, byte-identical pieces of the create-a-game handoff; the INPUT parsing +
// board-building stay per-function (their error wording + the diagnostic `console.log`
// trail genuinely differ per game, and the board payload is game-specific).

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json } from './http.ts'

/**
 * A Supabase client acting AS THE CALLER — their JWT rides on every request, so the
 * security-definer `create_game` RPC (and any candidate-word reads) see the real user
 * for the club-membership check. Every board-builder needs exactly this client; the
 * `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `Authorization` plumbing now lives here once
 * (a future auth change touches one place, not three).
 */
export function callerClient(authHeader: string): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
}

/**
 * The create_game handoff a board-builder ends with: call `<schema>.create_game` over
 * PostgREST (as the caller) and map its result to the function's HTTP response — an
 * RPC error → 400 (the RPC is the authority on membership + setup validation, so its
 * message is the user-facing one), a missing row → 500, else `{ id }`. The board
 * payload is game-specific, passed straight through in `args.board`.
 *
 * Note: no `console.log` here on purpose. boggle's tail is exactly this; waffle +
 * spellingbee wrap their create_game call in bespoke diagnostic logs, so they keep
 * their tails inline rather than lose those log lines (see docs/deferred.md).
 */
export async function invokeCreateGame(
  supabase: SupabaseClient,
  schema: string,
  args: {
    target_club: string
    setup: unknown
    player_user_ids: string[]
    mode: string
    board: unknown
  },
): Promise<Response> {
  const { data, error } = await supabase.schema(schema).rpc('create_game', args)
  if (error) return json({ error: error.message }, 400)
  const rows = (data as Array<{ id: string }> | null) ?? []
  if (rows.length === 0) return json({ error: 'create_game returned no row' }, 500)
  return json({ id: rows[0].id })
}
