#!/usr/bin/env -S npx tsx
/**
 * GENERATE StackDown boards into a vendored text file —
 * `supabase/data/stackdown-boards.jsonl` (one JSON board per line). This
 * is `npm run stackdown:gen`. It does NOT touch the database; the
 * companion `npm run stackdown:import` (import-stackdown-boards.ts) loads
 * the file into `stackdown.boards`.
 *
 * The split exists because generation is SLOW — StackDown boards are
 * expensive to validate (the strict no-trap check is a recursive walk
 * over every spelling of every word — see docs/games/stackdown.md §2.4),
 * ~10s/board. We don't want to pay that on every `db:reset`. So we
 * generate a library once (this script, run rarely, output committed to
 * git like `words.tsv.gz`), and re-import the cheap file whenever the DB
 * is cleared.
 *
 * What it does:
 *   1. Loads the lexicon — the StackDown standard set (`difficulty = 1 AND
 *      american AND slur = 0 AND crude = 0 AND len = 5`; wordlist 0) — from `common.words`
 *      over a direct psql connection (read-only). MUST stay in sync with
 *      stackdown._is_word's level-0 definition.
 *   2. Generates N boards on the FIXED tile geometry (positions + the
 *      covering DAG are constant across puzzles; only the letters
 *      change). Each board is six real words arranged so the stack is
 *      strictly solvable — no reachable wrong word, and no spelling of a
 *      word can strand a later one.
 *   3. APPENDS the new boards to the JSONL file (the library grows across
 *      runs), skipping any whose six-word set is already in the file so
 *      reruns / overlapping seeds don't pile up near-duplicates. The run
 *      is reproducible: board i uses `baseSeed + i`.
 *
 * The generator below is ported from the throwaway prototype's `core.ts`
 * (the tool that pinned the rules down). It lives here, in a Node-only
 * script, rather than in `src/stackdown/lib` because it's heavy and the
 * browser never needs it — the FE only needs the display half of the
 * board logic (covers / exposedIds / depthMap), which IS in src.
 *
 * Connection (for the lexicon read): `SUPABASE_DB_URL` (defaults to the
 * local stack). Requires `psql` on PATH and a populated `common.words`
 * (run `npm run words:import` first).
 *
 * Usage:  npm run stackdown:gen -- [count] [baseSeed]
 *           count    — how many boards to generate (default 8)
 *           baseSeed — first seed; board i uses baseSeed + i (default 1000)
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const COUNT = Number(process.argv[2] ?? 8)
const BASE_SEED = Number(process.argv[3] ?? 1000)
// Per-board wall-clock budget. A board that can't be generated + validated
// within this is skipped (the search for SOME word-sets is exponential).
// Override with STACKDOWN_BOARD_TIMEOUT_MS; default 30s — typical boards
// take a few seconds, so this only trips on the pathological ones.
const PER_BOARD_TIMEOUT_MS = Number(process.env.STACKDOWN_BOARD_TIMEOUT_MS ?? 30_000)

const __dirname = dirname(fileURLToPath(import.meta.url))
const BOARDS_FILE = resolve(__dirname, '../data/stackdown-boards.jsonl')

// ── Tile model + covering rule ─────────────────────────────────────
// Canonical definitions live in src/stackdown/lib/board.ts (the display
// side imports them); duplicated here because this Node-only generator
// shouldn't reach into a browser module. Keep the rule in sync — it's
// THE rule of the game.
type Tile = { id: number; x: number; y: number; z: number; letter: string }
type Pos = { id: number; x: number; y: number; z: number }

/** A covers B iff A is higher AND within one cell in both axes. Typed on
 *  Pos (positions only) because the rule ignores letters — which lets us
 *  reuse it to precompute COVERERS straight from the fixed geometry. */
function covers(a: Pos, b: Pos): boolean {
  return a.z > b.z && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1
}

