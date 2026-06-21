#!/usr/bin/env -S npx tsx
/**
 * Preview tool (NOT part of the build): render a few Waffle puzzles
 * per difficulty tier in the waffle shape — the scramble (what a
 * player starts with) beside the solution — so we can eyeball how the
 * puzzles look before/while building the game.
 *
 *   npm run waffle:sample [perTier]      → writes waffle-samples.txt
 *
 * Shares the fill logic with the real generator via lib/waffleGen.
 */

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boardWords, GRID } from '../../src/waffle/lib/waffle'
import {
  loadWordRows,
  tierGenerator,
  type WafflePuzzle,
} from './lib/waffleGen'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORDS_PATH = resolve(__dirname, '../data/words.tsv.gz')
const OUT_PATH = resolve(__dirname, '../../waffle-samples.txt')

const TIERS = [35, 50, 60]
const PER_TIER = Number(process.argv[2] ?? 4)

/** The 5 grid lines for a board, holes as spaces, letters spaced out. */
function gridLines(board: string): string[] {
  const lines: string[] = []
  for (let r = 0; r < GRID; r++) {
    const cells: string[] = []
    for (let col = 0; col < GRID; col++) {
      const ch = board[r * GRID + col]
      cells.push(ch === '.' ? ' ' : ch.toUpperCase())
    }
    lines.push(cells.join(' '))
  }
  return lines
}

function render(p: WafflePuzzle, n: number): string {
  const [a0, a2, a4, d0, d2, d4] = boardWords(p.solution)
  const scr = gridLines(p.scramble)
  const sol = gridLines(p.solution)
  const gap = '      '
  const lines = [
    `── Puzzle ${n}   ·   Difficulty ${p.tier}   ·   par ${p.par} ──`,
    `  scramble${gap}   solution`,
  ]
  for (let i = 0; i < scr.length; i++) {
    lines.push(`  ${scr[i]}${gap}   ${sol[i]}`)
  }
  lines.push(`  across:  ${a0} · ${a2} · ${a4}`)
  lines.push(`  down:    ${d0} · ${d2} · ${d4}`)
  lines.push('')
  return lines.join('\n')
}

function main() {
  const rows = loadWordRows(WORDS_PATH)
  const blocks: string[] = [
    'Waffle (SyrupSwap) puzzle preview',
    'Holes shown as blanks. "scramble" = what the player starts with;',
    'solve it by swapping tiles to reach "solution".',
    '',
  ]
  let n = 0
  for (const tier of TIERS) {
    const gen = tierGenerator(rows, tier)
    let made = 0
    for (let i = 0; i < PER_TIER; i++) {
      const p = gen.next()
      if (!p) break
      blocks.push(render(p, ++n))
      made++
    }
    console.log(`tier ${tier}: ${gen.candidateCount} candidates → ${made} puzzles`)
  }
  writeFileSync(OUT_PATH, blocks.join('\n'))
  console.log(`\nWrote ${n} puzzles to ${OUT_PATH}`)
}

main()
