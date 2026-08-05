/**
 * Unit tests for the pure board core. Run with:
 *   deno test supabase/functions/letterboxed-build-board/board_test.ts
 *
 * No database: every function under test is a function of its arguments, and
 * the randomness is injected, so a seeded generator makes the partition tests
 * deterministic.
 */

import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1'
import {
  BOARD_SIZE,
  buildPlayableWords,
  isOneWordSolvable,
  isPlayable,
  letterMask,
  partitionSides,
  shuffle,
  sideOf,
} from './board.ts'

/** A deterministic [0,1) generator, so a failing test fails the same way twice. */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

// ── letterMask ──────────────────────────────────────────────────────────────
// The bit convention has to match common.word_letter_mask, or the
// candidate_words subset test compares incompatible layouts and silently
// returns the wrong words.
Deno.test('letterMask: bit 0 is "a"', () => {
  assertEquals(letterMask('a'), 1)
  assertEquals(letterMask('b'), 2)
  assertEquals(letterMask('ab'), 3)
})

Deno.test('letterMask: repeats collapse — it is a SET', () => {
  assertEquals(letterMask('aaa'), letterMask('a'))
})

// ── partitionSides ──────────────────────────────────────────────────────────
Deno.test('partitionSides: returns all twelve letters, regrouped', () => {
  const sides = partitionSides('abcdefghijkl', ['adgjbehk', 'kcfil'], seededRandom(1))
  assert(sides !== null)
  assertEquals(sides!.length, BOARD_SIZE)
  assertEquals([...sides!].sort().join(''), 'abcdefghijkl')
})

Deno.test('partitionSides: no two ADJACENT letters of a seed word share a side', () => {
  const words = ['adgjbehk', 'kcfil']
  for (let seed = 1; seed <= 25; seed++) {
    const sides = partitionSides('abcdefghijkl', words, seededRandom(seed))
    assert(sides !== null, `seed ${seed} failed to partition`)
    const side = sideOf(sides!)
    for (const w of words) {
      for (let i = 1; i < w.length; i++) {
        assertNotEquals(
          side.get(w[i - 1]),
          side.get(w[i]),
          `"${w}" puts ${w[i - 1]}${w[i]} on one side (seed ${seed}, sides ${sides})`,
        )
      }
    }
  }
})

Deno.test('partitionSides: four sides of exactly three', () => {
  const sides = partitionSides('abcdefghijkl', ['adgjbehk', 'kcfil'], seededRandom(7))!
  const counts = new Map<number, number>()
  for (const s of sideOf(sides).values()) counts.set(s, (counts.get(s) ?? 0) + 1)
  assertEquals([...counts.values()].sort(), [3, 3, 3, 3])
})

Deno.test('partitionSides: re-rolls to a DIFFERENT board — one seed, many puzzles', () => {
  const seen = new Set<string>()
  for (let seed = 1; seed <= 20; seed++) {
    seen.add(partitionSides('abcdefghijkl', ['adgjbehk', 'kcfil'], seededRandom(seed))!)
  }
  assert(seen.size > 1, 'every roll produced the same partition')
})

Deno.test('partitionSides: returns null when no partition exists', () => {
  // A side holds three letters, so an unplaceable letter is one with no two
  // non-neighbours to sit beside. Here 'a' alternates with every other letter,
  // making it adjacent to all eleven — it would have to sit alone, and sides
  // are not allowed to be short. This is the ~0.2% case the seed importer
  // filters out before storing a row, which is why the builder can treat a
  // null as "impossible, log it" rather than an expected outcome.
  const impossible = partitionSides(
    'abcdefghijkl',
    ['abacadaeafagahaiajakal'],
    seededRandom(3),
  )
  assertEquals(impossible, null)
})

// ── isPlayable ──────────────────────────────────────────────────────────────
// Board: abc | def | ghi | jkl
const SIDES = 'abcdefghijkl'

Deno.test('isPlayable: accepts a word that crosses the box every step', () => {
  assert(isPlayable('adg', sideOf(SIDES)))
})

Deno.test('isPlayable: rejects two consecutive letters from one side', () => {
  // 'a' and 'b' are both on side 0.
  assertEquals(isPlayable('abd', sideOf(SIDES)), false)
})

Deno.test('isPlayable: rejects a doubled letter — same side, trivially', () => {
  assertEquals(isPlayable('add', sideOf(SIDES)), false)
})

Deno.test('isPlayable: rejects a letter that is not on the board', () => {
  assertEquals(isPlayable('adz', sideOf(SIDES)), false)
})

Deno.test('isPlayable: rejects words below the three-letter floor', () => {
  assertEquals(isPlayable('ad', sideOf(SIDES)), false)
})

// ── buildPlayableWords ──────────────────────────────────────────────────────
Deno.test('buildPlayableWords: keeps only what the partition permits', () => {
  const candidates = ['adg', 'abd', 'gjb', 'add', 'kcfil']
  assertEquals(buildPlayableWords(candidates, SIDES), ['adg', 'gjb', 'kcfil'])
})

// ── isOneWordSolvable ───────────────────────────────────────────────────────
Deno.test('isOneWordSolvable: true when a word uses all twelve letters', () => {
  assert(isOneWordSolvable(['adg', 'adgjbehkcfil']))
})

Deno.test('isOneWordSolvable: false for an ordinary board', () => {
  assertEquals(isOneWordSolvable(['adg', 'gjb', 'kcfil']), false)
})

// ── shuffle ─────────────────────────────────────────────────────────────────
Deno.test('shuffle: permutes without mutating the input', () => {
  const input = [1, 2, 3, 4, 5]
  const out = shuffle(input, seededRandom(9))
  assertEquals(input, [1, 2, 3, 4, 5])
  assertEquals([...out].sort(), [1, 2, 3, 4, 5])
})
