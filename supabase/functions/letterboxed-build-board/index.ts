/**
 * letterboxed-build-board — Edge Function that produces a fresh Letter Boxed
 * puzzle and creates the game in one round-trip. The sixth of the
 * `<codename>-build-board` family (spellingbee, wordwheel, waffle, boggle,
 * wordiply).
 *
 * ── What makes this one different ────────────────────────────────────────
 * The other builders GENERATE a board and then discover what's findable on
 * it. This one runs backwards, because a Letter Boxed board has to be known
 * solvable and random twelve letters almost never are:
 *
 *   1. SAMPLE a seed — a chained word pair whose letters union to exactly
 *      twelve (letterboxed.seeds, built offline by
 *      supabase/scripts/import-letterboxed-seeds.ts).
 *   2. PARTITION those twelve into four sides of three, keeping both seed
 *      words playable. Re-rolled per game, which is what lets one seed back
 *      many distinct-feeling boards.
 *   3. FETCH every word whose letters fit the board (candidate_words), then
 *      filter to those the partition actually permits. What's stored is the
 *      ACCEPT list — band-gated only — because a player may type a crude or
 *      dialect word the game would never itself offer; the clean subset the
 *      hint search draws from is computed back out by the games_state view.
 *   4. GATE on richness (>= 150 CLEAN playable words) and on the whole accept
 *      list not being solvable in one word; re-roll from step 1 if either fails.
 *   5. HAND OFF to letterboxed.create_game, which re-validates everything —
 *      including that the seeded pair really does chain and cover the twelve.
 *
 * THERE IS NO PAR TO COMPUTE. Every board this pipeline can build has par
 * exactly 2, by construction: the partition keeps the seed pair playable, so
 * the chain word_a → word_b is always a two-word solution. The chain-length
 * cap is a number the players choose, not a derived par + slack. See
 * docs/letterboxed-plan.md §9.1.
 *
 * The PURE board-building core (partition, the side rule, the playable-word
 * filter) lives in ./board.ts, unit-tested by ./board_test.ts. This file keeps
 * the orchestration and the database round-trips.
 *
 * Secrets / env:
 *   - SUPABASE_URL       auto-injected
 *   - SUPABASE_ANON_KEY  auto-injected
 *
 * The caller's JWT carries every authorization signal we need:
 *   - letterboxed.seeds + common.words are authenticated-readable.
 *   - letterboxed.create_game runs security definer and re-checks membership
 *     via common.require_club_member.
 * No service-role needed anywhere.
 *
 * Calling shape (from the FE):
 *   POST /functions/v1/letterboxed-build-board
 *   { target_club: text,        // the club HANDLE, not a uuid
 *     setup: jsonb,             // {timer, max_words?, legal_band?, coop_style?…}
 *     player_user_ids: uuid[],
 *     mode: 'coop' | 'compete' }
 *   → { id: uuid }  (200)
 *   → { error: string }  (400/401/500)
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, preflight } from '../_shared/http.ts'
import { parseBuildBoardRequest, invokeCreateGame } from '../_shared/startGame.ts'
import {
  BOARD_SIZE,
  buildPlayableWords,
  isOneWordSolvable,
  letterMask,
  partitionSides,
} from './board.ts'

const FN = 'letterboxed-build-board'

/** Minimum findable words for a board to be worth playing — counted over the
 *  CLEAN subset, since that's what the hint search can suggest. Stricter than
 *  letterboxed.create_game's own gate, which can only count the accept list it
 *  is handed (clean >= 150 implies accept >= 150, so the two still agree). The
 *  measured 25th percentile is 210+ at every band, so this trims only the
 *  thin tail. */
const MIN_PLAYABLE_WORDS = 150

/** The seed importer stores only band <= 2 seeds, so this is the ceiling on
 *  what `least(legal_band, SEED_BAND_CAP)` can ask pick_seed for. */
const SEED_BAND_CAP = 2

/** How many seeds to try before giving up. Each attempt costs one small query
 *  plus one candidate scan; the gates reject maybe 5-10% of boards, so more
 *  than a couple of retries is already a signal something is wrong. */
const MAX_ATTEMPTS = 8

type Seed = { letters: string; word_a: string; word_b: string; difficulty: number }

type Board = {
  sides: string
  playable_words: string[]
  solution: [string, string]
}

/**
 * One attempt at a board: sample, partition, fetch, filter, gate. Returns the
 * board, or null when a gate rejected it (the caller re-rolls) — the
 * distinction between "rejected, try again" and "broken, give up" is why
 * genuine failures throw instead.
 */
