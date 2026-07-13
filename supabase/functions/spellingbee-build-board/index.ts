/**
 * spellingbee-build-board — Edge Function that produces a fresh
 * spellingbee puzzle and creates the game in one round-trip.
 *
 * The PURE board-building core (overlap cap, weighted pool, scoring, the
 * required/bonus partition, custom-letter validation) lives in ./board.ts,
 * unit-tested by ./board_test.ts. This file keeps the orchestration: weighted
 * random sampling over the pangram seeds, the ING-dampening filter, a
 * subset-mask join against common.words (via the candidate_words RPC), and the
 * serve handler.
 *
 * Why edge (not PL/pgSQL): the diverse-builder strategy needs weighted random
 * sampling, two filter passes (previous-letters overlap cap + ING dampening),
 * and the subset-mask join — much easier in TypeScript than plpgsql.
 *
 * Architecture:
 *   1. Verify the caller's JWT, read the inputs.
 *   2. As the caller, fetch:
 *        - spellingbee.pangrams (all ~3.5k rows — small, cheap)
 *        - the club's most-recent spellingbee.games row (for the
 *          overlap cap)
 *   3. Run the diverse-builder strategy in-process:
 *        a. Filter pangrams by overlap cap against the previous
 *           board (≤4 of 7 letters shared).
 *        b. ING dampening: a mask containing all of {i, n, g}
 *           is accepted only 1/3 of the time. Reduces the
 *           dominance of -ing-ending words in the corpus.
 *        c. Weighted sample: rare-letter masks (the
 *           has_rare_letters flag) get a 3x weight boost so
 *           j/q/x/z/k/v/w/y/b/f/h get fair representation
 *           against the long tail of common-letter pangrams.
 *   4. Pick the center letter from the 7 in the mask (uniform).
 *   5. As the caller, query common.words (via the candidate_words
 *      RPC) for every word whose mask is a subset of the puzzle
 *      mask AND uses the center letter. Compute points per required
 *      word (length score + 10 if pangram).
 *   6. Call spellingbee.create_game(target_club, setup,
 *      player_user_ids, board) over PostgREST — the RPC
 *      validates everything end-to-end and returns the new id.
 *   7. Return { id } to the FE.
 *
 * Secrets / env:
 *   - SUPABASE_URL       auto-injected
 *   - SUPABASE_ANON_KEY  auto-injected
 *
 * The caller's JWT carries every authorization signal we need:
 *   - spellingbee.pangrams + common.words are authenticated-readable
 *     (RLS off, public SELECT).
 *   - spellingbee.games is RLS-gated on club membership, so the
 *     previous-board fetch only returns rows for clubs the
 *     caller belongs to.
 *   - spellingbee.create_game runs as security definer and
 *     re-checks membership via common.require_club_member.
 * No service-role needed anywhere.
 *
 * Calling shape (from the FE):
 *   POST /functions/v1/spellingbee-build-board
 *   { target_club: uuid,
 *     setup: jsonb,                 // {timer, target_rank?}, NO mode field
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
  applyOverlapCap,
  buildBoard,
  buildWeightedPool,
  letterMask,
  maskLetters,
  validateCustomLetters,
} from './board.ts'

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

type Setup = {
  /** Required when `mode === 'compete'` (validated server-side). */
  target_rank?: number
  /** Vocabulary bands for this board's word lists (validated server-side by
   *  spellingbee.create_game). `required` (1..6, default 3) = the displayed goal
   *  set; `legal` (required..6, default 5) = the wider accepted set. */
  required?: number
  legal?: number
  /** Optional custom board — the player's own letters. `custom_center` = the
   *  center letter, `custom_letters` = the six other letters. When both are set
   *  (and valid) we build a board from exactly these letters instead of sampling
   *  a random pangram seed. Both create_game and this function re-validate. */
  custom_center?: string
  custom_letters?: string
  timer:
    | { kind: 'none' }
    | { kind: 'countup' }
    | { kind: 'countdown'; seconds: number }
}

// ───────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────

