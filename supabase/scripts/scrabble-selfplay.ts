#!/usr/bin/env -S npx tsx
/**
 * scrabble AI self-play harness — the measurement CLI behind the strength
 * ladder (docs/scrabble-ai-strength.md).
 *
 * It self-plays coop scrabble (one shared rack, maximise total score) with the
 * pure engine (`src/scrabble/lib/policy.ts`) over many PAIRED bag seeds, so we
 * can see how each strength knob actually moves the score. "Paired" = every
 * level plays the identical set of bag shuffles, and levels are compared by
 * per-seed *differences* — common random numbers cancel the huge tile-luck
 * variance, so a modest N resolves real effects.
 *
 * The dictionary is loaded straight from `common.words` (the exact word
 * universe `play_word` accepts: len 2..15, american OR british), so the harness
 * plays by the same rules as the live game. Needs psql on PATH and a populated
 * local common.words (run `npm run words:import` first).
 *
 * Usage:
 *   npm run scrabble:selfplay -- --level best --games 200
 *   npm run scrabble:selfplay -- --sweep --games 200          # all 5 levels, paired
 *   npm run scrabble:selfplay -- --sweep --games 200 --offset 1000   # a fresh seed block
 *
 * Connection: SUPABASE_DB_URL (defaults to the local stack).
 */

import { execFileSync } from 'node:child_process'
import { buildTrie, type Trie } from '../../src/common/lib/game/trie.ts'
import type { Bands } from '../../src/scrabble/lib/suggest.ts'
import {
  playSelfGame, LEVELS, LEVEL_NAMES, type GameResult, type LevelName,
} from '../../src/scrabble/lib/policy.ts'

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

// The game's legal dictionary is the FULL word set (bands 6/6). Strength comes
// from the per-level `vocabCap` knob, not from changing the game's rules, so
// every level plays the same board legality.
const FULL_BANDS: Bands = { dict2: 6, dict3plus: 6 }

// ── Dictionary ───────────────────────────────────────────────────────────────

/** Build the rated trie from common.words — play_word's exact universe. */
function loadRatedTrie(): Trie {
  const query = `
    select difficulty, word
    from common.words
    where len between 2 and 15 and (american or british)
    order by difficulty, word
  `
  const raw = execFileSync('psql', ['-X', '-d', DB_URL, '-tAF', '\t', '-c', query], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  })
  const words: string[] = []
  const ratings: number[] = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    const [d, word] = line.split('\t')
    words.push(word)
    ratings.push(Number(d))
  }
  console.log(`loaded ${words.length} words from common.words`)
  return buildTrie(words, ratings)
}

// ── Stats ────────────────────────────────────────────────────────────────────

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const stddev = (xs: number[]) => {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1))
}

type LevelStats = {
  level: LevelName
  results: GameResult[]
  scoreMean: number
  scoreMedian: number
  scoreSd: number
  bingosPerGame: number
  exchangesPerGame: number
  turnsPerGame: number
  tilesLeftPerGame: number
}

function summarize(level: LevelName, results: GameResult[]): LevelStats {
  const scores = results.map((r) => r.score)
  return {
    level,
    results,
    scoreMean: mean(scores),
    scoreMedian: median(scores),
    scoreSd: stddev(scores),
    bingosPerGame: mean(results.map((r) => r.bingos)),
    exchangesPerGame: mean(results.map((r) => r.exchanges)),
    turnsPerGame: mean(results.map((r) => r.turns)),
    tilesLeftPerGame: mean(results.map((r) => r.tilesLeft)),
  }
}

/** Play `games` seeds (offset + 1 .. offset + games) at one level. */
function runLevel(trie: Trie, level: LevelName, games: number, offset: number): GameResult[] {
  const out: GameResult[] = []
  for (let i = 1; i <= games; i++) out.push(playSelfGame(trie, FULL_BANDS, LEVELS[level], offset + i))
  return out
}

const pad = (s: string | number, n: number) => String(s).padStart(n)

function printLevel(s: LevelStats) {
  console.log(
    `\n${s.level}  (${s.results.length} games)\n` +
      `  score   mean ${s.scoreMean.toFixed(1)}  median ${s.scoreMedian.toFixed(0)}  sd ${s.scoreSd.toFixed(1)}\n` +
      `  bingos/game ${s.bingosPerGame.toFixed(2)}   exchanges/game ${s.exchangesPerGame.toFixed(2)}` +
      `   turns/game ${s.turnsPerGame.toFixed(1)}   tiles left ${s.tilesLeftPerGame.toFixed(1)}`,
  )
}

/** The sweep table: every level, plus the paired-difference vs `best` (the
 *  common-random-numbers comparison — same seeds, so we can subtract per game). */
function printSweep(all: LevelStats[]) {
  const best = all.find((s) => s.level === 'best')!
  console.log(
    `\n${pad('level', 13)} ${pad('mean', 7)} ${pad('median', 7)} ${pad('sd', 6)} ` +
      `${pad('bingo', 6)} ${pad('exch', 5)} ${pad('turns', 6)} ${pad('%best', 6)} ${pad('Δbest', 7)} ${pad('sdΔ', 6)}`,
  )
  for (const s of all) {
    // Paired difference vs best, per seed (arrays are seed-aligned).
    const diffs = s.results.map((r, i) => r.score - best.results[i].score)
    const dMean = mean(diffs)
    const dSd = stddev(diffs)
    const pctBest = (s.scoreMean / best.scoreMean) * 100
    console.log(
      `${pad(s.level, 13)} ${pad(s.scoreMean.toFixed(1), 7)} ${pad(s.scoreMedian.toFixed(0), 7)} ` +
        `${pad(s.scoreSd.toFixed(1), 6)} ${pad(s.bingosPerGame.toFixed(2), 6)} ${pad(s.exchangesPerGame.toFixed(2), 5)} ` +
        `${pad(s.turnsPerGame.toFixed(1), 6)} ${pad(pctBest.toFixed(0), 6)} ${pad(dMean.toFixed(1), 7)} ${pad(dSd.toFixed(1), 6)}`,
    )
  }
  console.log(
    '\nΔbest = mean(this − best) on the SAME seeds (paired); sdΔ is its spread.\n' +
      'A |Δbest| several × larger than sdΔ/√N is a resolved difference.',
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2)
  const flag = (name: string) => argv.includes(name)
  const opt = (name: string, def: string) => {
    const i = argv.indexOf(name)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def
  }

  const games = Number(opt('--games', '50'))
  const offset = Number(opt('--offset', '0'))
  const sweep = flag('--sweep')
  const level = opt('--level', 'best') as LevelName

  if (!sweep && !LEVEL_NAMES.includes(level)) {
    console.error(`unknown level "${level}" — one of: ${LEVEL_NAMES.join(', ')} (or --sweep)`)
    process.exit(1)
  }

  const t0 = Date.now()
  const trie = loadRatedTrie()

  if (sweep) {
    console.log(`\nsweep: ${games} paired games/level, seeds ${offset + 1}..${offset + games}`)
    const all = LEVEL_NAMES.map((lv) => summarize(lv, runLevel(trie, lv, games, offset)))
    all.forEach(printLevel)
    printSweep(all)
  } else {
    console.log(`\n${level}: ${games} games, seeds ${offset + 1}..${offset + games}`)
    printLevel(summarize(level, runLevel(trie, level, games, offset)))
  }
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`)
}

main()