async function attemptBoard(
  supabase: SupabaseClient,
  legalBand: number,
): Promise<Board | null> {
  const seedBand = Math.min(legalBand, SEED_BAND_CAP)

  const { data: seedRows, error: seedErr } = await supabase
    .schema('letterboxed')
    .rpc('pick_seed', { max_band: seedBand })
  if (seedErr) throw new Error(`pick_seed failed: ${seedErr.message}`)

  const seed = ((seedRows as Seed[] | null) ?? [])[0]
  if (!seed) {
    // Not a re-rollable condition: the pool is empty or the band filtered it
    // to nothing, and another spin would fail identically.
    throw new Error(
      `no seed available at band <= ${seedBand} — has gmake g-letterboxed-seeds run?`,
    )
  }

  const sides = partitionSides(seed.letters, [seed.word_a, seed.word_b], Math.random)
  if (!sides) {
    // The importer proves every stored seed partitionable, so this should be
    // unreachable — log it loudly rather than silently re-rolling past a sign
    // that the seed table and this code disagree.
    console.log(`${FN} WARNING: stored seed ${seed.letters} did not partition`)
    return null
  }

  const { data: candRows, error: candErr } = await supabase
    .schema('letterboxed')
    .rpc('candidate_words', { board_mask: letterMask(seed.letters), max_band: legalBand })
  if (candErr) throw new Error(`candidate_words failed: ${candErr.message}`)

  // candidate_words gates on band + board shape only; purity rides along as
  // `is_clean` (docs/common.md → the word list's filter rule). `playable_words`
  // is therefore the ACCEPT list — everything a player may legally type here —
  // while the clean subset is what the board is JUDGED on below.
  const candRowsTyped = (candRows as Array<{ word: string; is_clean: boolean }> | null) ?? []
  const cleanSet = new Set(candRowsTyped.filter((r) => r.is_clean).map((r) => r.word))
  const playable = buildPlayableWords(candRowsTyped.map((r) => r.word), sides)
  const cleanPlayable = playable.filter((w) => cleanSet.has(w))

  // The richness floor is measured on the CLEAN set, not the accept list: a
  // board is only as rich as what the hint search can actually offer, and the
  // crude/slang tail would otherwise pad a thin board over the line.
  if (cleanPlayable.length < MIN_PLAYABLE_WORDS) {
    console.log(
      `${FN} re-roll: ${seed.letters} yields only ${cleanPlayable.length} clean playable words`,
    )
    return null
  }
  // Solvability, by contrast, is judged on the WHOLE accept list: a board a
  // player can finish in one typed word is trivial whether or not we'd have
  // suggested that word.
  if (isOneWordSolvable(playable)) {
    console.log(`${FN} re-roll: ${seed.letters} is solvable in one word`)
    return null
  }

  console.log(
    `${FN} board: sides=${sides} seed=${seed.word_a}/${seed.word_b} ` +
      `band=${seed.difficulty} playable=${playable.length} clean=${cleanPlayable.length}`,
  )
  return { sides, playable_words: playable, solution: [seed.word_a, seed.word_b] }
}

serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  const parsed = await parseBuildBoardRequest(req, FN)
  if (parsed instanceof Response) return parsed
  const { targetClub, setup, mode, playerUserIds, supabase } = parsed

  // Setup validation is create_game's job — it is the authority, and its
  // messages are the user-facing ones. legal_band is read here only because
  // the board cannot be built without knowing which words count.
  const legalBand = Number(setup.legal_band ?? 5)
  if (!Number.isInteger(legalBand) || legalBand < 1 || legalBand > 6) {
    console.log(`${FN} reject: bad legal_band ${setup.legal_band}`)
    return json({ error: 'setup.legal_band must be an integer 1..6' }, 400)
  }

  let board: Board | null = null
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && !board; attempt++) {
      board = await attemptBoard(supabase, legalBand)
      if (!board) console.log(`${FN} attempt ${attempt}/${MAX_ATTEMPTS} rejected`)
    }
  } catch (e) {
    console.log(`${FN} error:`, (e as Error).message)
    return json({ error: (e as Error).message }, 500)
  }

  if (!board) {
    return json(
      { error: `could not build a board in ${MAX_ATTEMPTS} attempts` },
      500,
    )
  }

  // Sanity: the invariant create_game will re-check anyway. Asserting it here
  // turns a pipeline bug into a log line naming THIS function rather than a
  // 400 from the RPC that reads like the player did something wrong.
  const covered = new Set(board.solution.join('')).size
  if (covered !== BOARD_SIZE) {
    console.log(`${FN} error: solution covers ${covered}/${BOARD_SIZE} letters`)
    return json({ error: 'built an unsolvable board' }, 500)
  }

  return await invokeCreateGame(
    supabase,
    'letterboxed',
    {
      target_club: targetClub,
      setup,
      player_user_ids: playerUserIds,
      mode,
      board,
    },
    FN,
  )
})
