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
 * Why edge (not PL/pgSQL): the diverse-builder strategy needs weighted
 * random sampling over the pangram seeds, a previous-letters overlap
 * cap, and a subset-mask join against the word list (common.words, via
 * the candidate_words RPC) plus the multiset-fit post-filter. All much
 * easier to express + maintain in TypeScript than in plpgsql.
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
 *   { target_club: uuid,
 *     setup: jsonb,                 // {timer, required?, legal?, target_rank?}, NO mode field
 *     player_user_ids: uuid[],
 *     mode: 'coop' | 'compete' }
 *   → { id: uuid }  (200)
 *   → { error: string }  (400/401/403/500)
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { json, preflight } from '../_shared/http.ts'
import { callerClient } from '../_shared/startGame.ts'

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

type Mode = 'coop' | 'compete'

/** The board payload handed to wordwheel.create_game. */
type Board = {
  outer_letters: string
  center_letter: string
  required_words_score: number
  required_words_count: number
  /** The required set: words in the smaller list (the displayed goal). */
  required_words: Array<{ word: string; points: number; is_pangram: boolean }>
  /** The bonus set (legal − required): accepted + scored, not the goal. Same
   *  { word, points, is_pangram } shape as required so the FE scores it locally. */
  bonus_words: Array<{ word: string; points: number; is_pangram: boolean }>
}

type PangramRow = {
  /** The wheel's nine letters as a sorted lowercase string (the PK), e.g.
   *  'aabcdeghi' — a MULTISET, so a letter may appear twice. */
  letters: string
  /** The distinct-letter set of `letters` (generated column), for the
   *  overlap cap + the candidate_words subset pre-filter. bigint comes
   *  through PostgREST as string. */
  mask: string
  /** The min difficulty band of a required-quality 9-letter word with this
   *  multiset — we fetch only rows with difficulty <= required_band, so the
   *  pool scales with the game's difficulty. Kept for logging. */
  difficulty: number
  /**
   * Whether the seed's 9 letters include a rare one — {j, q, x, z}
   * (very rare) or {k, v, w, y, b, f, h} (somewhat rare). The diverse
   * builder gives these masks a ×RARE_LETTER_WEIGHT sampling boost so
   * boards aren't dominated by common-letter seeds. Precomputed at
   * import time.
   */
  has_rare_letters: boolean
}

type CandidateRow = {
  word: string
  /** In the required set (difficulty ≤ required_band, american, no slang, clean:
   *  slur 0 + crude 0) — counts toward the goal. */
  is_required: boolean
  /** In the legal set (difficulty ≤ legal_band) — enterable. Always true here
   *  (candidate_words already pre-filters to legal). */
  is_legal: boolean
}

// ───────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────

/** The nine wheel letters (one centre + eight outer). */
const WHEEL_SIZE = 9
/** Overlap cap with the previous board, in letters out of 9. The wheel
 *  analog of spellingbee's 4-of-7 (~57%); 5-of-9 is ~56%. */
const MAX_PREVIOUS_OVERLAP = 5
/** Weighting boost for has_rare_letters masks. */
const RARE_LETTER_WEIGHT = 3
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

/** Per-letter tile counts of a letter string, indexed 0..25 ('a' = 0). The
 *  multiset twin of letterMask — this is what the fit check compares against,
 *  since the mask alone collapses duplicate tiles. */
function tileCounts(letters: string): Uint8Array {
  const counts = new Uint8Array(26)
  for (let i = 0; i < letters.length; i++) {
    const code = letters.charCodeAt(i) - 97
    if (code >= 0 && code < 26) counts[code]++
  }
  return counts
}

/** The tile-spend rule: a word fits the wheel iff each letter occurs no more
 *  times than the wheel has tiles for it. (Containing the centre is checked
 *  upstream by candidate_words.) */
