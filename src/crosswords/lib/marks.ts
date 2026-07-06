import type { MarkType } from './types'

/**
 * Cycle a cryptic edge mark through `none → break → hyphen → none`.
 * Returns the next state; `null` means clear the mark. Ported verbatim
 * from crossplay's `PuzzleView.nextMarkState`. Pure — the `|` / `_`
 * keyboard handler calls this to decide the new mark, then persists it
 * via the `set_mark` RPC.
 */
export function nextMarkState(current: MarkType | undefined): MarkType | null {
  if (current === undefined) return 'break'
  if (current === 'break') return 'hyphen'
  return null
}
