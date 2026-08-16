import type { Card } from './cards'

/** How many cards a claim is. Three, always — that is what a set is. */
export const CLAIM_SIZE = 3

/**
 * The selection, minus anything that has left the board.
 *
 * Derived every render rather than corrected in an effect, which is what makes
 * the contention case safe: a rival can claim a card out from under a
 * half-made selection, and the moment the board arrives without it, it is
 * simply not selected any more. Its keyboard letter is free again too, because
 * the letter addresses the slot and the selection holds card codes.
 *
 * The alternative — trusting stored state and repairing it when the board
 * changes — leaves a window where the UI shows a card selected that is no
 * longer there, and a claim fired in that window is rejected by the server with
 * `cards-gone`.
 */
export function liveSelection(
  selected: readonly Card[],
  board: readonly Card[],
): Card[] {
  return selected.filter((card) => board.includes(card))
}

/**
 * Add a card to the selection, or take it back out if it is already there.
 *
 * Both a click and a typed letter land here, so the two input routes cannot
 * drift apart: typing `B` twice deselects, exactly as clicking twice does.
 * Selecting past the third card is refused — the third one completes a claim
 * and the caller submits it.
 */
export function toggleCard(selected: readonly Card[], card: Card): Card[] {
  if (selected.includes(card)) return selected.filter((c) => c !== card)
  if (selected.length >= CLAIM_SIZE) return [...selected]
  return [...selected, card]
}
