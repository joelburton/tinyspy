/**
 * wordiply-build-board — Edge Function that produces a fresh wordiply
 * board (a base + its word lists) and creates the game in one round-trip.
 *
 * wordiply (brand WordWire) is a Guardian-Wordiply-style base extender: a
 * short BASE — a 2–4 letter COMBINATION of letters, NOT a dictionary word
 * (e.g. 'ar', 'owl', 'part', 'gna') — and players get five guesses, each a
 * longer legal word that contains the base as a contiguous substring. See
 * docs/games/wordiply.md.
 *
 * Board-building strategy (a small orchestration over two SQL helpers):
 *   1. wordiply.candidate_bases(source_band, n) hands back N random 2–4
 *      letter substrings of common source words — fragments that appear in
 *      ≥1 real word by construction, so they always have children.
 *   2. For each candidate, wordiply.try_base(base, legal_band, min, max,
 *      headroom) returns the board bits (max_word_length + longest_words +
 *      the full legal_words list) IFF it clears the gate:
 *        • child count within [CHILD_MIN, CHILD_MAX] — the max bound throws
 *          out over-generous fragments ('in'/'an'/'ar' have tens of
 *          thousands of children → a non-puzzle + a huge payload). Word
 *          LENGTH is deliberately NOT capped: a long best word like
 *          'compartmentalizations' is a legitimate target.
 *        • max_word_length ≥ base length + MIN_HEADROOM — something to reach
 *          for.
 *      The first candidate that passes wins (its try_base call already
 *      returned the whole board, so no extra query).
 *   3. Call wordiply.create_game(...) — the RPC validates end-to-end and
 *      returns the new id.
 *
 * Why edge (not PL/pgSQL): consistency with the sibling word games
 * (wordwheel/spellingbee/boggle all build the board in an edge function
 * and hand it to create_game), plus the try-until-one-passes loop reads
 * naturally in TS.
 *
 * Since we don't care about cheating (trust model), the whole legal list
 * AND the longest word ship to the FE — the board carries them and
 * create_game stores them readable. The "reveal at terminal" is an FE
 * display choice, not a schema gate.
 *
 * Secrets / env: SUPABASE_URL + SUPABASE_ANON_KEY (auto-injected). The
 * caller's JWT carries every authz signal: common.words +
 * wordiply.candidate_bases/try_base are authenticated-readable,
 * wordiply.games is RLS-gated, and create_game re-checks membership. No
 * service role.
 *
 * Calling shape (from the FE):
 *   POST /functions/v1/wordiply-build-board
 *   { target_club: uuid,
 *     setup: jsonb,                 // { difficulty?, timer }, NO mode field
 *     player_user_ids: uuid[],
 *     mode: 'coop' | 'compete' }
 *   → { id: uuid }  (200)
 *   → { error: string }  (400/401/403/500)
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, preflight } from '../_shared/http.ts'
import { parseBuildBoardRequest, invokeCreateGame } from '../_shared/startGame.ts'

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

type Setup = {
  /** Dictionary band the legal child words are drawn from (1..6, default
   *  5, validated server-side by wordiply.create_game). */
  difficulty?: number
  timer:
    | { kind: 'none' }
    | { kind: 'countup' }
    | { kind: 'countdown'; seconds: number }
}

/** The board payload handed to wordiply.create_game. */
type Board = {
  base: string
  max_word_length: number
  /** Up to 3 words at the max length — revealed at terminal. */
  longest_words: string[]
  /** The full clean legal matching-word list, shipped to the FE. */
  legal_words: string[]
}

// ───────────────────────────────────────────────────────────
// Constants (the board-quality knobs)
// ───────────────────────────────────────────────────────────

/** Band the base fragments are sourced from — COMMON words, so the base
 *  reads naturally regardless of the (possibly higher) legal band. */
const SOURCE_BAND = 3
/** Child-count gate. The max bound is the load-bearing one: it rejects
 *  over-generous fragments so the board is a real puzzle with a sane
 *  payload. Tunable. */
