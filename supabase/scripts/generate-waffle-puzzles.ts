#!/usr/bin/env -S npx tsx
/**
 * Generate the Waffle (SyrupSwap) puzzle library and write it to
 * `supabase/data/waffle-puzzles.tsv.gz` (committed). The game has no
 * external puzzle corpus, so we make our own; `waffle:import` loads
 * the committed TSV into `waffle.puzzles`.
 *
 *   npm run waffle:generate [perTier]      (default 100)
 *
 * Produces `perTier` puzzles at each recognizability band 1–6
 * (universal … expert) — every band, so the server can serve any
 * difficulty even though the setup UI offers a subset. A tier-N
 * puzzle's HARDEST word is exactly band N — so a band-3 puzzle
 * genuinely *uses* a band-3 word, not merely allows one (and never a
 * harder word). See tierGenerator.
 *
 * Output columns (tab-separated, gzipped): solution, scramble,
 * par_swaps, difficulty, title. `difficulty` is the band (1–5); `title`
 * is the band's label (the game-listing label). Boards are 25-char
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

// Every recognizability band (1–6), with its game-listing label. We
// generate ALL bands so the server can accept any difficulty; the setup
// dialog chooses which to OFFER (today 1–5 — see DIFFICULTY_OPTIONS in
// src/waffle/lib/setup.ts), and can add band 6 without regenerating.
const TIERS: ReadonlyArray<{ band: number; label: string }> = [
  { band: 1, label: 'Universal' },
  { band: 2, label: 'Common' },
  { band: 3, label: 'Familiar' },
  { band: 4, label: 'Uncommon' },
  { band: 5, label: 'Obscure' },
  { band: 6, label: 'Expert' },
]
const PER_TIER = Number(process.argv[2] ?? 100)

function main() {
  const rows = loadWordRows(WORDS_PATH)
  const out: string[] = []

  for (const { band, label } of TIERS) {
    const gen = tierGenerator(rows, band)
    let made = 0
    for (let i = 0; i < PER_TIER; i++) {
      const p = gen.next()
      if (!p) break
      out.push(`${p.solution}\t${p.scramble}\t${p.par}\t${band}\t${label}`)
      made++
    }
    console.log(
      `band ${band} (${label}): ${gen.candidateCount} candidate words → ${made}/${PER_TIER} puzzles`,
    )
  }

  writeFileSync(OUT_PATH, gzipSync(out.join('\n') + '\n'))
  console.log(`Wrote ${out.length} puzzles to ${OUT_PATH}`)
}

main()
