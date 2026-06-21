#!/usr/bin/env -S npx tsx
/**
 * Generate the Waffle (SyrupSwap) puzzle library and write it to
 * `supabase/data/waffle-puzzles.tsv.gz` (committed). The game has no
 * external puzzle corpus, so we make our own; `waffle:import` loads
 * the committed TSV into `waffle.puzzles`.
 *
 *   npm run waffle:generate [perTier]      (default 100)
 *
 * Produces `perTier` puzzles at each discrete difficulty tier
 * (35 everyday, 50 common, 60 solid). A tier-N puzzle's HARDEST word
 * is exactly N — so a tier-50 puzzle genuinely *uses* a 50-level word,
 * not merely allows one (and never a harder word). See tierGenerator.
 *
 * Output columns (tab-separated, gzipped): solution, scramble,
 * par_swaps, difficulty, title. `difficulty` is the tier; `title` is
 * "Difficulty N" (the game-listing label). Boards are 25-char
 * strings, holes = '.'.
 *
 * No DB needed — reads the committed word list directly. Output is
 * non-deterministic (random sampling); regenerate + review + commit
 * when you want a fresh/larger set.
 */

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { loadWordRows, tierGenerator } from './lib/waffleGen'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORDS_PATH = resolve(__dirname, '../data/words.tsv.gz')
const OUT_PATH = resolve(__dirname, '../data/waffle-puzzles.tsv.gz')

const TIERS = [35, 50, 60]
const PER_TIER = Number(process.argv[2] ?? 100)

function main() {
  const rows = loadWordRows(WORDS_PATH)
  const out: string[] = []

  for (const tier of TIERS) {
    const gen = tierGenerator(rows, tier)
    let made = 0
    for (let i = 0; i < PER_TIER; i++) {
      const p = gen.next()
      if (!p) break
      out.push(`${p.solution}\t${p.scramble}\t${p.par}\t${tier}\tDifficulty ${tier}`)
      made++
    }
    console.log(
      `tier ${tier}: ${gen.candidateCount} candidate words → ${made}/${PER_TIER} puzzles`,
    )
  }

  writeFileSync(OUT_PATH, gzipSync(out.join('\n') + '\n'))
  console.log(`Wrote ${out.length} puzzles to ${OUT_PATH}`)
}

main()
