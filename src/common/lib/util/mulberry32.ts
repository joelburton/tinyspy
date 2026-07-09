/**
 * mulberry32 — a tiny, fast, seedable 32-bit PRNG.
 *
 * Deterministic from its seed: the same seed always yields the same sequence,
 * which is exactly what seeded tests want — put the seed in the test name and
 * a failure reproduces verbatim. Returns a function producing floats in
 * `[0, 1)`, the `Math.random` shape.
 *
 * NOT cryptographic and NOT for gameplay fairness (board generation seeds live
 * server-side); this is the test/tooling generator. Extracted here because
 * three sites had hand-rolled it independently (boggle's board generator, the
 * stackdown board script, scrabble's parity suite) and the per-game
 * removability invariant forbids importing one game's copy from another —
 * docs/scrabble-ai-fixes.md §6. Scrabble's parity test consumes it now;
 * migrating boggle + the stackdown script onto it is nice-to-have.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
