/**
 * letterboxed-build-board — Edge Function that produces a fresh Letter Boxed
 * puzzle and creates the game in one round-trip. The sixth of the
 * `<codename>-build-board` family (spellingbee, wordwheel, waffle, boggle,
 * wordiply).
 *
 * TWO paths, picked by whether setup.custom_sides is set:
 *   • CUSTOM — the player typed a board ("play the one I sent you"). No
 *     sampling, no re-rolling and no quality gates; the twelve letters are
 *     looked up in letterboxed.seeds to recover the pair that solves them, and
 *     that pair is checked against the partition as typed. See
 *     buildCustomBoard, which also lists the three player-reachable
 *     rejections.
 *   • RANDOM — the original path, unchanged, described below.
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
 *   → { error: fe-error-key, code?: SQLSTATE }  (400/401/500)
 *
 * Errors are fe-error-keys (`key|detail|` — docs/supabase.md → Server errors;
 * guarded by src/edgeFnErrorKeys.test.ts): the FE owns every player-facing
 * word. THREE are player-reachable, and only on the custom path — you can
 * mistype a board (unknown-board / unverified-board) or set the dictionary
 * below what its solution needs (board-needs-band) — so all three carry copy
 * in errorCopy.ts and land on the setup dialog's own error line. The rest
 * (bad-band / bad-custom-board / board-attempts-exhausted / unsolvable-board /
 * edge-internal) are "impossible without an FE bug or a broken pipeline" — no
 * copy; they render as faults. A create_game raise relays verbatim with its
 * SQLSTATE (invokeCreateGame).
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { edgeInternal, json, preflight } from '../_shared/http.ts'
import { parseBuildBoardRequest, invokeCreateGame } from '../_shared/startGame.ts'
import {
  BOARD_SIZE,
  buildPlayableWords,
  isOneWordSolvable,
  letterMask,
  partitionSides,
} from './board.ts'
// Reaching across into the FE tree, the seam boggle-build-board uses for its
// own custom board: ONE reader for a typed board, so what the setup dialog
// accepts is exactly what this function will parse. A second copy of those
// rules would drift into "the dialog took it but the server didn't".
import { parseSides } from '../../../src/letterboxed/lib/customBoard.ts'

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

/**
 * Why a typed board couldn't be used. A REASON, not a wire format: serve()
 * turns each into its fe-error-key literal, which keeps every `json({error})`
 * in this file a literal the edgeFnErrorKeys guard can read (the alternative
 * was an APPROVED_EXPRESSIONS exemption, and an exemption is worth less than a
 * shape that doesn't need one).
 */
type CustomReject =
  | { reject: 'unknown-board' }
  | { reject: 'unverified-board' }
  | { reject: 'board-needs-band'; band: number }

/**
 * Build the board a player TYPED (setup.custom_sides) — "play the board my
 * friend sent me". No sampling, no re-rolling, and no quality gates: you chose
 * this board, so whether it is rich or trivial is your business, not ours.
 *
 * The one thing that is still checked is the one the game cannot do without: a
 * KNOWN TWO-WORD SOLUTION. `letterboxed.games.solution` is not nullable, and
 * the terminal reveal, the PDF and create_game's winnability invariant all read
 * it. So this recovers the pair rather than trusting-and-storing-nothing —
 * which is why a custom board needs no special case anywhere downstream.
 *
 * Three ways it can fail, all of them unreachable for a board this game built:
 *
 *   • unknown-board   — no seed for those twelve letters. A mistyped letter, or
 *                       a board from elsewhere with no band <= 2 pair here.
 *   • unverified-board— the seed exists but its pair isn't playable under the
 *                       sides as typed: right letters, wrong arrangement (two
 *                       letters swapped between sides). Without this check that
 *                       board would start and simply not be solvable in two.
 *   • board-needs-band— the pair is band 2 and the game is set to band 1, so the
 *                       solution wouldn't be a legal word in its own game. We
 *                       report it rather than quietly raising the dictionary the
 *                       player picked.
 *
 * Genuine failures (a query that errored) THROW, so they surface as faults
 * rather than as a rejection blaming the player — the same split attemptBoard
 * makes between "re-roll" and "broken".
 */
