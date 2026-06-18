/**
 * freebee-build-board — Edge Function that produces a fresh
 * freebee puzzle and creates the game in one round-trip.
 *
 * Why edge (not PL/pgSQL): the diverse-builder strategy needs
 * weighted random sampling over the ~3.5k pangram seeds, two
 * filter passes (previous-letters overlap cap + ING dampening),
 * and a subset-mask join against the ~46k dictionary. All of
 * this is much easier to express + maintain in TypeScript than
 * in plpgsql.
 *
 * Architecture:
 *   1. Verify the caller's JWT, read the inputs.
 *   2. As the caller, fetch:
 *        - freebee.pangrams (all ~3.5k rows — small, cheap)
 *        - the club's most-recent freebee.games row (for the
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
 *   5. As the caller, query freebee.dictionary for every word
 *      whose mask is a subset of the puzzle mask AND uses the
 *      center letter. Compute points per scoring word (length
 *      score + 10 if pangram).
 *   6. Call freebee.create_game(target_club, setup,
 *      player_user_ids, board) over PostgREST — the RPC
 *      validates everything end-to-end and returns the new id.
 *   7. Return { id } to the FE.
 *
 * Secrets / env:
 *   - SUPABASE_URL       auto-injected
 *   - SUPABASE_ANON_KEY  auto-injected
 *
 * The caller's JWT carries every authorization signal we need:
 *   - freebee.pangrams + freebee.dictionary are
 *     authenticated-readable (RLS off, public SELECT).
 *   - freebee.games is RLS-gated on club membership, so the
 *     previous-board fetch only returns rows for clubs the
 *     caller belongs to.
 *   - freebee.create_game runs as security definer and
 *     re-checks membership via common.require_club_member.
 * No service-role needed anywhere.
 *
 * Calling shape (from the FE):
 *   POST /functions/v1/freebee-build-board
 *   { target_club: uuid, setup: jsonb, player_user_ids: uuid[] }
 *   → { id: uuid }  (200)
 *   → { error: string }  (400/401/403/500)
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// ───────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────

type Setup = {
  mode: 'coop' | 'compete'
  target_rank?: number
  timer:
    | { kind: 'none' }
    | { kind: 'countup' }
    | { kind: 'countdown'; seconds: number }
}

/** The board payload handed to freebee.create_game. */
type Board = {
  outer_letters: string
  center_letter: string
  total_score: number
  total_words: number
  scoring_words: Array<{ word: string; points: number; is_pangram: boolean }>
  legal_words: string[]
}

type PangramRow = {
  mask: string                // bigint comes through PostgREST as string
  scoring_words: number
  has_rare_letters: boolean
}

type DictionaryRow = {
  word: string
  letter_mask: string
  in_scoring: boolean
  in_legal: boolean
}

// ───────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Overlap cap with the previous board, in letters out of 7. */
const MAX_PREVIOUS_OVERLAP = 4
/** Weighting boost for has_rare_letters masks. */
const RARE_LETTER_WEIGHT = 3
/** Accept rate for masks containing all of {i, n, g}. */
const ING_ACCEPT_RATE = 1 / 3
/** Sanity gate that must agree with the RPC's same gate. */
const MIN_SCORING_WORDS = 30
/** How many random retries before we give up — extremely
 *  unlikely to hit, but protects against pathological inputs
 *  (e.g. previous board with all-rare letters). */
const MAX_SAMPLE_ATTEMPTS = 50

const I_BIT = 1n << BigInt('i'.charCodeAt(0) - 97)
const N_BIT = 1n << BigInt('n'.charCodeAt(0) - 97)
const G_BIT = 1n << BigInt('g'.charCodeAt(0) - 97)
const ING_MASK = I_BIT | N_BIT | G_BIT

// ───────────────────────────────────────────────────────────
// Bitmask helpers
// ───────────────────────────────────────────────────────────

function letterMask(s: string): bigint {
  let mask = 0n
  for (const ch of s.toLowerCase()) {
    const code = ch.charCodeAt(0) - 97
    if (code >= 0 && code < 26) mask |= 1n << BigInt(code)
  }
  return mask
}

function popcount26(mask: bigint): number {
  let m = mask
  let count = 0
  while (m !== 0n) {
    count += Number(m & 1n)
    m >>= 1n
  }
  return count
}

/** Letters in the mask, as a lowercase string ('a' = bit 0). */
function maskLetters(mask: bigint): string {
  let out = ''
  for (let i = 0; i < 26; i++) {
    if ((mask & (1n << BigInt(i))) !== 0n) {
      out += String.fromCharCode(97 + i)
    }
  }
  return out
}

// ───────────────────────────────────────────────────────────
// Diverse builder
// ───────────────────────────────────────────────────────────

/** Filter the pangram pool by the previous-board overlap cap.
 *  Returns the input unchanged when previousMask is null. */
function applyOverlapCap(
  pool: PangramRow[],
  previousMask: bigint | null,
): PangramRow[] {
  if (previousMask === null) return pool
  return pool.filter((row) => {
    const overlap = popcount26(BigInt(row.mask) & previousMask)
    return overlap <= MAX_PREVIOUS_OVERLAP
  })
}