/** Accept rate for masks containing all of {i, n, g}. */
const ING_ACCEPT_RATE = 1 / 3
/** Sanity gate that must agree with the RPC's same gate. */
const MIN_REQUIRED_WORDS_COUNT = 30
/** How many random retries before we give up — extremely
 *  unlikely to hit, but protects against pathological inputs
 *  (e.g. previous board with all-rare letters). */
const MAX_SAMPLE_ATTEMPTS = 50
/** How many seeds to try when a sampled seed has NO center that clears the
 *  word gate. A seed's stored count is over its whole 7-letter set; a specific
 *  center can fall short, and (rarely) every center of a barely-≥30 seed does.
 *  Re-sample in that case. */
const MAX_SEED_ATTEMPTS = 25

const I_BIT = 1n << BigInt('i'.charCodeAt(0) - 97)
const N_BIT = 1n << BigInt('n'.charCodeAt(0) - 97)
const G_BIT = 1n << BigInt('g'.charCodeAt(0) - 97)
const ING_MASK = I_BIT | N_BIT | G_BIT

// ───────────────────────────────────────────────────────────
// Sampling (impure — uses Math.random)
// ───────────────────────────────────────────────────────────

/** Fisher–Yates shuffle of a copy — used to try a seed's 7 candidate centers
 *  in random order (so repeated boards on the same seed vary their center). */
function shuffled<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** ING dampening: if the mask has all of {i, n, g}, accept it
 *  only ING_ACCEPT_RATE of the time. Reduces the corpus's
 *  natural skew toward -ing words. */
function shouldKeepForIng(mask: bigint): boolean {
  if ((mask & ING_MASK) !== ING_MASK) return true
  return Math.random() < ING_ACCEPT_RATE
}

/** Sample a pangram mask. Retries until a candidate survives
 *  the ING-dampening rejection AND the MIN_REQUIRED_WORDS_COUNT gate.
 *  Throws when the pool is empty (e.g. previous-board cap
 *  excluded everything — but the cap should leave thousands of
 *  candidates in practice). */