/**
 * Returns a fast "which tiles are exposed" query bound to a fixed tile
 * set. A tile is exposed iff it isn't removed and every tile that covers
 * it IS removed — O(n·coverers) per query instead of O(n²). The covering
 * relation depends only on positions, so it's precomputed ONCE for the
 * whole geometry (`COVERERS`, below) and reused across every board and
 * every call; here we just restrict it to the present subset (a coverer
 * already removed in an earlier word is gone, so it no longer counts).
 * This is the hot path — the validation DFS and the topo-order each call
 * the returned closure at every step.
 */
function exposedFn(tiles: Tile[]): (removed: Set<number>) => number[] {
  const present = new Set(tiles.map((t) => t.id))
  return (removed) =>
    tiles
      .filter(
        (t) =>
          !removed.has(t.id) &&
          COVERERS.get(t.id)!.every((c) => !present.has(c) || removed.has(c)),
      )
      .map((t) => t.id)
}

// ── Per-board time budget ──────────────────────────────────────────
// The iteration caps (word-sets × attempts) bound the COUNT of tries,
// but a single pathological word-set can make one strictValidate /
// reachableWords run for minutes (the DFS is exponential in the worst
// case). Without a wall-clock bound the script can appear to hang. So
// every board gets a deadline; the DFS checks it cheaply (every 8192
// nodes) and throws DeadlineError, which generateAnyBoard catches to give
// up on that board and move on.
class DeadlineError extends Error {}
type Deadline = { at: number; n: number }
function tick(d: Deadline): void {
  if ((++d.n & 8191) === 0 && Date.now() > d.at) throw new DeadlineError()
}

// ── Sequence-aware validation ──────────────────────────────────────
// A word is the ORDER tiles are picked; a tile may sit at position k only
// if exposed after the first k removals. Read the word off the SEQUENCE,
// never the multiset (anagrams share letters but differ in legal order).

// All 1..4-letter prefixes of the lexicon, memoized on the lexicon Set's
// identity (so it's built once per run, not per reachableWords call).
// reachableWords uses it to prune dead branches.
let prefixCacheKey: Set<string> | null = null
let prefixCache: Set<string> = new Set()
function lexiconPrefixes(lexicon: Set<string>): Set<string> {
  if (prefixCacheKey === lexicon) return prefixCache
  const p = new Set<string>()
  for (const w of lexicon) for (let k = 1; k < w.length; k++) p.add(w.slice(0, k))
  prefixCacheKey = lexicon
  prefixCache = p
  return p
}

/** All legal lexicon-words completable as a valid ordered selection. */
function reachableWords(tiles: Tile[], lexicon: Set<string>, deadline: Deadline): Set<string> {
  const byId = new Map(tiles.map((t) => [t.id, t]))
  const exposedAfter = exposedFn(tiles)
  const prefixes = lexiconPrefixes(lexicon)
  const found = new Set<string>()
  // dfs carries the accumulated letter-prefix so we can prune any branch
  // whose prefix can't extend to a real word (the Boggle-solver trick).
  // Random tile prefixes almost never spell word-prefixes, so this is what
  // keeps a letter-heavy board's search from exploding. No visited-set is
  // needed: every ordered tile-sequence is reached by exactly one path,
  // and `found` is a Set so a repeated word is a harmless no-op anyway.
  const dfs = (seq: number[], letters: string, removed: Set<number>): void => {
    tick(deadline)
    if (seq.length === 5) {
      if (lexicon.has(letters)) found.add(letters)
      return
    }
    for (const id of exposedAfter(removed)) {
      const next = letters + byId.get(id)!.letter
      if (next.length < 5 && !prefixes.has(next)) continue
      removed.add(id)
      dfs([...seq, id], next, removed)
      removed.delete(id)
    }
  }
  dfs([], '', new Set())
  return found
}

/** One legal ordered tile-sequence spelling `word`, or null. */
function findSequenceForWord(tiles: Tile[], word: string, deadline: Deadline): number[] | null {
  const byId = new Map(tiles.map((t) => [t.id, t]))
  const exposedAfter = exposedFn(tiles)
  let result: number[] | null = null
  const dfs = (seq: number[], removed: Set<number>): void => {
    if (result) return
    tick(deadline)
    if (seq.length === 5) {
      if (seq.map((i) => byId.get(i)!.letter).join('') === word) result = [...seq]
      return
    }
    for (const id of exposedAfter(removed)) {
      if (byId.get(id)!.letter !== word[seq.length]) continue
      removed.add(id)
      dfs([...seq, id], removed)
      removed.delete(id)
    }
  }
  dfs([], new Set())
  return result
}

