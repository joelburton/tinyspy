// cs-blessed-buttons

import { IconEndTurn } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * HAND PLAY ON — voluntarily stop your turn without making (another) move.
 * Reach for this where ending the turn IS the move on offer, which is why it
 * takes the filled `primary` weight: it carries the row's emphasis.
 *
 * Two buttons are easy to confuse with it, in opposite ways. `PassButton` is
 * this same octagon at the default secondary weight, for games where passing
 * is the fallback rather than the main move — same act, different emphasis by
 * context. `EndGameButton` shares the WORD and not the act: it ends the whole
 * game, this ends one turn.
 *
 * Default label "End turn".
 */
export function EndTurnButton({
  label = 'End turn',
  icon = IconEndTurn,
  weight = 'primary',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} weight={weight} {...rest} />
}
