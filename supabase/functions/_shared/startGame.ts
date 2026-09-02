// cs-unmet

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
import { fault } from './envelope.ts'
import { runRpc } from './dbResult.ts'
import type { Database } from '../../../src/types/db.ts'

/**
 * TYPED against the generated `Database`, which is what makes a wrong table or
 * RPC name a compile error rather than a runtime 500. It wasn't, and that cost a
 * real game: `scrabble-ai-move` called `ai_pass` / `ai_exchange` where the SQL
 * defines `ai_pass_turn` / `ai_exchange_tiles`, and since the names are just
 * strings to an untyped client, neither `deno check` nor the build could see it.
 * The bug only fired on the branch the AI hadn't needed yet — ~30 moves in.
 *
 * A Supabase client acting AS THE CALLER — their JWT rides on every request, so the
 * security-definer `create_game` RPC (and any candidate-word reads) see the real user
 * for the club-membership check. Every board-builder needs exactly this client; the
 * `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `Authorization` plumbing now lives here once
 * (a future auth change touches one place, not five).
 */
export function callerClient(authHeader: string): SupabaseClient<Database> {
  return createClient<Database>(
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

  // All four gates are FAULTS on the form as a whole. The setup dialog composes
  // every one of these fields itself — there is no control a player can put a
  // missing club or a mode of "banana" into — so if one arrives wrong, the
  // frontend is broken and no field of the form is the place to say so.
  if (!targetClub || typeof targetClub !== 'string') {
    console.log(`${fnName} reject: missing target_club; body keys =`, Object.keys(body))
    return fault('PN112', 'BUG: game with no club', `${fnName}: target_club`)
  }
  if (!setup || typeof setup !== 'object') {
    console.log(`${fnName} reject: missing/invalid setup`)
    return fault('PN113', 'BUG: game with no settings', `${fnName}: setup`)
  }
  if (mode !== 'coop' && mode !== 'compete') {
    console.log(`${fnName} reject: invalid mode "${mode}"`)
    return fault('PN114', `BUG: game mode of '${mode}'`, `${fnName}: mode`)
  }
  if (!Array.isArray(playerUserIds) || playerUserIds.length === 0) {
    console.log(`${fnName} reject: missing player_user_ids`)
    return fault('PN115', 'BUG: game with no players', `${fnName}: player_user_ids`)
  }
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    console.log(`${fnName} reject: no Authorization header`)
    return fault('PN116', 'You are not signed in.', `${fnName}: no Authorization header`)
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
 * over PostgREST (as the caller) and hand back what it said. The board payload
 * is game-specific, passed straight through in `args.board`.
 *
 * A converted `create_game` RETURNS its envelope rather than raising one, so the
 * happy path and every refusal arrive down the same `data` channel and this
 * relay does not read them. It forwards the envelope untouched, which is what
 * lets a raise written in SQL reach the player with its own words and its own
 * field — nothing in the two hops between rewrites it.
 *
 * The two failures that are NOT the RPC's own — it never ran, or it answered
 * something that is not an envelope — belong to `runRpc`, which turns each into
 * a fault carrying the RPC's name. So there is nothing left for this function
 * to decide: it relays.
 *
 * `fnName` is the diagnostic tag on the one line this logs; the envelope's own
 * line comes from `runRpc`.
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
  const res = await runRpc(supabase.schema(schema).rpc('create_game', args), 'create_game')
  if (fnName) console.log(`${fnName} create_game said:`, JSON.stringify(res))
  return json(res)
}
