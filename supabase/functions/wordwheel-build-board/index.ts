/**
 * wordwheel-build-board — Edge Function that produces a fresh
 * word-wheel puzzle and creates the game in one round-trip.
 *
 * A near-twin of spellingbee-build-board. Word wheel is a targeted fork of
 * spellingbee; this file differs in exactly the ways the game does:
 *
 *   • NINE letters (one centre + eight outer), not seven — and the wheel
 *     is a MULTISET: the same letter may sit on two tiles.
 *   • Each tile is SPENT per use — a word may use a letter only as many
 *     times as it has tiles. candidate_words returns the pure subset set
 *     (letter-SET ⊆ wheel + contains centre); we post-filter here to
 *     words whose per-letter counts FIT the wheel's tile counts.
 *     See docs/games/wordwheel.md.
 *   • The pangram bonus is +15 (spellingbee's is +10). A pangram uses
 *     all nine tiles, so any 9-letter word that fits IS one.
 *   • The seed pool is difficulty-tagged: we sample only seeds whose
 *     `difficulty <= required_band`, so the pool scales with the game's
 *     required band. See docs/games/wordwheel.md.
 *   • 's' is allowed (a tile per use means 's' pluralizes at most once
 *     per 's' tile), so there is no 's' exclusion anywhere.
 *   • No ING dampening: spellingbee damps -ing because unbounded letter
 *     REUSE lets -ing attach to almost anything; tile-spending removes
 *     that explosion, so the skew isn't worth a special case.
 *
 * The PURE board-building core (tile-fit, scoring, overlap cap, custom-letter
 * validation) lives in ./board.ts, unit-tested by ./board_test.ts. This file
 * keeps the orchestration: weighted random sampling over the pangram seeds, a
 * previous-letters overlap cap, and a subset-mask join against common.words
 * (via the candidate_words RPC) plus the multiset-fit post-filter.
 *
 * Architecture:
 *   1. Verify the caller's JWT, read the inputs.
 *   2. As the caller, fetch:
 *        - wordwheel.pangrams rows with difficulty <= required_band
 *        - the club's most-recent wordwheel.games row (overlap cap)
 *   3. Run the diverse-builder strategy in-process:
 *        a. Filter seeds by overlap cap against the previous board
 *           (≤5 distinct letters shared).
 *        b. Weighted sample: rare-letter seeds (has_rare_letters) get a
 *           3× weight boost for fair representation.
 *   4. Pick the centre letter uniformly from the seed's DISTINCT letters
 *      (two duplicate tiles as centre would make the identical board),
 *      trying centres until one clears the word gate.
 *   5. Query common.words (via candidate_words) for every legal word
 *      whose letter-set is a subset of the puzzle mask AND uses the
 *      centre; post-filter to words fitting the wheel's tile counts;
 *      compute points (length score + 15 if pangram).
 *   6. Call wordwheel.create_game(...) — the RPC validates end-to-end
 *      and returns the new id.
 *   7. Return { id } to the FE.
 *
 * Secrets / env:
 *   - SUPABASE_URL       auto-injected
 *   - SUPABASE_ANON_KEY  auto-injected
 *
 * The caller's JWT carries every authorization signal we need:
 *   - wordwheel.pangrams + common.words are authenticated-readable.
 *   - wordwheel.games is RLS-gated on club membership.
 *   - wordwheel.create_game runs security definer and re-checks
 *     membership via common.require_club_member.
 * No service-role needed anywhere.
 *
 * Calling shape (from the FE):
 *   POST /functions/v1/wordwheel-build-board
 *   { target_club: text,           // the club HANDLE, not a uuid
 *     setup: jsonb,                 // {timer, required?, legal?, target_rank?}, NO mode field
 *     player_user_ids: uuid[],
 *     mode: 'coop' | 'compete' }
 *   → { id: uuid }  (200)
 *   → { error: string }  (400/401/403/500)
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, preflight } from '../_shared/http.ts'
import { parseBuildBoardRequest, invokeCreateGame } from '../_shared/startGame.ts'
import {
  type Board,
  type CandidateRow,
  type PangramRow,
  WHEEL_SIZE,
  applyOverlapCap,
  buildBoard,
  buildWeightedPool,
  letterMask,
  validateCustomLetters,
} from './board.ts'

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

type Setup = {
  /** Required when `mode === 'compete'` (validated server-side). */
  target_rank?: number
  /** Vocabulary bands for this board's word lists (validated server-side by
   *  wordwheel.create_game). `required` (1..6, default 3) = the displayed goal
   *  set; `legal` (required..6, default 5) = the wider accepted set. */
  required?: number
  legal?: number
  /** Optional custom board — the player's own letters. `custom_center` = the
   *  centre letter, `custom_letters` = the eight other letters. When both are set
   *  (and valid) we build a board from exactly these letters instead of sampling
   *  a random pangram seed. Both create_game and this function re-validate. */
  custom_center?: string
  custom_letters?: string
  /** Board constraint (random boards only): when true, sample only from seeds
   *  whose nine letters are all distinct. Ignored for a custom board. */
  unique_letters?: boolean
  timer:
    | { kind: 'none' }
    | { kind: 'countup' }
    | { kind: 'countdown'; seconds: number }
}

