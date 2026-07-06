import type { Cell, Clue } from './types.ts'

/**
 * The stable dedup payload for a puzzle — the solving content only: the
 * solution grid (block shape baked in via nulls), the boolean given-mask, and
 * normalized clue text. Title / author / notes and the presentation flags
 * (circled, shaded) are intentionally excluded, so reprints with cosmetic
 * differences collide.
 *
 * This is the PURE part (the JSON string). The actual SHA-256 is applied by
 * the caller: the CLI import (`node:crypto`) is the only hasher today, used to
 * dedup re-imports into `crosswords.puzzles`. The NYT edge function does NOT
 * hash — it creates a self-contained inline game (no `puzzles` row to dedup),
 * so `content_hash` never arises on that path. Kept runtime-agnostic (`.ts`
 * import specifiers resolve under Deno too) in case a future consumer needs it.
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