async function buildCustomBoard(
  supabase: SupabaseClient,
  sides: string,
  legalBand: number,
): Promise<Board | CustomReject> {
  // Sorted, the twelve letters ARE letterboxed.seeds' primary key.
  const sorted = [...sides].sort().join('')

  const { data: seedRows, error: seedErr } = await supabase
    .schema('letterboxed')
    .rpc('seed_for', { board_letters: sorted })
  if (seedErr) throw new Error(`seed_for failed: ${seedErr.message}`)

  const seed = ((seedRows as Seed[] | null) ?? [])[0]
  if (!seed) {
    console.log(`${FN} reject: no seed for custom board ${sides} (sorted ${sorted})`)
    return { reject: 'unknown-board' }
  }

  // The seeded pair must be LEGAL in the game being built, or the guaranteed
  // solution isn't in playable_words and create_game rejects the board. The
  // random path avoids this by asking pick_seed for `least(legal_band, 2)`; a
  // custom board doesn't get to choose its seed, so it reports instead.
  if (seed.difficulty > legalBand) {
    console.log(
      `${FN} reject: custom board ${sides} needs band ${seed.difficulty}, game is at ${legalBand}`,
    )
    return { reject: 'board-needs-band', band: seed.difficulty }
  }

  const { data: candRows, error: candErr } = await supabase
    .schema('letterboxed')
    .rpc('candidate_words', { board_mask: letterMask(sides), max_band: legalBand })
  if (candErr) throw new Error(`candidate_words failed: ${candErr.message}`)

  // The ACCEPT list, exactly as the random path builds it — band-gated only,
  // with the clean subset computed back out by the games_state view. NO
  // richness floor and no one-word-solvable re-roll: both are quality gates on
  // a board nobody chose, and this one was chosen.
  const candWords = ((candRows as Array<{ word: string; is_clean: boolean }> | null) ?? [])
    .map((r) => r.word)
  const playable = buildPlayableWords(candWords, sides)

  // The partition check. The seed proves these twelve letters are solvable in
  // two SOMEHOW; this proves they're solvable in two THE WAY YOU ARRANGED THEM.
  if (!playable.includes(seed.word_a) || !playable.includes(seed.word_b)) {
    console.log(
      `${FN} reject: custom board ${sides} does not keep ${seed.word_a}/${seed.word_b} playable`,
    )
    return { reject: 'unverified-board' }
  }

  console.log(
    `${FN} custom board: sides=${sides} seed=${seed.word_a}/${seed.word_b} ` +
      `band=${seed.difficulty} playable=${playable.length}`,
  )
  return { sides, playable_words: playable, solution: [seed.word_a, seed.word_b] }
}

serve(async (req: Request) => {
  const pre = preflight(req)
  if (pre) return pre

  const parsed = await parseBuildBoardRequest(req, FN)
  if (parsed instanceof Response) return parsed
  const { targetClub, setup, mode, playerUserIds, supabase } = parsed

  // Setup validation is create_game's job — it is the authority. legal_band is
  // read here only because the board cannot be built without knowing which
  // words count; the FE constrains it to 1..6, so this re-check is
  // "impossible" and carries no copy (docs/supabase.md → Server errors).
  const legalBand = Number(setup.legal_band ?? 5)
  if (!Number.isInteger(legalBand) || legalBand < 1 || legalBand > 6) {
    console.log(`${FN} reject: bad legal_band ${setup.legal_band} (must be an integer 1..6)`)
    return json({ error: `bad-band|${setup.legal_band}|` }, 400)
  }

  // A typed board short-circuits the whole sample-and-re-roll loop: there is
  // exactly one board to try, and it either proves out or is rejected.
  const typedBoard = String(setup.custom_sides ?? '')

  let board: Board | null = null
  try {
    if (typedBoard) {
      // Shape is the FE's gate (`customSidesError` runs the same parser), so a
      // failure here means an FE bug rather than a player mistake — no copy,
      // renders as a fault. Matches boggle's `bad-custom-board`.
      const parsed = parseSides(typedBoard)
      if (!parsed.ok) {
        console.log(`${FN} reject: custom board unreadable — ${parsed.error}`)
        return json({ error: 'bad-custom-board|' }, 400)
      }
      const built = await buildCustomBoard(supabase, parsed.sides, legalBand)
      // A rejection is the PLAYER's to see and act on (retype the board, raise
      // the dictionary), so it's a 400 with its own key — not a re-roll. The
      // board rides along as the detail on the two "check what you typed"
      // keys, so the dialog's caption can name it back.
      if ('reject' in built) {
        const shown = parsed.sides.toUpperCase()
        switch (built.reject) {
          case 'unknown-board':
            return json({ error: `unknown-board|${shown}|` }, 400)
          case 'unverified-board':
            return json({ error: `unverified-board|${shown}|` }, 400)
          case 'board-needs-band':
            return json({ error: `board-needs-band|${built.band}|` }, 400)
        }
      }
      board = built
    } else {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !board; attempt++) {
        board = await attemptBoard(supabase, legalBand)
        if (!board) console.log(`${FN} attempt ${attempt}/${MAX_ATTEMPTS} rejected`)
      }
    }
  } catch (e) {
    console.log(`${FN} error:`, (e as Error).message)
    return edgeInternal(e)
  }

  if (!board) {
    console.log(`${FN} reject: could not build a board in ${MAX_ATTEMPTS} attempts`)
    return json({ error: `board-attempts-exhausted|${MAX_ATTEMPTS}|` }, 500)
  }

  // Sanity: the invariant create_game will re-check anyway. Asserting it here
  // turns a pipeline bug into a log line naming THIS function rather than a
  // 400 from the RPC that reads like the player did something wrong.
  const covered = new Set(board.solution.join('')).size
  if (covered !== BOARD_SIZE) {
    console.log(`${FN} error: solution covers ${covered}/${BOARD_SIZE} letters`)
    return json({ error: 'unsolvable-board|' }, 500)
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