const CHILD_MIN = 20
const CHILD_MAX = 500
/** The best word must beat the base by at least this many letters. */
const MIN_HEADROOM = 3
/** How many candidate fragments to sample + try before giving up. */
const ATTEMPTS = 40

// ───────────────────────────────────────────────────────────
// PostgREST helpers
// ───────────────────────────────────────────────────────────

/** The club's most-recent base, so we don't hand out the same starter
 *  twice running. Null if the club has never played wordiply. RLS makes
 *  this safe — a non-member gets no rows. */
async function fetchPreviousBase(
  supabase: SupabaseClient,
  clubHandle: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .schema('wordiply')
    .from('games')
    .select('base')
    .eq('club_handle', clubHandle)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`fetchPreviousBase: ${error.message}`)
  return data === null ? null : (data.base as string)
}

/** N candidate base fragments (random 2–4 letter substrings of common
 *  source words). */
async function fetchCandidateBases(
  supabase: SupabaseClient,
  n: number,
): Promise<string[]> {
  const { data, error } = await supabase
    .schema('wordiply')
    .rpc('candidate_bases', { source_band: SOURCE_BAND, n })
  if (error) throw new Error(`fetchCandidateBases: ${error.message}`)
  return ((data ?? []) as Array<{ base: string }>).map((r) => r.base)
}

/** Try one candidate through the gate. Returns the board bits if it
 *  passes, or null if the fragment is rejected (try_base returns zero
 *  rows). */
async function tryBase(
  supabase: SupabaseClient,
  base: string,
  legalBand: number,
): Promise<{ max_word_length: number; longest_words: string[]; legal_words: string[] } | null> {
  const { data, error } = await supabase
    .schema('wordiply')
    .rpc('try_base', {
      base,
      legal_band: legalBand,
      min_children: CHILD_MIN,
      max_children: CHILD_MAX,
      min_headroom: MIN_HEADROOM,
    })
  if (error) throw new Error(`tryBase(${base}): ${error.message}`)
  const rows = (data ?? []) as Array<{
    max_word_length: number
    longest_words: string[]
    legal_words: string[]
  }>
  if (rows.length === 0) return null
  return rows[0]
}

// ───────────────────────────────────────────────────────────
// HTTP entry point
// ───────────────────────────────────────────────────────────

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const parsed = await parseBuildBoardRequest(req, 'wordiply-build-board')
    if (parsed instanceof Response) return parsed
    const { targetClub, mode, playerUserIds, supabase } = parsed
    const setup = parsed.setup as Setup
    // create_game is the authority on the band's range; here we just
    // default the classic 5 and feed the helpers.
    const difficulty = setup.difficulty ?? 5
    console.log(`wordiply-build-board: difficulty=${difficulty}`)

    const previousBase = await fetchPreviousBase(supabase, targetClub)
    console.log(`previousBase: ${previousBase ?? 'none'}`)

    const candidates = await fetchCandidateBases(supabase, ATTEMPTS)
    console.log(`fetched ${candidates.length} candidate bases`)

    // Try candidates in order; first one that clears the gate wins. Skip a
    // repeat of the club's previous base.
    let board: Board | null = null
    for (const base of candidates) {
      if (base === previousBase) continue
      const bits = await tryBase(supabase, base, difficulty)
      if (bits) {
        board = {
          base,
          max_word_length: bits.max_word_length,
          longest_words: bits.longest_words,
          legal_words: bits.legal_words,
        }
        break
      }
    }

    if (board === null) {
      console.log(`reject: no candidate base cleared the gate in ${candidates.length} tries`)
      return json(
        { error: 'could not build a wordiply board — try again or a different difficulty' },
        500,
      )
    }
    console.log(
      `board: base=${board.base} max_word_length=${board.max_word_length}`
      + ` legal_words=${board.legal_words.length} longest=${board.longest_words[0]}`,
    )

    return await invokeCreateGame(
      supabase,
      'wordiply',
      { target_club: targetClub, setup, player_user_ids: playerUserIds, mode, board },
      'wordiply-build-board',
    )
  } catch (e) {
    console.error('wordiply-build-board threw:', e)
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