/** Every reveal-respecting tile-sequence that spells `word`. */
function allSequencesForWord(tiles: Tile[], word: string, deadline: Deadline): number[][] {
  const byId = new Map(tiles.map((t) => [t.id, t]))
  const exposedAfter = exposedFn(tiles)
  const out: number[][] = []
  const dfs = (seq: number[], removed: Set<number>): void => {
    tick(deadline)
    if (seq.length === word.length) {
      if (seq.map((i) => byId.get(i)!.letter).join('') === word) out.push([...seq])
      return
    }
    for (const id of exposedAfter(removed)) {
      if (byId.get(id)!.letter !== word[seq.length]) continue
      removed.add(id)
      dfs([...seq, id], removed)
      removed.delete(id)
    }
  }
  dfs([], new Set())
  return out
}

/**
 * STRICT validity — the player can never get stuck. At each round the
 * ONLY completable lexicon-word must be Wi (no wrong-word fork), AND
 * *every* tile-sequence spelling Wi must leave a board that is itself
 * strictly valid for the remaining words. The second clause is the
 * subtle one: with duplicate letters a word can be spelled multiple
 * ways, and one spelling can consume a tile a later word needs — so ALL
 * completions must stay solvable. Memoized on the remaining-tile set.
 */
function strictValidate(
  tiles: Tile[],
  words: string[],
  lexicon: Set<string>,
  deadline: Deadline,
  memo: Map<string, boolean> = new Map(),
): boolean {
  if (words.length === 0) return tiles.length === 0
  const key =
    words.length + ':' + tiles.map((t) => t.id).sort((a, b) => a - b).join(',')
  const cached = memo.get(key)
  if (cached !== undefined) return cached

  let ok = true
  const reach = reachableWords(tiles, lexicon, deadline)
  if (reach.size !== 1 || !reach.has(words[0])) ok = false
  if (ok) {
    const seqs = allSequencesForWord(tiles, words[0], deadline)
    if (seqs.length === 0) ok = false
    for (const seq of seqs) {
      if (!ok) break
      const rm = new Set(seq)
      if (!strictValidate(tiles.filter((t) => !rm.has(t.id)), words.slice(1), lexicon, deadline, memo)) {
        ok = false
      }
    }
  }
  memo.set(key, ok)
  return ok
}

// ── Fixed geometry (z y x letter; letters are placeholders) ────────
// Positions + the covering DAG are CONSTANT across puzzles — only the
// letters vary. This is the prototype's reference layout: 30 tiles.
const REFERENCE_RAW = `
0 0 2 F
0 0 6 R
1 1 3 K
1 1 5 O
0 2 0 U
2 2 2 F
2 2 4 B
2 2 6 I
0 2 8 D
1 3 1 R
3 3 3 R
3 3 5 K
1 3 7 I
0 4 0 C
2 4 2 Y
2 4 6 D
0 4 8 E
1 5 1 R
3 5 3 L
3 5 5 B
1 5 7 C
0 6 0 A
2 6 2 N
2 6 4 I
2 6 6 P
0 6 8 L
1 7 3 F
1 7 5 O
0 8 2 A
0 8 6 I
`

const FIXED_POSITIONS: Pos[] = REFERENCE_RAW.trim()
  .split('\n')
  .map((line, id) => {
    const [z, y, x] = line.trim().split(/\s+/)
    return { id, z: +z, y: +y, x: +x }
  })

// Coverers per tile id, precomputed ONCE from the fixed geometry. The
// covering relation depends only on positions (never letters) and the
// geometry never changes across boards, so this O(n²) build happens a
// single time and exposedFn reuses it for every board and every DFS node.
const COVERERS: Map<number, number[]> = new Map(
  FIXED_POSITIONS.map((b) => [
    b.id,
    FIXED_POSITIONS.filter((a) => a.id !== b.id && covers(a, b)).map((a) => a.id),
  ]),
)