/** Build the weighted candidate array. A mask appears
 *  RARE_LETTER_WEIGHT times if has_rare_letters; otherwise once.
 *  Cheap given pool size (~3.5k → ~7-10k after weighting). */
function buildWeightedPool(pool: PangramRow[]): PangramRow[] {
  const weighted: PangramRow[] = []
  for (const row of pool) {
    const reps = row.has_rare_letters ? RARE_LETTER_WEIGHT : 1
    for (let i = 0; i < reps; i++) weighted.push(row)
  }
  return weighted
}

/** ING dampening: if the mask has all of {i, n, g}, accept it
 *  only ING_ACCEPT_RATE of the time. Reduces the corpus's
 *  natural skew toward -ing words. */
function shouldKeepForIng(mask: bigint): boolean {
  if ((mask & ING_MASK) !== ING_MASK) return true
  return Math.random() < ING_ACCEPT_RATE
}

/** Sample a pangram mask. Retries until a candidate survives
 *  the ING-dampening rejection AND the MIN_SCORING_WORDS gate.
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
    if (row.scoring_words < MIN_SCORING_WORDS) continue
    return row
  }
  // After MAX_SAMPLE_ATTEMPTS the ING-rejection has cumulative
  // probability (2/3)^50 ≈ 1.6e-9 of being the cause. The
  // realistic failure mode is no row in the weighted pool
  // passing MIN_SCORING_WORDS — but those rows were filtered at
  // import time, so this branch is essentially unreachable.
  throw new Error('failed to sample a valid pangram mask after retries')
}

// ───────────────────────────────────────────────────────────
// Word enumeration + scoring
// ───────────────────────────────────────────────────────────

/** Length-based score: 1pt for 4-letter, length-pt for ≥5.
 *  The pangram +10 bonus is applied inline in buildBoard()
 *  where we already have the puzzleMask in scope. */
function lengthScore(word: string): number {
  return word.length === 4 ? 1 : word.length
}

/** Given the puzzle mask + center, partition the candidate words
 *  into scoring + legal-only (bonus) and tally the totals. */
function buildBoard(
  outerLetters: string,
  centerLetter: string,
  candidateWords: DictionaryRow[],
): Board {
  const puzzleMask = letterMask(outerLetters + centerLetter)
  const scoring: Board['scoring_words'] = []
  const legal: string[] = []
  let totalScore = 0
  let totalWords = 0

  for (const row of candidateWords) {
    const wMask = BigInt(row.letter_mask)
    if (row.in_scoring) {
      const isPangram = wMask === puzzleMask
      const points = lengthScore(row.word) + (isPangram ? 10 : 0)
      scoring.push({ word: row.word, points, is_pangram: isPangram })
      totalScore += points
      totalWords++
    } else {
      // in_legal && !in_scoring: bonus-only
      legal.push(row.word)
    }
  }

  return {
    outer_letters: outerLetters,
    center_letter: centerLetter,
    total_score: totalScore,
    total_words: totalWords,
    scoring_words: scoring,
    legal_words: legal,
  }
}

// ───────────────────────────────────────────────────────────
// PostgREST helpers
// ───────────────────────────────────────────────────────────

/** PostgREST's max_rows cap (per supabase/config.toml). Page size
 *  for any bulk-fetch loop is bounded by this — requesting more
 *  in a single `.range()` would still be silently truncated. */
const PAGE_SIZE = 1000

/** Fetches the entire pangram pool. ~3.5k rows × ~30 bytes each
 *  = ~100 KB JSON across the pages, ~4 PostgREST round-trips at
 *  the 1000-row cap. The loop terminates when a page comes back
 *  shorter than PAGE_SIZE — that's the last page. */
async function fetchPangrams(supabase: SupabaseClient): Promise<PangramRow[]> {
  const out: PangramRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .schema('freebee')
      .from('pangrams')
      .select('mask, scoring_words, has_rare_letters')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`fetchPangrams page ${from}: ${error.message}`)
    const page = (data ?? []) as PangramRow[]
    out.push(...page)
    if (page.length < PAGE_SIZE) break
  }
  return out
}

/** Looks up the most recent freebee.games row in the club.
 *  Returns null if the club has never played freebee. RLS makes
 *  this safe — a non-member would get no rows even without the
 *  caller-specified club_id filter. */
async function fetchPreviousMask(
  supabase: SupabaseClient,
  clubId: string,
): Promise<bigint | null> {
  const { data, error } = await supabase
    .schema('freebee')
    .from('games')
    .select('outer_letters, center_letter')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`fetchPreviousMask: ${error.message}`)
  if (data === null) return null
  return letterMask(data.outer_letters + data.center_letter)
}

