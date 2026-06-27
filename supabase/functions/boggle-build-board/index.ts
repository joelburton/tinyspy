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
 *   1. Verify inputs + the caller's Authorization header.
 *   2. Build the required trie for the chosen band (bundled, cached per isolate).
 *   3. generateBoard(): roll + solve + reject until constraints met (or fail).
 *      SYNCHRONOUS — the solver keeps mutable scratch across the loop, so we must
 *      not await between iterations. The trie build (await) is before it; the DB
 *      write (await) is after. Nothing awaits inside the loop.
 *   4. boggle.create_game(...) over PostgREST, as the caller (the RPC is the
 *      authority on club membership + setup validation).
 *   5. Return { id }.
 *
 * Calling shape (FE):
 *   POST /functions/v1/boggle-build-board
 *   { target_club, mode, player_user_ids,
 *     setup: { timer, dice_set, band, min_word_length, scoring_ladder, constraints } }
 *   → { id }   ·   → { error } (400/401/422/500)
 *
 * Secrets / env: SUPABASE_URL + SUPABASE_ANON_KEY (auto-injected). The caller's
 * JWT carries every authorization signal: common.words + the bundled dict are
 * public; boggle.create_game runs security-definer and re-checks membership.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { generateBoard, type BoardConstraints } from '../../../src/boggle/lib/generate.ts'
import { DICE_BY_NAME } from '../../../src/boggle/lib/dice.ts'
import { LADDERS, type LadderName } from '../../../src/boggle/lib/solver.ts'
import { requiredTrie } from './dict.ts'

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } })

interface BoggleSetup {
  dice_set?: string
  band?: number
  min_word_length?: number
  scoring_ladder?: LadderName
  constraints?: BoardConstraints
  // timer etc. validated by create_game
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const targetClub: string | undefined = body.target_club
    const setup: BoggleSetup | undefined = body.setup
    const playerUserIds: string[] | undefined = body.player_user_ids
    const mode: string | undefined = body.mode

    if (!targetClub || typeof targetClub !== 'string') return json({ error: 'target_club required' }, 400)
    if (!setup || typeof setup !== 'object') return json({ error: 'setup required' }, 400)
    if (mode !== 'coop' && mode !== 'compete') return json({ error: 'mode must be coop|compete' }, 400)
    if (!Array.isArray(playerUserIds) || playerUserIds.length === 0) {
      return json({ error: 'player_user_ids (non-empty) required' }, 400)
    }
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'authorization required' }, 401)

    const set = DICE_BY_NAME[setup.dice_set ?? '4']
    if (!set) return json({ error: `unknown dice_set: ${setup.dice_set}` }, 400)
    const band = setup.band ?? 3
    if (band < 1 || band > 6) return json({ error: `band out of range: ${band}` }, 400)
    // Validate the ladder here (the trust boundary): it comes from untyped JSON
    // and flows straight into the solver's scoring, which would crash on an
    // unknown key. create_game re-validates, but generation runs first.
    const ladder = setup.scoring_ladder ?? 'basic'
    if (!(ladder in LADDERS)) return json({ error: `unknown scoring_ladder: ${ladder}` }, 400)

    // ─── Generate the board (cached band trie + synchronous solve loop) ─────
    const trie = await requiredTrie(band)
    const constraints: BoardConstraints = {
      ...setup.constraints,
      minWordLength: setup.min_word_length ?? 3,
      ladder: ladder as LadderName,
    }
    const seed = (Math.random() * 0x1_0000_0000) >>> 0 // server-chosen → reproducible, fresh each game
    // maxMs bounds the busy loop under the edge worker's CPU ceiling; an
    // unsatisfiable constraint returns null → 422 instead of killing the worker.
    const board = generateBoard(trie, set, constraints, seed, 200_000, 1000)
    if (!board) return json({ error: 'No board met those constraints — please relax them.' }, 422)

    // ─── Create the game as the caller ────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data, error } = await supabase.schema('boggle').rpc('create_game', {
      target_club: targetClub,
      setup,
      player_user_ids: playerUserIds,
      mode,
      board: {
        board: board.board,
        n: board.n,
        required_words: board.requiredWords,
        required_words_count: board.requiredWords.length,
        required_words_score: board.score,
      },
    })
    if (error) return json({ error: error.message }, 400)
    const rows = (data as Array<{ id: string }> | null) ?? []
    if (rows.length === 0) return json({ error: 'create_game returned no row' }, 500)

    return json({ id: rows[0].id })
  } catch (e) {
    console.error('boggle-build-board threw:', e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