function sampleMask(weighted: PangramRow[]): PangramRow {
  if (weighted.length === 0) {
    throw new Error('no pangram seeds match the overlap-cap filter')
  }
  for (let attempt = 0; attempt < MAX_SAMPLE_ATTEMPTS; attempt++) {
    const row = weighted[Math.floor(Math.random() * weighted.length)]
    const mask = BigInt(row.mask)
    if (!shouldKeepForIng(mask)) continue
    if (row.required_words_count < MIN_REQUIRED_WORDS_COUNT) continue
    return row
  }
  // After MAX_SAMPLE_ATTEMPTS the ING-rejection has cumulative
  // probability (2/3)^50 ≈ 1.6e-9 of being the cause. The
  // realistic failure mode is no row in the weighted pool
  // passing MIN_REQUIRED_WORDS_COUNT — but those rows were filtered at
  // import time, so this branch is essentially unreachable.
  throw new Error('failed to sample a valid pangram mask after retries')
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

/** Fetches the entire pangram pool. ~3.5k rows × ~30 bytes each
 *  = ~100 KB JSON — a single round-trip at the 10k page size. */
async function fetchPangrams(supabase: SupabaseClient): Promise<PangramRow[]> {
  const out: PangramRow[] = []
  for (let from = 0; ; ) {
    const { data, error } = await supabase
      .schema('spellingbee')
      .from('pangrams')
      .select('mask, required_words_count, has_rare_letters')
      // Order by the primary key so successive .range() windows are stable
      // pages of ONE ordering (without it Postgres gives no cross-statement
      // order guarantee — rows could be skipped or double-counted across pages).
      .order('mask', { ascending: true })
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

/** Looks up the most recent spellingbee.games row in the club.
 *  Returns null if the club has never played spellingbee. RLS makes
 *  this safe — a non-member would get no rows even without the
 *  caller-specified club_handle filter. */
async function fetchPreviousMask(
  supabase: SupabaseClient,
  clubHandle: string,
): Promise<bigint | null> {
  const { data, error } = await supabase
    .schema('spellingbee')
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

/** Fetches every legal word that uses only puzzle letters AND
 *  contains the center letter. The bitmask intersection (and
 *  spellingbee's difficulty/dialect/length slice of common.words) runs
 *  server-side via `spellingbee.candidate_words(puzzle_mask,
 *  center_bit)`, so the response is only the matching ~hundreds of
 *  rows (well under max_rows). One round-trip per board.
 *
 *  Earlier shape pulled the full word list and filtered in JS; that
 *  ran into PostgREST's max_rows = 1000 cap (silent truncation to
 *  the alphabetically-first 1000 words). The RPC pattern fixes the
 *  truncation without bumping the global cap. */
async function fetchCandidateWords(
  supabase: SupabaseClient,
  puzzleMask: bigint,
  centerBit: bigint,
  requiredBand: number,
  legalBand: number,
): Promise<CandidateRow[]> {
  const { data, error } = await supabase
    .schema('spellingbee')
    .rpc('candidate_words', {
      // bigint → string for the JSON wire; Postgres parses back
      // to bigint on the column-type match.
      puzzle_mask: puzzleMask.toString(),
      center_bit: centerBit.toString(),
      // The per-game word bands (default to the classic 3 / 5).
      required_band: requiredBand,
      legal_band: legalBand,
    })
  if (error) throw new Error(`fetchCandidateWords: ${error.message}`)
  // The RPC returns (word, letter_mask, is_required) — note that
  // is_legal isn't on the row because the function pre-filters
  // on it. We synthesize is_legal=true for the consumer.
  return ((data ?? []) as Array<{
    word: string
    letter_mask: string | number
    is_required: boolean
  }>).map((row) => ({
    word: row.word,
    letter_mask: String(row.letter_mask),
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
    const parsed = await parseBuildBoardRequest(req, 'spellingbee-build-board')
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
      // No random sampling, no previous-board overlap cap, and no ≥30 quality
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
      // ─── Random board: sample a pangram seed + center ────────────────────
      // 1. Read the previous board (for overlap cap)
      const previousMask = await fetchPreviousMask(supabase, targetClub)
      console.log(`previousMask: ${previousMask === null ? 'none' : previousMask.toString()}`)

      // 2. Sample a pangram mask
      const allPangrams = await fetchPangrams(supabase)
      console.log(`fetched ${allPangrams.length} pangram seeds`)
      const eligible = applyOverlapCap(allPangrams, previousMask)
      if (eligible.length === 0) {
        console.log('reject: empty pangram pool after overlap cap')
        return json(
          { error: 'no eligible pangram seeds after applying overlap cap' },
          500,
        )
      }
      const weighted = buildWeightedPool(eligible)

      // 3-4. Sample a seed AND a center that clears the word gate.
      // A seed's stored `required_words_count` is over its whole 7-letter SET, but the
      // puzzle only counts words that CONTAIN THE CENTER. So a poorly-chosen
      // center can land a real board below the ≥30 gate even though the set is
      // fine — which the old "pick center uniformly, then reject if short" path
      // surfaced as an error when create_game re-checked the gate. Fix: try the
      // seed's 7 centers in random order and keep the first that clears the gate;
      // re-sample the seed only if NONE of its centers do (rare).
      for (
        let seedAttempt = 0;
        seedAttempt < MAX_SEED_ATTEMPTS && board === null;
        seedAttempt++
      ) {
        const seed = sampleMask(weighted)
        const mask = BigInt(seed.mask)
        const letters = maskLetters(mask)
        for (const center of shuffled([...letters])) {
          const centerBit = 1n << BigInt(center.charCodeAt(0) - 97)
          const candidates = await fetchCandidateWords(supabase, mask, centerBit, requiredBand, legalBand)
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
      'spellingbee',
      { target_club: targetClub, setup, player_user_ids: playerUserIds, mode, board },
      'spellingbee-build-board',
    )
  } catch (e) {
    console.error('spellingbee-build-board threw:', e)
    return json(
      { error: String(e instanceof Error ? e.message : e) },
      500,
    )
  }
})
