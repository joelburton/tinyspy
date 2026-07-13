// Shared game-creation scaffolding for the board-builder edge functions
// (spellingbee, wordwheel, wordiply, waffle, boggle). Like `_shared/http.ts`,
// this lives under `_shared/` so the deployed functions can import it but it
// isn't itself deployed. It captures the pieces every board-builder repeats
// verbatim: the caller-scoped client, the request parse/validate GATE, and the
// create_game handoff. Only the board GENERATION + the per-game SETUP-field
// validation (word bands, dice set, the s-rule, custom letters…) stay
// per-function — that's where the games genuinely differ.
//
// Diagnostic logs are kept (the keep-logs prior): `parseBuildBoardRequest`
// always logs, and `invokeCreateGame` logs when given a `fnName`. Both tag the
// line with the function name so a shared log still says which game emitted it.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json } from './http.ts'

/**
 * A Supabase client acting AS THE CALLER — their JWT rides on every request, so the
 * security-definer `create_game` RPC (and any candidate-word reads) see the real user
 * for the club-membership check. Every board-builder needs exactly this client; the
 * `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `Authorization` plumbing now lives here once
 * (a future auth change touches one place, not five).
 */
export function callerClient(authHeader: string): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
}

/** The validated request every board-builder needs before it can generate a
 *  board: the four common fields + the caller-scoped client. `setup` stays
 *  untyped (each game casts it to its own Setup and validates its own fields). */
export type BuildBoardRequest = {
  targetClub: string
  setup: Record<string, unknown>
  mode: 'coop' | 'compete'
  playerUserIds: string[]
  authHeader: string
  supabase: SupabaseClient
}

/**
 * Parse + validate the four fields every board-builder takes (`target_club`,
 * `setup`, `mode`, `player_user_ids`) plus the `Authorization` header, and build
 * the caller-scoped client. Returns the validated request, or a ready-to-send
 * error `Response` (400/401) — callers do `if (x instanceof Response) return x`.
 *
 * Logs are tagged with `fnName` (e.g. "wordwheel-build-board"): a one-line entry
 * trace, a `reject:` line per failed gate (so the early returns aren't silent in
 * the serve log), and an `accepted:` line. Game-specific setup validation (bands,
 * dice set, custom letters…) stays in the caller, AFTER this returns.
 */
export async function parseBuildBoardRequest(
  req: Request,
  fnName: string,
): Promise<BuildBoardRequest | Response> {
  // Entry trace so the serve output shows the request arrived even when the body
  // is unparseable (the early 400/401 returns would otherwise look silent).
  console.log(`${fnName}: request received`)
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const targetClub = body.target_club
  const setup = body.setup
  const playerUserIds = body.player_user_ids
  const mode = body.mode

  if (!targetClub || typeof targetClub !== 'string') {
    console.log(`${fnName} reject: missing target_club; body keys =`, Object.keys(body))
    return json({ error: 'target_club (uuid string) required' }, 400)
  }
  if (!setup || typeof setup !== 'object') {
    console.log(`${fnName} reject: missing/invalid setup`)
    return json({ error: 'setup (object) required' }, 400)
  }
  if (mode !== 'coop' && mode !== 'compete') {
    console.log(`${fnName} reject: invalid mode "${mode}"`)
    return json({ error: 'mode ("coop" | "compete") required' }, 400)
  }
  if (!Array.isArray(playerUserIds) || playerUserIds.length === 0) {
    console.log(`${fnName} reject: missing player_user_ids`)
    return json({ error: 'player_user_ids (non-empty uuid[]) required' }, 400)
  }
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    console.log(`${fnName} reject: no Authorization header`)
    return json({ error: 'authorization required' }, 401)
  }

  console.log(`${fnName} accepted: target_club=${targetClub}, players=${playerUserIds.length}`)
  return {
    targetClub,
    setup: setup as Record<string, unknown>,
    mode,
    playerUserIds: playerUserIds as string[],
    authHeader,
    supabase: callerClient(authHeader),
  }
}

/**
 * The create_game handoff a board-builder ends with: call `<schema>.create_game`
 * over PostgREST (as the caller) and map its result to the function's HTTP
 * response — an RPC error → 400 (the RPC is the authority on membership + setup
 * validation, so its message is the user-facing one), a missing row → 500, else
 * `{ id }`. The board payload is game-specific, passed straight through in
 * `args.board`.
 *
 * Pass `fnName` to emit the tagged diagnostic logs (RPC error / no-row / success
 * id); omit it for a silent handoff.
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
  fnName?: string,
): Promise<Response> {
  const { data, error } = await supabase.schema(schema).rpc('create_game', args)
  if (error) {
    if (fnName) console.log(`${fnName} create_game RPC error:`, error.message)
    return json({ error: error.message }, 400)
  }
  const rows = (data as Array<{ id: string }> | null) ?? []
  if (rows.length === 0) {
    if (fnName) console.log(`${fnName} reject: create_game returned no row`)
    return json({ error: 'create_game returned no row' }, 500)
  }
  if (fnName) console.log(`${fnName} success: id=${rows[0].id}`)
  return json({ id: rows[0].id })
}
