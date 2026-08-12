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
 * TWO paths, picked by whether setup.custom_base is set:
 *   • CUSTOM — the player typed a starter ("try wordiply with MOTH"). No
 *     sampling and no repeat cap; the one base goes straight through the gate
 *     under the looser CUSTOM_* bounds. A rejection is player-reachable and
 *     says which way it failed (base-too-common / base-too-narrow).
 *   • RANDOM — the original path, unchanged, described below.
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
 *   → { error: fe-error-key, code?: SQLSTATE }  (400/401/403/500)
 *
 * Errors are fe-error-keys (`key|detail|` — docs/supabase.md → Server errors;
 * guarded by src/edgeFnErrorKeys.test.ts): the FE owns every player-facing
 * word. Two are player-REACHABLE, and only on the custom path — you can type
 * ING (base-too-common) or YAKS (base-too-narrow) — so both carry copy in
 * errorCopy.ts and land on the setup dialog's own error line. The rest
 * (wordiply-build-failed / edge-internal) are "impossible without a broken
 * pipeline" — no copy; they render as faults. A create_game raise relays
 * verbatim with its SQLSTATE (invokeCreateGame).
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { edgeInternal, json, preflight } from '../_shared/http.ts'
import { parseBuildBoardRequest, invokeCreateGame } from '../_shared/startGame.ts'

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

type Setup = {
  /** Dictionary band the legal child words are drawn from (1..6, default
   *  5, validated server-side by wordiply.create_game). */
  difficulty?: number
  /** An OPTIONAL player-chosen starter (2–4 letters). Present → skip
   *  sampling entirely and build from exactly these letters, under the
   *  relaxed CUSTOM_* gate below. Absent/blank → the usual random board.
   *  create_game re-validates the shape and cross-checks it against the
   *  board we return. */
  custom_base?: string
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

/**
 * The gate for a PLAYER-CHOSEN base (setup.custom_base), which is looser than
 * the random one in one direction and only one direction:
 *
 *  - The child-count FLOOR drops to 1. A random board has to be worth playing
 *    sight-unseen, so it wants ≥20 matching words; you asked for this base, so
 *    it only has to be playable at all.
 *  - The CEILING rises to 1000 (from 500). For a custom base this bound is
 *    purely about PAYLOAD — the whole legal list ships to the frontend and
 *    lands in the games row — not about puzzle quality, which is your call.
 *    Deliberately NOT raised for random boards, where 500 is what keeps a
 *    rolled board from being an ASH-scale non-puzzle.
 *  - MIN_HEADROOM is REUSED UNCHANGED, and it is the load-bearing one here.
 *    With the floor at 20 it never fires (a base with 20+ children essentially
 *    always has one 3+ letters longer); with the floor at 1 it becomes the only
 *    thing standing between you and a MOTH board whose best answer is MOTHER.
 *    Measured on 500 real words: it rejects YAKS (best 'kayaks'), JOEY (best
 *    'joeys'), IBEX, ORGY.
 */
const CUSTOM_CHILD_MIN = 1
const CUSTOM_CHILD_MAX = 1000

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
 *  rows). Bounds are parameters because the custom-base path uses the
 *  looser CUSTOM_* ones — the gate FUNCTION is the same either way. */
async function tryBase(
  supabase: SupabaseClient,
  base: string,
  legalBand: number,
  minChildren = CHILD_MIN,
  maxChildren = CHILD_MAX,
): Promise<{ max_word_length: number; longest_words: string[]; legal_words: string[] } | null> {
  const { data, error } = await supabase
    .schema('wordiply')
    .rpc('try_base', {
      base,
      legal_band: legalBand,
      min_children: minChildren,
      max_children: maxChildren,
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

/**
 * How many legal words contain `base` — WITHOUT fetching them.
 *
 * `try_base` returns zero rows for ANY gate failure, so a rejected custom base
 * can't say why it was rejected. This answers that, and only on the reject
 * path: `head: true` makes PostgREST run the function for its count and send
 * no rows, which matters because the pathological case is exactly the one we'd
 * be transferring — ING matches 20k words.
 *
 * The split is the one a player can act on: too many words means "try a longer
 * starter", anything else means "try a different one".
 */
async function countMatchingWords(
  supabase: SupabaseClient,
  base: string,
  legalBand: number,
): Promise<number> {
  const { count, error } = await supabase
    .schema('wordiply')
    .rpc('matching_words', { base, legal_band: legalBand }, { count: 'exact', head: true })
  if (error) throw new Error(`countMatchingWords(${base}): ${error.message}`)
  return count ?? 0
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

    // The player's own starter, if they typed one. create_game re-validates
    // the shape; here we only need to know whether to sample or not.
    const customBase = (setup.custom_base ?? '').trim().toLowerCase()

    let board: Board | null = null

    if (customBase) {
      // ── The custom path ────────────────────────────────────
      // No sampling, and no previous-base repeat cap: re-issuing the same
      // challenge to the same club is a legitimate thing to want, and the cap
      // exists to keep RANDOM boards from repeating themselves.
      console.log(`custom base: ${customBase}`)
      // Shape FIRST. Without this a malformed base still runs the dictionary
      // query, and 'm' — which matches most of the language — comes back as
      // "matches too many words", advising a longer starter for what is really
      // a broken request. The frontend's customBaseError already blocks this,
      // so reaching it means a broken client: same key create_game raises, and
      // deliberately NO copy in errorCopy.ts, so it renders as a fault.
      if (!/^[a-z]{2,4}$/.test(customBase)) {
        console.log(`reject: custom base ${customBase} is not 2-4 letters`)
        return json({ error: `bad-custom-base|${customBase}|` }, 400)
      }
      const bits = await tryBase(
        supabase, customBase, difficulty, CUSTOM_CHILD_MIN, CUSTOM_CHILD_MAX,
      )
      if (!bits) {
        // Rejected — say which way, since the two have different fixes. Both
        // are player-REACHABLE (you can type ING), so both carry copy in
        // errorCopy.ts and land on the setup dialog's own line, not a fault.
        const children = await countMatchingWords(supabase, customBase, difficulty)
        console.log(`reject: custom base ${customBase} has ${children} children`)
        return children > CUSTOM_CHILD_MAX
          ? json({ error: `base-too-common|${customBase}|` }, 400)
          : json({ error: `base-too-narrow|${customBase}|` }, 400)
      }
      board = {
        base: customBase,
        max_word_length: bits.max_word_length,
        longest_words: bits.longest_words,
        legal_words: bits.legal_words,
      }
    } else {
      // ── The random path (unchanged) ────────────────────────
      const previousBase = await fetchPreviousBase(supabase, targetClub)
      console.log(`previousBase: ${previousBase ?? 'none'}`)

      const candidates = await fetchCandidateBases(supabase, ATTEMPTS)
      console.log(`fetched ${candidates.length} candidate bases`)

      // Try candidates in order; first one that clears the gate wins. Skip a
      // repeat of the club's previous base.
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
        // Every candidate base failed the max-children gate — a generation dead
        // end, not a player-reachable state. Key only, no copy; it faults.
        return json({ error: 'wordiply-build-failed|' }, 500)
      }
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
    return edgeInternal(e)
  }
})
