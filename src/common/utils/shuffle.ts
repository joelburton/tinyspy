// cs-blessed-utils

/**
 * Put the items in a random order. You get a NEW array back and the one you
 * passed is untouched, so a shuffled view of a board's tiles can sit beside
 * the board's own order without disturbing it.
 *
 *   const wheel = shuffle(letters)                  // a fresh order, once
 *   const bag = shuffle(tiles, mulberry32(seed))    // the same order every time
 *
 * `rng` is any function returning a float in `[0, 1)` — the `Math.random`
 * shape. It defaults to `Math.random` because most callers just want a
 * different order each time they ask; pass a seeded generator wherever the
 * order has to repeat, which is `mulberry32`'s whole subject and argued in its
 * docstring rather than restated here.
 *
 * Fisher–Yates: walk from the last slot down, and swap each slot with one
 * drawn from the slots at or before it. Drawing from the whole array instead
 * would be a one-character change and quietly wrong — it makes some orders
 * likelier than others.
 *
 * No imports, deliberately, so the edge functions can load it by relative path
 * the way they load `mulberry32` (this folder's `doc.md` states that rule).
 */
export function shuffle<T>(
  items: readonly T[],
  rng: () => number = Math.random,
): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
