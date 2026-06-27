/**
 * boggle-build-board — Edge Function that rolls a MothCubes board meeting the
 * setup's constraints and creates the game in one round-trip.
 *
 * Why edge (not PL/pgSQL): board generation is a rejection-sampling loop over a
 * trie solver — far cleaner in TypeScript, and it reuses the exact solver the
 * rest of the game uses (`src/boggle/lib/`), kept honest by the C parity oracle
 * in `boggle-c-solver/`. The required dictionary ships bundled (see dict.ts).
 *
 * Flow:
 *   1. Verify the caller's JWT, read inputs.                    [Phase 3]
 *   2. Build the required trie for the chosen band (bundled, cached).
 *   3. generateBoard(): roll + solve + reject until constraints met (or fail).
 *      SYNCHRONOUS — the solver keeps mutable scratch across the loop, so we must
 *      not await between iterations. The trie build (await) is before it; the DB
 *      write (await) is after. Nothing awaits inside the loop.
 *   4. boggle.create_game(...) over PostgREST.                  [Phase 3]
 *   5. Return { id }.
 *
 * Phase 2 status: steps 2–3 are wired and the board is returned directly for
 * latency/shape testing. Steps 1 + 4 (auth + create_game) land in Phase 3, once
 * the schema exists.
 *
 * Calling shape (FE):
 *   POST /functions/v1/boggle-build-board
 *   { target_club, mode, player_user_ids, dice_set, band, constraints, setup }
 *   → Phase 3: { id }   ·   Phase 2: { board, n, requiredWordsCount, ... }
 *   → { error } (400/422/500)
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { generateBoard, type BoardConstraints } from '../../../src/boggle/lib/generate.ts'
import { DICE_BY_NAME } from '../../../src/boggle/lib/dice.ts'
import { requiredTrie } from './dict.ts'

const cors: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } })

interface BuildRequest {
  dice_set?: string
  band?: number
  constraints?: BoardConstraints
  // Phase 3: target_club, mode, player_user_ids, setup
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  let body: BuildRequest
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  // TODO Phase 3: verify the JWT and resolve the caller / club membership.

  const set = DICE_BY_NAME[body.dice_set ?? '4']
  if (!set) return json({ error: `unknown dice_set: ${body.dice_set}` }, 400)
  const band = body.band ?? 3
  if (band < 1 || band > 6) return json({ error: `band out of range: ${band}` }, 400)

  // Server-chosen seed → reproducible board, fresh each game.
  const seed = (Math.random() * 0x1_0000_0000) >>> 0

  const trie = await requiredTrie(band) // one-time decode + band trie (cached)
  const board = generateBoard(trie, set, body.constraints ?? {}, seed) // synchronous loop
  if (!board) return json({ error: 'No board met those constraints — please relax them.' }, 422)

  // TODO Phase 3: call boggle.create_game(target_club, setup, players, board,
  // requiredWords) and return { id }. For now, return the board for testing.
  return json({
    board: board.board,
    n: board.n,
    seed,
    requiredWordsCount: board.requiredWords.length,
    score: board.score,
    longest: board.longest,
    tries: board.tries,
  })
})
