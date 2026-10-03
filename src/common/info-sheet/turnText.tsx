// cs-blessed-feedback

import { DotActor } from '../members/ActorMention'
import type { Player } from '../members/member'

/**
 * "Waiting for ● moth…" — the whose-turn sentence, as a node.
 *
 * One source for two readers that must never word it differently: the info
 * column's `<TurnStatusLine>` beside the board, and the whose-turn feedback
 * message (`FeedbackMessage.waiting`) under it. The mention sits
 * mid-sentence on purpose (Joel, 2026-09-12), so this builds the node itself
 * rather than leaning on a feedback message's leading actor. The name always
 * shows, phone included: it fits. Never the possessive "moth's turn" —
 * usernames are not apostrophized.
 */
export function waitingForText(player: Player) {
  return (
    <>
      Waiting for <DotActor actor={player} show="both" />…
    </>
  )
}
