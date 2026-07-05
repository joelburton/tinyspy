import type { Cell, Clue } from './types.ts'

/**
 * The stable dedup payload for a puzzle — the solving content only: the
 * solution grid (block shape baked in via nulls), the boolean given-mask, and
 * normalized clue text. Title / author / notes and the presentation flags
 * (circled, shaded) are intentionally excluded, so reprints with cosmetic
 * differences collide.
 *
 * This is the PURE part (the JSON string). The actual SHA-256 is applied by
 * the caller — `node:crypto` in the import CLI, `crypto.subtle` in the NYT
 * edge function — so the one definition backs both runtimes and their hashes
 * match. Uses `.ts` import specifiers so it resolves under Deno too.
 */
export function contentHashPayload(
  cells: Cell[][],
  clues: { across: Clue[]; down: Clue[] },
  solution: (string[] | null)[][],
): string {
  const givens = cells.map((row) => row.map((c) => (c.kind === 'cell' ? !!c.given : false)))
  const normClues = (cs: Clue[]) =>
    cs.map((c) => [c.number, c.text.trim().normalize('NFC')] as const)
  return JSON.stringify({
    solution,
    givens,
    across: normClues(clues.across),
    down: normClues(clues.down),
  })
}
