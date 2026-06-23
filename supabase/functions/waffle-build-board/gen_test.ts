/**
 * `deno test supabase/functions/waffle-build-board/gen_test.ts`
 *
 * Covers `minSwaps` — the exact max-cycle par calculation. It's the one
 * subtle algorithm in the generator (a greedy version over-counted par
 * for duplicate-letter boards — see the regression case below), so it
 * keeps automated coverage now that it lives in the edge function
 * rather than under Vitest. Dependency-free (no std import) so it runs
 * offline.
 */

import { assembleSolution, minSwaps } from './gen.ts'

function eq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`)
  }
}

Deno.test('minSwaps: 0 for an already-solved board', () => {
  const s = 'abcdef.g.hijklmn.o.pqrstu'
  eq(minSwaps(s, s), 0, 'solved')
})

Deno.test('minSwaps: counts a single transposition', () => {
  eq(minSwaps('ba', 'ab'), 1, 'one swap')
})

Deno.test('minSwaps: solves a 3-cycle in 2 swaps', () => {
  eq(minSwaps('bca', 'abc'), 2, '3-cycle')
})

Deno.test('minSwaps: handles duplicate letters optimally', () => {
  eq(minSwaps('aabb', 'bbaa'), 2, 'two 2-cycles')
  eq(minSwaps('aab', 'aba'), 1, 'one swap')
  // 'badc' → 'abcd' is two disjoint transpositions a greedy scan would
  // merge into one long cycle and over-count.
  eq(minSwaps('badc', 'abcd'), 2, 'maximises cycles')
})

Deno.test('minSwaps: ignores holes on a full 25-char board', () => {
  const sol = 'abcdef.g.hijklmn.o.pqrstu'
  const scr = 'bacdef.g.hijklmn.o.pqrstu' // cells 0,1 swapped
  eq(minSwaps(scr, sol), 1, 'one transposition, holes untouched')
})

Deno.test('minSwaps: par-overcount regression (real board solved in 6)', () => {
  // The board that exposed the greedy over-count: stored par was 10,
  // the true minimum is 6.
  const scramble = 'rpekse.v.ciruyse.n.esassr'
  const solution = 'reekse.v.icressu.n.sraspy'
  eq(minSwaps(scramble, solution), 6, 'true minimum is 6')
})

Deno.test('minSwaps: never exceeds an explicit swap sequence', () => {
  const sol = 'abcdef.g.hijklmn.o.pqrstu'
  const swaps: [number, number][] = [
    [0, 2],
    [1, 9],
    [3, 14],
    [0, 19],
    [5, 22],
  ]
  const arr = sol.split('')
  for (const [i, j] of swaps) [arr[i], arr[j]] = [arr[j], arr[i]]
  const m = minSwaps(arr.join(''), sol)
  if (m > swaps.length) {
    throw new Error(`minSwaps ${m} exceeded the ${swaps.length}-swap sequence`)
  }
})

Deno.test('assembleSolution: places 6 words and keeps holes', () => {
  const words = ['abcde', 'ijklm', 'qrstu', 'afinq', 'cgkos', 'ehmpu']
  eq(assembleSolution(words), 'abcdef.g.hijklmn.o.pqrstu', 'round-trips')
})
