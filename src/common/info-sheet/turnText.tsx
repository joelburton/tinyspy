// cs-blessed-feedback

import { Dot } from '../members/Dot'
import type { Actor } from '../members/member'

/**
 * "Waiting for ● moth…" — the whose-turn sentence, as a node.
 *
 * One source for two readers that must never word it differently: the info
 * column's `<TurnStatusLine>` beside the board, and the whose-turn feedback
 * message (`FeedbackMessage.waiting`) under it. The mention sits
 * mid-sentence on purpose (Joel, 2026-09-12), so this builds the node itself
 * rather than leaning on a feedback message's leading actor.
 *
 * `current` is optional only because a roster lookup returns `undefined` by
 * type; a PlayArea never mounts before its roster has loaded and a player
 * cannot be added to a game, so the fallback is unreachable in practice.
 * Never the possessive "moth's turn" — usernames are not apostrophized.
 */
export function waitingForText(current: Actor | undefined) {
  return (
    <>
      Waiting for <Dot color={current?.color} /> {current?.username ?? 'a player'}…
    </>
  )
}