// ───────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────

/** Sanity gate that must agree with the RPC's same gate. PROVISIONAL 15 —
 *  lower than spellingbee's 30 because spending a tile per use yields fewer
 *  words than unbounded reuse. */
const MIN_REQUIRED_WORDS_COUNT = 15
/** How many seeds to try when a sampled seed has NO centre that clears the
 *  word gate. A seed is gated at import to ≥15 required words centre-agnostically
 *  at its own difficulty, but a specific centre can fall short; re-sample the
 *  seed only if none of its (distinct) centres clear the gate. */
const MAX_SEED_ATTEMPTS = 25

// ───────────────────────────────────────────────────────────
// Sampling (impure — uses Math.random)
// ───────────────────────────────────────────────────────────

/** Fisher–Yates shuffle of a copy — used to try a seed's 9 candidate centres
 *  in random order (so repeated boards on the same seed vary their centre). */
function shuffled<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Sample a pangram mask uniformly from the weighted pool. The pool is
 *  already gated at import time (≥15 required words at each seed's own
 *  difficulty) and again by the difficulty <= required_band fetch filter,
 *  so there's no per-row quality re-check here. Throws when the pool is
 *  empty (e.g. the overlap cap excluded everything — but it should leave
 *  hundreds of candidates in practice). */
function sampleMask(weighted: PangramRow[]): PangramRow {
  if (weighted.length === 0) {
    throw new Error('no pangram seeds match the overlap-cap filter')
  }
  return weighted[Math.floor(Math.random() * weighted.length)]
}

// ───────────────────────────────────────────────────────────
// PostgREST helpers
// ───────────────────────────────────────────────────────────

/** Page size for bulk-fetch loops — an optimization knob, NOT a
 *  correctness bound. The loop below is cap-agnostic (advances by the
 *  rows actually received, stops only on an empty page), so a server
 *  max_rows below this — config drift, a hosted dashboard out of sync
 *  with config.toml — just means more round-trips, never lost rows.
 *  Keep ≤ config.toml's [api] max_rows for fewest round-trips. */
const PAGE_SIZE = 10_000

/** Fetches the pangram seeds eligible for this game — those whose pangram is
 *  gettable at the required band (difficulty <= required_band). The
 *  difficulty tag is what lets the pool grow with the game's difficulty
 *  (docs/games/wordwheel.md). Worst case (band 6) is the full ~36.7k pool —
 *  ~4 round-trips at the 10k page size. */
async function fetchPangrams(
  supabase: SupabaseClient,
  requiredBand: number,
): Promise<PangramRow[]> {
  const out: PangramRow[] = []
  for (let from = 0; ; ) {
    const { data, error } = await supabase
      .schema('wordwheel')
      .from('pangrams')
      .select('letters, mask, difficulty, has_rare_letters')
      .lte('difficulty', requiredBand)
      // Order by the primary key so successive .range() windows are stable
      // pages of ONE ordering — without it Postgres gives no cross-statement
      // order guarantee, so rows could be skipped or double-counted across
      // pages (a sampling-distribution skew, not a wrong board).
      .order('letters', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`fetchPangrams page ${from}: ${error.message}`)
    const page = (data ?? []) as PangramRow[]
    // Cap-agnostic advance: step by what actually arrived (the server may cap
    // a window below PAGE_SIZE) and stop only on an empty page — a short page
    // is NOT a reliable "last page" signal when max_rows < PAGE_SIZE.
    if (page.length === 0) break
    out.push(...page)
    from += page.length
  }
  return out
}

/** Looks up the most recent wordwheel.games row in the club. Returns null if
 *  the club has never played wordwheel. RLS makes this safe — a non-member
 *  would get no rows even without the caller-specified club_handle filter. */
