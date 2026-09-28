// cs-unmet

import type { Card } from './cards'

/** How many cards a claim is. Three, always — that is what a set is. */
export const CLAIM_SIZE = 3

/**
 * The picks, minus anything that has left the board.
 *
 * Derived every render rather than corrected in an effect, which is what makes
 * the contention case safe: a rival can claim a card out from under a
 * half-made pick, and the moment the board arrives without it, it is simply
 * not picked any more. Its keyboard letter is free again too, because the
 * letter addresses the slot and the picks hold card codes.
 *
 * The alternative — trusting stored state and repairing it when the board
 * changes — leaves a window where the UI shows a card picked that is no
 * longer there, and a claim fired in that window is rejected by the server with
 * `cards-gone`.
 */
export function livePicks(
  picked: readonly Card[],
  board: readonly Card[],
): Card[] {
  return picked.filter((card) => board.includes(card))
}

/**
 * Add a card to the picks, or take it back out if it is already there.
 *
 * Both a click and a typed letter land here, so the two input routes cannot
 * drift apart: typing `B` twice un-picks, exactly as clicking twice does.
 * Picking past the third card is refused — the third one completes a claim
 * and the caller submits it.
 */
export function toggleCard(picked: readonly Card[], card: Card): Card[] {
  if (picked.includes(card)) return picked.filter((c) => c !== card)
  if (picked.length >= CLAIM_SIZE) return [...picked]
  return [...picked, card]
}