function fitsTiles(word: string, wheel: Uint8Array): boolean {
  const used = new Uint8Array(26)
  for (let i = 0; i < word.length; i++) {
    const code = word.charCodeAt(i) - 97
    if (code < 0 || code >= 26) return false
    if (++used[code] > wheel[code]) return false
  }
  return true
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

/** Build the weighted candidate array. A mask appears RARE_LETTER_WEIGHT
 *  times if has_rare_letters; otherwise once. Cheap given pool size. */
function buildWeightedPool(pool: PangramRow[]): PangramRow[] {
  const weighted: PangramRow[] = []
  for (const row of pool) {
    const reps = row.has_rare_letters ? RARE_LETTER_WEIGHT : 1
    for (let i = 0; i < reps; i++) weighted.push(row)
  }
  return weighted
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
// Word enumeration + scoring (required + bonus)
// ───────────────────────────────────────────────────────────

/** Length-based score: 1pt for 4-letter, length-pt for ≥5. The pangram
 *  +15 bonus is applied inline in buildBoard() where the puzzleMask is
 *  in scope. */
function lengthScore(word: string): number {
  return word.length === 4 ? 1 : word.length
}

/** Given the wheel letters + centre, partition the candidate words into the
 *  required set + the bonus set (legal − required) and tally the required
 *  totals.
 *
 *  This is also where the tile-spend rule is enforced: candidate_words
 *  returns the pure subset set, which includes words demanding more of a
 *  letter than the wheel has tiles (e.g. "seeded" on a wheel with one 'e').
 *  We drop any word whose per-letter counts don't FIT the wheel's tile
 *  counts. The FE membership check mirrors this so submit_word can keep
 *  trusting the shipped list. */
function buildBoard(
  outerLetters: string,
  centerLetter: string,
  candidateWords: CandidateRow[],
): Board {
  const wheel = tileCounts(outerLetters + centerLetter)
  const required: Board['required_words'] = []
  const bonus: Board['bonus_words'] = []
  let requiredWordsScore = 0
  let requiredWordsCount = 0

  for (const row of candidateWords) {
    // Tile-spend: each letter used no more times than it has tiles.
    if (!fitsTiles(row.word, wheel)) continue
    // Same length + pangram scoring for both sets; the FE reads points off the
    // shipped entry, so bonus words must carry them too. A wordwheel pangram
    // uses all nine tiles — and a 9-letter word that FITS nine tiles must use
    // every one of them, so length alone decides it.
    const isPangram = row.word.length === WHEEL_SIZE
    const points = lengthScore(row.word) + (isPangram ? 15 : 0)
    if (row.is_required) {
      required.push({ word: row.word, points, is_pangram: isPangram })
      requiredWordsScore += points
      requiredWordsCount++
    } else {
      bonus.push({ word: row.word, points, is_pangram: isPangram })
    }
  }

  return {
    outer_letters: outerLetters,
    center_letter: centerLetter,
    required_words_score: requiredWordsScore,
    required_words_count: requiredWordsCount,
    required_words: required,
    bonus_words: bonus,
  }
}

/** Validate a custom (player-specified) letter set, or null if it's fine.
 *  Mirrors wordwheel.create_game's letter rules: a single centre + eight
 *  outer letters, lowercase a–z — DUPLICATES ALLOWED (the wheel is a
 *  multiset; a repeated letter just means two tiles carry it, and the
 *  centre may repeat an outer). Unlike spellingbee, 's' is allowed (a tile
 *  per use makes it ordinary). Both inputs are already lowercased/trimmed
 *  by the caller. */
function validateCustomLetters(center: string, letters: string): string | null {
  if (!/^[a-z]$/.test(center)) {
    return 'custom center must be a single letter a–z'
  }
  if (!/^[a-z]{8}$/.test(letters)) {
    return 'custom letters must be eight letters a–z'
  }
  return null
}

// ───────────────────────────────────────────────────────────
// PostgREST helpers
// ───────────────────────────────────────────────────────────

/** PostgREST's max_rows cap (per supabase/config.toml). Page size for any
 *  bulk-fetch loop is bounded by this. */
const PAGE_SIZE = 1000

/** Fetches the pangram seeds eligible for this game — those whose pangram is
 *  gettable at the required band (difficulty <= required_band). The
 *  difficulty tag is what lets the pool grow with the game's difficulty
 *  (docs/games/wordwheel.md). The loop terminates when a page comes
 *  back shorter than PAGE_SIZE. */
async function fetchPangrams(
  supabase: SupabaseClient,
  requiredBand: number,
): Promise<PangramRow[]> {
  const out: PangramRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .schema('wordwheel')
      .from('pangrams')
      .select('letters, mask, difficulty, has_rare_letters')
      .lte('difficulty', requiredBand)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`fetchPangrams page ${from}: ${error.message}`)
    const page = (data ?? []) as PangramRow[]
    out.push(...page)
    if (page.length < PAGE_SIZE) break
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

  // Always log a one-line trace at entry so the function-serve output shows
  // that the request arrived even when the body turns out to be unparseable.
  console.log('wordwheel-build-board: request received')

  try {
    const body = await req.json().catch(() => ({}))
    const targetClub: string | undefined = body.target_club
    const setup: Setup | undefined = body.setup
    const playerUserIds: string[] | undefined = body.player_user_ids
    const mode: Mode | undefined = body.mode

    if (!targetClub || typeof targetClub !== 'string') {
      console.log('reject: missing target_club; body keys =', Object.keys(body))
      return json({ error: 'target_club (uuid string) required' }, 400)
    }
    if (!setup || typeof setup !== 'object') {
      console.log('reject: missing/invalid setup')
      return json({ error: 'setup (object) required' }, 400)
    }
    // Word bands for this board (create_game is the authority on their range;
    // here we just default the classic 3 / 5 and feed candidate_words).
    const requiredBand = setup.required ?? 3
    const legalBand = setup.legal ?? 5
    if (mode !== 'coop' && mode !== 'compete') {
      console.log(`reject: invalid mode "${mode}"`)
      return json({ error: 'mode ("coop" | "compete") required' }, 400)
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

    const supabase = callerClient(authHeader)

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
    const { data: createdRows, error: createErr } = await supabase
      .schema('wordwheel')
      .rpc('create_game', {
        target_club: targetClub,
        setup,
        player_user_ids: playerUserIds,
        mode,
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
    console.error('wordwheel-build-board threw:', e)
    return json(
      { error: String(e instanceof Error ? e.message : e) },
      500,
    )
  }
})