// ── Generator (reverse construction + brute-force assignment) ──────
function mulberry32(seed: number): () => number {
  let s = seed
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A random legal full removal order (topological wrt covering). */
function randomTopoOrder(positions: Pos[], rng: () => number): number[] {
  const tiles: Tile[] = positions.map((p) => ({ ...p, letter: '?' }))
  const exposedAfter = exposedFn(tiles)
  const order: number[] = []
  const removed = new Set<number>()
  while (order.length < tiles.length) {
    const exp = exposedAfter(removed)
    if (exp.length === 0) throw new Error('DAG has no exposed tile — bad geometry')
    const pick = exp[Math.floor(rng() * exp.length)]
    order.push(pick)
    removed.add(pick)
  }
  return order
}

function* permutations<T>(arr: T[]): Generator<T[]> {
  if (arr.length <= 1) {
    yield arr.slice()
    return
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const p of permutations(rest)) yield [arr[i], ...p]
  }
}

/** Assign `word`'s letters to `groupIds` so it's spellable in order. */
function assignWordToGroup(
  positions: Pos[],
  presentIds: Set<number>,
  groupIds: number[],
  word: string,
  baseLetters: Map<number, string>,
  deadline: Deadline,
): Map<number, string> | null {
  for (const perm of permutations(word.split(''))) {
    const trial = new Map(baseLetters)
    groupIds.forEach((id, k) => trial.set(id, perm[k]))
    const tiles: Tile[] = positions
      .filter((p) => presentIds.has(p.id))
      .map((p) => ({ ...p, letter: trial.get(p.id) ?? '?' }))
    if (findSequenceForWord(tiles, word, deadline)) return trial
  }
  return null
}

type GenResult = { tiles: Tile[]; words: string[]; attempts: number }

/** Build a valid board for six given words on the fixed geometry. */
function generateBoard(
  positions: Pos[],
  words: string[],
  lexicon: Set<string>,
  deadline: Deadline,
  opts: { maxAttempts?: number; seed?: number } = {},
): GenResult | null {
  const maxAttempts = opts.maxAttempts ?? 2000
  const rng = mulberry32(opts.seed ?? 12345)
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    tick(deadline)
    const order = randomTopoOrder(positions, rng)
    const groups: number[][] = []
    for (let i = 0; i < 6; i++) groups.push(order.slice(i * 5, i * 5 + 5))

    const letters = new Map<number, string>()
    const presentIds = new Set(positions.map((p) => p.id))
    let ok = true
    for (let i = 0; i < 6; i++) {
      const got = assignWordToGroup(positions, presentIds, groups[i], words[i], letters, deadline)
      if (!got) {
        ok = false
        break
      }
      for (const [k, v] of got) letters.set(k, v)
      for (const id of groups[i]) presentIds.delete(id)
    }
    if (!ok) continue

    const tiles: Tile[] = positions.map((p) => ({ ...p, letter: letters.get(p.id)! }))
    if (strictValidate(tiles, words, lexicon, deadline)) return { tiles, words, attempts: attempt }
  }
  return null
}

/**
 * Auto-pick six words and build a board, moving to a fresh six-word set
 * if one doesn't pan out within `perSetAttempts`. Bounded by a wall-clock
 * `deadlineMs`: if the whole search blows past it (a pathological word-set
 * whose validation is exponential), abort and return null so the caller
 * skips this board and tries the next seed instead of hanging.
 */
