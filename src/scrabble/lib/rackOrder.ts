// cs-unmet

import type { GMoveSlots } from '../types'

/**
 * The rack's display order after a draw: the tiles that remain keep their
 * order, closed up on the left, and the drawn ones go on the right — so it is
 * obvious which are new. `myMove` names the OLD slots that left (played or
 * swapped); the server rebuilds the rack as the remaining tiles in slot order
 * followed by the drawn ones, so the new slots past the remaining count are
 * the drawn tiles. Any other change — a first load, a teammate's move on
 * coop's one rack, a length that does not add up — starts from slot order.
 */
export function makeNextRackOrder(
  prevOrder: readonly number[],
  myMove: GMoveSlots | null,
  newLen: number,
): number[] {
  const identity = Array.from({ length: newLen }, (_, i) => i)
  if (myMove === null) return identity
  const remainingAsc: number[] = []
  for (let i = 0; i < myMove.oldLen;
       i++) if (!myMove.removed.has(i)) remainingAsc.push(i)
  const oldToNew = new Map(remainingAsc.map((oldIdx, k) => [oldIdx, k]))
  const remaining =
    prevOrder
      .filter((i) => oldToNew.has(i))
      .map((i) => oldToNew.get(i)!)
  const drawn: number[] = []
  for (let i = remainingAsc.length; i < newLen; i++) drawn.push(i)
  const result = [...remaining, ...drawn]
  return result.length === newLen ? result : identity
}