async function fetchPreviousMask(
  supabase: SupabaseClient,
  clubHandle: string,
): Promise<bigint | null> {
  const { data, error } = await supabase
    .schema('wordwheel')
    .from('games')
    .select('outer_letters, center_letter')
    .eq('club_handle', clubHandle)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`fetchPreviousMask: ${error.message}`)
  if (data === null) return null
  return letterMask(data.outer_letters + data.center_letter)
}

/** Fetches every legal word that uses only puzzle letters AND contains the
 *  centre letter, via wordwheel.candidate_words. The bitmask intersection
 *  (and wordwheel's difficulty/dialect/length slice of common.words) runs
 *  server-side, so the response is only the matching rows (well under
 *  max_rows). One round-trip per centre tried.
 *
 *  This is the pure SUBSET set — it still contains words demanding more of a
 *  letter than the wheel has tiles; buildBoard() drops those. */
async function fetchCandidateWords(
  supabase: SupabaseClient,
  puzzleMask: bigint,
  centerBit: bigint,
  requiredBand: number,
  legalBand: number,
): Promise<CandidateRow[]> {
  const { data, error } = await supabase
    .schema('wordwheel')
    .rpc('candidate_words', {
      // bigint → string for the JSON wire; Postgres parses back to bigint.
      puzzle_mask: puzzleMask.toString(),
      center_bit: centerBit.toString(),
      required_band: requiredBand,
      legal_band: legalBand,
    })
  if (error) throw new Error(`fetchCandidateWords: ${error.message}`)
  // The RPC returns (word, letter_mask, is_required); is_legal isn't on the
  // row because the function pre-filters on it. Synthesize is_legal=true.
  // letter_mask is dropped — the fit check counts the word's letters
  // directly, since a mask can't carry multiplicity.
  return ((data ?? []) as Array<{
    word: string
    is_required: boolean
  }>).map((row) => ({
    word: row.word,
    is_required: row.is_required,
    is_legal: true,
  }))
}

// ───────────────────────────────────────────────────────────
// HTTP entry point
// ───────────────────────────────────────────────────────────

serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const parsed = await parseBuildBoardRequest(req, 'wordwheel-build-board')
    if (parsed instanceof Response) return parsed
    const { targetClub, mode, playerUserIds, supabase } = parsed
    const setup = parsed.setup as Setup
    // Word bands for this board (create_game is the authority on their range;
    // here we just default the classic 3 / 5 and feed candidate_words).
    const requiredBand = setup.required ?? 3
    const legalBand = setup.legal ?? 5

    // Optional custom board: the player's own letters. Both fields set → custom
    // (the FE sends them lowercased/letters-only; we re-normalize defensively).
    const customCenter =
      typeof setup.custom_center === 'string' ? setup.custom_center.trim().toLowerCase() : ''
    const customLetters =
      typeof setup.custom_letters === 'string' ? setup.custom_letters.trim().toLowerCase() : ''
    const isCustom = customCenter !== '' || customLetters !== ''

    let board: Board | null = null

    if (isCustom) {
      // ─── Custom board: build from exactly the player's letters ───────────
      // No random sampling, no previous-board overlap cap, and no ≥15 quality
      // gate — the player chose these letters, so we build whatever puzzle they
      // yield. It must still have ≥1 required word (create_game re-checks) or the
      // rank ladder would be degenerate (Genius at 0 points).
      const err = validateCustomLetters(customCenter, customLetters)
      if (err) {
        console.log(`reject: custom letters invalid — ${err}`)
        return json({ error: err }, 400)
      }
      const mask = letterMask(customLetters + customCenter)
      const centerBit = 1n << BigInt(customCenter.charCodeAt(0) - 97)
      const candidates = await fetchCandidateWords(supabase, mask, centerBit, requiredBand, legalBand)
      board = buildBoard(customLetters, customCenter, candidates)
      console.log(
        `custom board: ${customLetters}+${customCenter} → ${board.required_words_count} required words`,
      )
      if (board.required_words_count < 1) {
        console.log('reject: custom letters yield no required words')
        return json(
          {
            error:
              `those letters yield no required words at difficulty ${requiredBand}`
              + ` — try a lower required difficulty or different letters`,
          },
          400,
        )
      }
    } else {
      // ─── Random board: sample a pangram seed + centre ────────────────────
      // 1. Read the previous board (for overlap cap)
      const previousMask = await fetchPreviousMask(supabase, targetClub)
      console.log(`previousMask: ${previousMask === null ? 'none' : previousMask.toString()}`)

      // 2. Sample a pangram mask — only seeds gettable at the required band.
      const allPangrams = await fetchPangrams(supabase, requiredBand)
      console.log(`fetched ${allPangrams.length} pangram seeds (difficulty <= ${requiredBand})`)
      if (allPangrams.length === 0) {
        console.log('reject: no pangram seeds at this required band')
        return json(
          { error: `no pangram seeds at required difficulty ${requiredBand}` },
          500,
        )
      }
      // Board constraint: "unique letters only" keeps just the seeds whose nine
      // letters are all distinct (a seed's `letters` is the sorted 9-char
      // multiset, so distinct ⟺ every character differs). Applied before the
      // overlap cap so both filters compose. If it empties the pool, say so
      // specifically — the friend can drop the constraint or the difficulty.
      const constrained = setup.unique_letters
        ? allPangrams.filter((row) => new Set(row.letters).size === WHEEL_SIZE)
        : allPangrams
      if (setup.unique_letters) {
        console.log(`unique-letters constraint: ${constrained.length}/${allPangrams.length} seeds all-distinct`)
      }
      if (constrained.length === 0) {
        console.log('reject: no all-distinct pangram seeds at this required band')
        return json(
          { error: `no unique-letter boards at required difficulty ${requiredBand} — try a higher difficulty or turn off "unique letters only"` },
          500,
        )
      }
      const eligible = applyOverlapCap(constrained, previousMask)
      if (eligible.length === 0) {
        console.log('reject: empty pangram pool after overlap cap')
        return json(
          { error: 'no eligible pangram seeds after applying overlap cap' },
          500,
        )
      }
      const weighted = buildWeightedPool(eligible)

      // 3-4. Sample a seed AND a centre that clears the word gate.
      // A seed's import-time gate is over its whole 9-tile multiset, but the
      // puzzle only counts words that CONTAIN THE CENTRE. So a poorly-chosen
      // centre can land a real board below the ≥15 gate even though the
      // multiset is fine. Fix: try the seed's centres in random order and keep
      // the first that clears the gate; re-sample the seed only if NONE do.
      // Centres are the seed's DISTINCT letters: picking either of two
      // duplicate tiles as centre makes the identical board (same centre
      // letter, same outer multiset), so trying both would be wasted work —
      // and sampling tile-uniformly would bias centres toward duplicated
      // letters for no gameplay payoff.
      for (
        let seedAttempt = 0;
        seedAttempt < MAX_SEED_ATTEMPTS && board === null;
        seedAttempt++
      ) {
        const seed = sampleMask(weighted)
        const mask = BigInt(seed.mask)
        const letters = seed.letters
        for (const center of shuffled([...new Set(letters)])) {
          const centerBit = 1n << BigInt(center.charCodeAt(0) - 97)
          const candidates = await fetchCandidateWords(supabase, mask, centerBit, requiredBand, legalBand)
          // replace() removes exactly ONE occurrence — a duplicated centre
          // leaves its twin among the outer tiles, as it should.
          const cand = buildBoard(letters.replace(center, ''), center, candidates)
          if (cand.required_words_count >= MIN_REQUIRED_WORDS_COUNT) {
            board = cand
            break
          }
          console.log(
            `seed ${letters} center '${center}': ${cand.required_words_count} words`
            + ` (< ${MIN_REQUIRED_WORDS_COUNT}) — trying another center`,
          )
        }
      }

      if (board === null) {
        console.log(`reject: no seed/center cleared the ${MIN_REQUIRED_WORDS_COUNT}-word gate in ${MAX_SEED_ATTEMPTS} seeds`)
        return json(
          { error: `could not build a board with ≥${MIN_REQUIRED_WORDS_COUNT} required words` },
          500,
        )
      }
    }
    console.log(
      `board: outer=${board.outer_letters} center=${board.center_letter}`
      + ` required_words_score=${board.required_words_score} required_words_count=${board.required_words_count}`,
    )

    // ─── 5. Create the game ───────────────────────────────
    return await invokeCreateGame(
      supabase,
      'wordwheel',
      { target_club: targetClub, setup, player_user_ids: playerUserIds, mode, board },
      'wordwheel-build-board',
    )
  } catch (e) {
    console.error('wordwheel-build-board threw:', e)
    return json(
      { error: String(e instanceof Error ? e.message : e) },
      500,
    )
  }
})
