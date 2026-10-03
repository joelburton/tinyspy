// cs-blessed-info-sheet

import type { Player } from '../members/member'
import { waitingForText } from './turnText'
import shared from './infoCol.module.css'

type Props = {
  turnHolder: Player
  isMyTurn: boolean
  isGameEnded: boolean
}

/**
 * The whose-turn line for turn-order coop games — "Your turn" when it's
 * yours, "Waiting for ● Name…" when it's someone else's
 */
export function TurnStatusLine({
  turnHolder,
  isMyTurn,
  isGameEnded,
}: Props) {
  return (
    <div className={shared.turnStatus}>
      {!isGameEnded && (isMyTurn ? 'Your turn' : waitingForText(turnHolder))}
    </div>
  )
}
