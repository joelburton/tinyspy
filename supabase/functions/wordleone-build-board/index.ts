// cs-unmet

/**
 * wordleone-build-board — Edge Function that builds a Wordle in 1 puzzle and
 * creates the game in one round-trip.
 *
 * Why here and not in SQL: one starter try is a color computation per word in
 * the band, and a plpgsql call per word makes a puzzle take seconds; in V8 it
 * lands in well under one (plans/wordleone.md → Where the generator runs).
 * Server-side, not on the FE, so the answer never reaches the creating client:
 * the puzzle is built here, stored by `wordleone.create_game` with its answer
 * hidden, and only the new game id comes back.
 *
 * Architecture:
 *   1. Verify the caller's JWT, read the inputs.
 *   2. As the caller, fetch every five-letter word at or below the larger of
 *      the legal band and the starters' band, with the columns the filters
 *      read. Not clean-filtered: any legal word is a guess the answer must be
 *      unique against.
 *   3. Build a puzzle at that band and difficulty — see gen.ts.
 *   4. Call wordleone.create_game(target_club, setup, players, mode, board)
 *      over PostgREST; it checks the puzzle and stores it.
 *   5. Relay its envelope.
 *
 * Secrets / env: SUPABASE_URL + SUPABASE_ANON_KEY (auto-injected). The
 * caller's JWT carries every authorization signal: common.words is
 * authenticated-readable, and wordleone.create_game is SECURITY DEFINER and
 * re-checks club membership. No service-role needed.
 *
 * Calling shape (from the FE):
 *   POST /functions/v1/wordleone-build-board
 *   { target_club: text,
 *     setup: jsonb,                 // { legal_band, difficulty, timer, coop_style?, first_turn_user_id? }
 *     player_user_ids: uuid[],
 *     mode: 'coop' | 'compete' }
 *   → a result envelope, ALWAYS 200 (_shared/envelope.ts)
 *
 * A band or difficulty the form cannot produce, and an empty word list, are
 * faults. Whether a puzzle EXISTS at the chosen band and difficulty is the one
 * thing the form cannot know, so that is a validation, under `difficulty`.
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { buildPuzzle, STARTER_MAX_BAND, type TierChoice, type WordRow } from './gen.ts'
import { preflight } from '../_shared/http.ts'
import { crash, fault, formValidation } from '../_shared/envelope.ts'
import { parseBuildBoardRequest, invokeCreateGame } from '../_shared/startGame.ts'

/** Page size for the word fetch — an optimization knob, not a correctness
 *  bound: the loop advances by the rows received and stops on an empty page
 *  (waffle-build-board's fetch has the reasoning). */
const PAGE_SIZE = 10_000
const MIN_BAND = 1
const MAX_BAND = 6
const DIFFICULTIES: readonly TierChoice[] = ['easy', 'medium', 'hard', 'any']

/** One `common.words` row as PostgREST returns the selected columns. */
type WordsRow = {
  word: string
  band: number
  wordle: boolean
  slur: number
  crude: number
  american: boolean
  slang: boolean
  root_word: string | null
}

/**
 * Every five-letter word at band ≤ `maxBand`, as the generator's rows. Paged
 * to defeat the max_rows cap (band 6 is ~13k words), ordered by the primary key
 * so the pages are one ordering.
 */
async function fetchWordRows(supabase: SupabaseClient, maxBand: number): Promise<WordRow[]> {
  const out: WordRow[] = []
  for (let from = 0; ; ) {
    const { data, error } = await supabase
      .schema('common')
      .from('words')
      .select('word, band, wordle, slur, crude, american, slang, root_word')
      .eq('len', 5)
      .lte('band', maxBand)
      .order('word', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`fetchWordRows page ${from}: ${error.message}`)
    const page = (data ?? []) as WordsRow[]
    if (page.length === 0) break
    for (const r of page) {
      out.push({
        word: r.word,
        band: r.band,
        isAnswerList: r.wordle,
        // The must-reach filter (docs/word-list.md): the answer and the starter
        // are words every player has to arrive at or read.
        isClean: r.slur === 0 && r.crude === 0 && r.american && !r.slang,
        root: r.root_word,
      })
    }
    from += page.length
  }
  return out
}

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const parsed = await parseBuildBoardRequest(req, 'wordleone-build-board')
    if (parsed instanceof Response) return parsed
    const { targetClub, mode, playerUserIds, supabase } = parsed
    const setup = parsed.setup as { legal_band?: number; difficulty?: string }

    const band = setup.legal_band
    if (!Number.isInteger(band) || band! < MIN_BAND || band! > MAX_BAND) {
      console.log(`wordleone-build-board reject: invalid legal_band "${band}"`)
      return fault('PN529', `BUG: legal band of '${band}'`, `wordleone-build-board: legal_band must be ${MIN_BAND}..${MAX_BAND}`)
    }
    const difficulty = setup.difficulty as TierChoice
    if (!DIFFICULTIES.includes(difficulty)) {
      console.log(`wordleone-build-board reject: invalid difficulty "${difficulty}"`)
      return fault('PN530', `BUG: difficulty of '${difficulty}'`, `wordleone-build-board: difficulty must be one of ${DIFFICULTIES.join(', ')}`)
    }
    console.log(`wordleone-build-board: band=${band} difficulty=${difficulty}`)

    // ─── 1. The words ─────────────────────────────────────
    // A band-1 game still draws its starter from band 2, so the fetch reaches
    // the starters' band too; the generator keeps the pool to the legal band.
    const words = await fetchWordRows(supabase, Math.max(band!, STARTER_MAX_BAND))
    console.log(`fetched ${words.length} five-letter words`)
    if (words.length === 0) {
      console.log('wordleone-build-board reject: no words')
      return fault('PN531', 'BUG: Too few words on server to build a puzzle', 'wordleone-build-board: common.words has no five-letter words; run gmake all-words')
    }

    // ─── 2. The puzzle ────────────────────────────────────
    const puzzle = buildPuzzle(words, { band: band!, tier: difficulty, random: Math.random })
    if (puzzle === null) {
      console.log(`reject: no ${difficulty} puzzle at band ${band}`)
      return formValidation(
        'PN532',
        'difficulty',
        'No puzzle could be built at that difficulty. Try another.',
        `wordleone-build-board: generator exhausted its answers at band ${band}, ${difficulty}`,
      )
    }
    console.log(
      `puzzle: tier=${puzzle.tier} greens=${puzzle.greens} positiveSpace=${puzzle.positiveSpace} loadBearing=${puzzle.loadBearing}`,
    )

    // ─── 3. Create the game ───────────────────────────────
    return await invokeCreateGame(
      supabase,
      'wordleone',
      {
        p_club_handle: targetClub,
        p_setup: setup,
        p_player_user_ids: playerUserIds,
        p_mode: mode,
        // The scores are kept on the game for the puzzle-feedback survey
        // (`wordleone.rate_puzzle`); create_game checks the rest.
        p_board: {
          starter: puzzle.starter,
          colors: puzzle.colors,
          answer: puzzle.answer,
          positive_space: puzzle.positiveSpace,
          load_bearing: puzzle.loadBearing,
        },
      },
      'wordleone-build-board',
    )
  } catch (e) {
    console.error('wordleone-build-board threw:', e)
    return crash('wordleone-build-board', e)
  }
})
