/**
 * waffle-build-board — Edge Function that generates a fresh waffle
 * (waffle) board and creates the game in one round-trip.
 *
 * Why edge (not pre-generated): waffle used to ship a committed library
 * of ~100 puzzles per band. Adding word-filter options (dialect, slang,
 * …) would multiply that library combinatorially — a filter is baked
 * into each puzzle, so you can't filter a pre-generated board after the
 * fact. Generating on demand applies whatever filters the player chose
 * for free, over a continuous space, and is fast (a board builds in a
 * few ms). Same pattern as spellingbee-build-board.
 *
 * Generating server-side (not on the FE) keeps the solution off the
 * creating client — for a solve-the-board puzzle, a creator who knew
 * the answer would have no game. The board is built here, stored hidden
 * by waffle.create_game, and only the new game id comes back.
 *
 * Architecture:
 *   1. Verify the caller's JWT, read the inputs.
 *   2. As the caller, fetch the candidate 5-letter words from
 *      common.words (band ≤ difficulty, american, no slang, clean = slur 0 + crude 0).
 *   3. Build a board of exactly that band (fill 6 interlocking words +
 *      anchored scramble + exact-minSwaps par) — see gen.ts.
 *   4. Call waffle.create_game(target_club, setup, players, mode, board)
 *      over PostgREST; it validates the board and stores it.
 *   5. Return { id } to the FE.
 *
 * Secrets / env: SUPABASE_URL + SUPABASE_ANON_KEY (auto-injected). The
 * caller's JWT carries every authorization signal: common.words is
 * authenticated-readable (RLS off), and waffle.create_game is SECURITY
 * DEFINER and re-checks club membership. No service-role needed.
 *
 * Calling shape (from the FE):
 *   POST /functions/v1/waffle-build-board
 *   { target_club: uuid,
 *     setup: jsonb,                 // { difficulty, extra_swaps, timer }
 *     player_user_ids: uuid[],
 *     mode: 'coop' | 'compete' }
 *   → { id: uuid }  (200)
 *   → { error: string }  (400/401/403/500)
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { buildWaffleBoard, type WordRow } from './gen.ts'
import { json, preflight } from '../_shared/http.ts'
import { parseBuildBoardRequest, invokeCreateGame } from '../_shared/startGame.ts'

type Mode = 'coop' | 'compete'

/** Page size for the word-fetch loop — an optimization knob, NOT a
 *  correctness bound. The loop is cap-agnostic (advances by the rows
 *  actually received, stops only on an empty page), so a server
 *  max_rows below this — config drift, a hosted dashboard out of sync
 *  with config.toml — just means more round-trips, never lost rows.
 *  Keep ≤ config.toml's [api] max_rows for fewest round-trips. */
const PAGE_SIZE = 10_000
/** The full band range (a UI offers a subset; the server accepts all). */
const MIN_BAND = 1
const MAX_BAND = 6
const DEFAULT_BAND = 2

/**
 * Fetch the candidate 5-letter words for a band: the same filter the
 * board fill uses (band ≤ N, american, not slang, clean = slur 0 + crude 0). Paged to
 * defeat the max_rows cap (band 6 has ~12k candidates). Returns
 * `(word, difficulty)` — difficulty drives the "hardest word == band"
 * tier check in the fill.
 */
async function fetchCandidateWords(
  supabase: SupabaseClient,
  band: number,
): Promise<WordRow[]> {
  const out: WordRow[] = []
  for (let from = 0; ; ) {
    const { data, error } = await supabase
      .schema('common')
      .from('words')
      .select('word, difficulty')
      .eq('len', 5)
      .eq('american', true)
      .eq('slur', 0)
      .eq('crude', 0)
      .eq('slang', false)
      .lte('difficulty', band)
      // Order by the primary key so successive .range() windows are stable
      // pages of ONE ordering (without it Postgres gives no cross-statement
      // order guarantee — rows could be skipped or double-counted across pages).
      .order('word', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`fetchCandidateWords page ${from}: ${error.message}`)
    const page = (data ?? []) as WordRow[]
    // Cap-agnostic advance: step by what actually arrived (the server may cap
    // a window below PAGE_SIZE) and stop only on an empty page — a short page
    // is NOT a reliable "last page" signal when max_rows < PAGE_SIZE.
    if (page.length === 0) break
    out.push(...page)
    from += page.length
  }
  return out
}


serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const parsed = await parseBuildBoardRequest(req, 'waffle-build-board')
    if (parsed instanceof Response) return parsed
    const { targetClub, mode, playerUserIds, supabase } = parsed
    const setup = parsed.setup as { difficulty?: number }

    // The vocabulary band. Server accepts the full 1..6 range (the UI
    // offers a subset); create_game re-validates after we build.
    const band = setup.difficulty ?? DEFAULT_BAND
    if (!Number.isInteger(band) || band < MIN_BAND || band > MAX_BAND) {
      console.log(`waffle-build-board reject: invalid difficulty "${band}"`)
      return json({ error: `setup.difficulty must be ${MIN_BAND}..${MAX_BAND}` }, 400)
    }
    console.log(`waffle-build-board: band=${band}`)

    // ─── 1. Candidate words for the band ──────────────────
    const words = await fetchCandidateWords(supabase, band)
    console.log(`fetched ${words.length} candidate 5-letter words (band <= ${band})`)
    if (words.length === 0) {
      return json({ error: `no candidate words for band ${band}` }, 500)
    }

    // ─── 2. Build a board of exactly this band ────────────
    const board = buildWaffleBoard(words, band)
    if (board === null) {
      console.log(`reject: could not build a band-${band} board`)
      return json({ error: `could not build a band-${band} board` }, 500)
    }
    console.log(`board: solution=${board.solution} par=${board.par}`)

    // ─── 3. Create the game ───────────────────────────────
    return await invokeCreateGame(
      supabase,
      'waffle',
      {
        target_club: targetClub,
        setup,
        player_user_ids: playerUserIds,
        mode,
        board: { solution: board.solution, scramble: board.scramble, par_swaps: board.par },
      },
      'waffle-build-board',
    )
  } catch (e) {
    console.error('waffle-build-board threw:', e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