/** Fetches every dictionary word that uses only puzzle letters
 *  AND contains the center letter. The bitmask intersection
 *  runs server-side via `freebee.candidate_words(puzzle_mask,
 *  center_bit)`, so the response is only the matching ~hundreds
 *  of rows (well under max_rows). One round-trip per board.
 *
 *  Earlier shape pulled the full dictionary and filtered in JS;
 *  that ran into PostgREST's max_rows = 1000 cap (silent
 *  truncation to the alphabetically-first 1000 words). The RPC
 *  pattern fixes the truncation without bumping the global cap. */
async function fetchCandidateWords(
  supabase: SupabaseClient,
  puzzleMask: bigint,
  centerBit: bigint,
): Promise<DictionaryRow[]> {
  const { data, error } = await supabase
    .schema('freebee')
    .rpc('candidate_words', {
      // bigint → string for the JSON wire; Postgres parses back
      // to bigint on the column-type match.
      puzzle_mask: puzzleMask.toString(),
      center_bit: centerBit.toString(),
    })
  if (error) throw new Error(`fetchCandidateWords: ${error.message}`)
  // The RPC returns (word, letter_mask, in_scoring) — note that
  // in_legal isn't on the row because the function pre-filters
  // on it. We synthesize in_legal=true for the consumer.
  return ((data ?? []) as Array<{
    word: string
    letter_mask: string | number
    in_scoring: boolean
  }>).map((row) => ({
    word: row.word,
    letter_mask: String(row.letter_mask),
    in_scoring: row.in_scoring,
    in_legal: true,
  }))
}

// ───────────────────────────────────────────────────────────
// HTTP entry point
// ───────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Always log a one-line trace at entry so the function-serve
  // output shows that the request arrived even when the body
  // turns out to be unparseable. Without this the early-return
  // paths (400 for missing fields, 401 for no auth) look like
  // silent failures in the log.
  console.log('freebee-build-board: request received')

  try {
    const body = await req.json().catch(() => ({}))
    const targetClub: string | undefined = body.target_club
    const setup: Setup | undefined = body.setup
    const playerUserIds: string[] | undefined = body.player_user_ids

    if (!targetClub || typeof targetClub !== 'string') {
      console.log('reject: missing target_club; body keys =', Object.keys(body))
      return json({ error: 'target_club (uuid string) required' }, 400)
    }
    if (!setup || typeof setup !== 'object') {
      console.log('reject: missing/invalid setup')
      return json({ error: 'setup (object) required' }, 400)
    }
    if (!Array.isArray(playerUserIds) || playerUserIds.length === 0) {
      console.log('reject: missing player_user_ids')
      return json({ error: 'player_user_ids (non-empty uuid[]) required' }, 400)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.log('reject: no Authorization header')
      return json({ error: 'authorization required' }, 401)
    }

    console.log(`accepted: target_club=${targetClub}, players=${playerUserIds.length}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    // ─── 1. Read the previous board (for overlap cap) ─────
    const previousMask = await fetchPreviousMask(supabase, targetClub)
    console.log(`previousMask: ${previousMask === null ? 'none' : previousMask.toString()}`)

    // ─── 2. Sample a pangram mask ─────────────────────────
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
    const seed = sampleMask(weighted)
    const mask = BigInt(seed.mask)
    const letters = maskLetters(mask)
    console.log(`sampled mask: letters=${letters}`)

    // ─── 3. Pick center uniformly from the 7 letters ──────
    const centerLetter = letters[Math.floor(Math.random() * letters.length)]
    const outerLetters = letters.replace(centerLetter, '')
    const centerBit = 1n << BigInt(centerLetter.charCodeAt(0) - 97)

    // ─── 4. Build the wordlists ───────────────────────────
    const candidates = await fetchCandidateWords(supabase, mask, centerBit)
    console.log(`fetched ${candidates.length} candidate words`)
    const board = buildBoard(outerLetters, centerLetter, candidates)
    console.log(
      `board: outer=${board.outer_letters} center=${board.center_letter}`
      + ` total_score=${board.total_score} total_words=${board.total_words}`,
    )

    if (board.total_words < MIN_SCORING_WORDS) {
      console.log(`reject: board has only ${board.total_words} scoring words`)
      return json(
        {
          error: `built board has only ${board.total_words} scoring words (< ${MIN_SCORING_WORDS}); pangram seed table may be stale`,
        },
        500,
      )
    }

    // ─── 5. Create the game ───────────────────────────────
    const { data: createdRows, error: createErr } = await supabase
      .schema('freebee')
      .rpc('create_game', {
        target_club: targetClub,
        setup,
        player_user_ids: playerUserIds,
        board,
      })
    if (createErr) {
      console.log('create_game RPC error:', createErr.message)
      return json({ error: createErr.message }, 400)
    }
    const created = (createdRows as Array<{ id: string }> | null) ?? []
    if (created.length === 0) {
      console.log('reject: create_game returned no row')
      return json({ error: 'create_game returned no row' }, 500)
    }

    console.log(`success: id=${created[0].id}`)
    return json({ id: created[0].id })
  } catch (e) {
    console.error('freebee-build-board threw:', e)
    return json(
      { error: String(e instanceof Error ? e.message : e) },
      500,
    )
  }
})
