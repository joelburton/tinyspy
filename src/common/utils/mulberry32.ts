// cs-blessed-utils

/**
 * mulberry32 — the app's **seedable** random-number generator. Reach for it
 * anywhere a sequence has to be reproducible; `Math.random()` everywhere else.
 *
 * The same seed always yields the same sequence. Returns a function producing
 * floats in `[0, 1)` — the `Math.random` shape, so it drops into anything
 * taking a `() => number`.
 *
 * **Seedability is the whole reason it exists**, not speed and not quality: it
 * is a JS function where `Math.random()` is native, and its 32 bits of state
 * are fewer than V8's. But `Math.random()` cannot be seeded at all — the spec
 * leaves it implementation-defined and offers no way in — so it is simply
 * unusable where the sequence must repeat. Three kinds of caller need that:
 *
 *   - **Tests.** Put the seed in the test name and a failure reproduces
 *     verbatim (scrabble's `suggest.test.ts`).
 *   - **Boards generated from a stored seed** — boggle's `rollBoard`, the
 *     stackdown board script. The seed is the board, so the roll must repeat.
 *   - **Idempotent server work**, which is the subtle one and has nothing to do
 *     with randomness. Scrabble's AI seeds from `(version, seat)`, so every
 *     client racing to drive the AI computes the SAME move and a duplicate is
 *     harmless (`scrabble-ai-move/index.ts`). Under `Math.random()` two drivers
 *     would pick two different moves for one turn.
 *
 * **NOT cryptographic** — never use it for a token, a secret or anything an
 * adversary should not predict; `crypto.getRandomValues` is that.
 *
 * It says nothing either way about fairness. A seeded board is fair because the
 * SEED is server-chosen (CLAUDE.md's trust table), not because of anything
 * here.
 *
 * The per-game removability invariant is why this is shared rather than
 * imported from whichever game wrote it first — one game may not import
 * another's code (docs/code-conventions.md → Shared vs game-specific).
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