function generateAnyBoard(
  positions: Pos[],
  lexicon: Set<string>,
  opts: { seed?: number; maxWordSets?: number; perSetAttempts?: number; deadlineMs?: number } = {},
): (GenResult & { wordSetsTried: number }) | null {
  const rng = mulberry32(opts.seed ?? 1)
  const words = [...lexicon]
  const pick6 = () => {
    const s = new Set<string>()
    while (s.size < 6) s.add(words[Math.floor(rng() * words.length)])
    return [...s]
  }
  const maxWordSets = opts.maxWordSets ?? 40
  const deadline: Deadline = { at: Date.now() + (opts.deadlineMs ?? 30_000), n: 0 }
  try {
    for (let set = 1; set <= maxWordSets; set++) {
      const six = pick6()
      const g = generateBoard(positions, six, lexicon, deadline, {
        maxAttempts: opts.perSetAttempts ?? 1500,
        seed: ((opts.seed ?? 1) * 7919 + set) | 0,
      })
      if (g) return { ...g, wordSetsTried: set }
    }
  } catch (e) {
    if (!(e instanceof DeadlineError)) throw e
    // Time budget exhausted for this board — caller moves to the next.
  }
  return null
}

// ── Run ────────────────────────────────────────────────────────────
// One serialized board, the shape `stackdown:import` reads back.
type BoardLine = { tiles: Tile[]; words: string[]; wordlist: number }

/** Order-independent signature of a board's six words, for dedup. */
const wordSig = (words: string[]) => [...words].sort().join(',')

// Existing library (so we append, and skip word-sets already present).
const existing: BoardLine[] = existsSync(BOARDS_FILE)
  ? readFileSync(BOARDS_FILE, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as BoardLine)
  : []
const seen = new Set(existing.map((b) => wordSig(b.words)))

const safeTarget = DB_URL.replace(/:[^:@/]*@/, ':****@')
console.log(
  `Generating ${COUNT} board(s) (base seed ${BASE_SEED}); ` +
    `lexicon from ${safeTarget}; ${existing.length} already in the file.`,
)

// Load the lexicon: the StackDown standard set (wordlist 0) — common,
// clean, 5-letter american words (plurals included). MUST match
// stackdown._is_word's level-0 definition, or generated boards won't be
// solvable / fork-free at play time.
const raw = execFileSync(
  'psql',
  [
    '-X', // skip ~/.psqlrc — its echoed settings would leak in as junk "words"
    DB_URL,
    '-tAc',
    'select word from common.words where slur = 0 and crude = 0 and american and difficulty = 1 and len = 5',
  ],
  { encoding: 'utf8' },
)
const lexicon = new Set(
  raw.trim().split('\n').map((w) => w.trim().toUpperCase()).filter(Boolean),
)
if (lexicon.size === 0) {
  console.error('No words found — run `npm run words:import` first.')
  process.exit(1)
}
console.log(`Lexicon: ${lexicon.size} words`)

const fresh: BoardLine[] = []
for (let i = 0; i < COUNT; i++) {
  const g = generateAnyBoard(FIXED_POSITIONS, lexicon, {
    seed: BASE_SEED + i,
    deadlineMs: PER_BOARD_TIMEOUT_MS,
  })
  if (!g) {
    console.warn(
      `  board ${i + 1}/${COUNT}: gave up (word-set budget or ${PER_BOARD_TIMEOUT_MS}ms time budget exhausted)`,
    )
    continue
  }
  if (seen.has(wordSig(g.words))) {
    console.log(`  board ${i + 1}/${COUNT}: ${g.words.join(' ')} — duplicate word-set, skipped`)
    continue
  }
  seen.add(wordSig(g.words))
  fresh.push({ tiles: g.tiles, words: g.words, wordlist: 0 })
  console.log(
    `  board ${i + 1}/${COUNT}: ${g.words.join(' ')} ` +
      `(${g.attempts} attempt(s), ${g.wordSetsTried} word-set(s))`,
  )
}

if (fresh.length === 0) {
  console.log('No new boards to add (all duplicates or generation gave up).')
  process.exit(0)
}

// One JSON object per line — easy to append to and to read back.
appendFileSync(BOARDS_FILE, fresh.map((b) => JSON.stringify(b)).join('\n') + '\n')
console.log(
  `Appended ${fresh.length} board(s) → ${BOARDS_FILE} ` +
    `(${existing.length + fresh.length} total). Run \`npm run stackdown:import\` to load them.`,
)
