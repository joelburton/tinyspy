// cs-unmet

import { IconEndTurn } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * End-the-turn button — voluntarily stops your turn without making (another)
 * move, handing play on. The stop-sign **octagon** glyph reads as "halt here," at
 * **`primary`** weight (the filled accent): when it's your turn to act, ending it
 * is the main move on offer, so it carries the row's emphasis. (Primary is the
 * filled-accent look, so it ignores semantic tone — the accent fill stands in for
 * the no-valence "info" read.)
 *
 * Distinct from `EndGameButton` (the flag, red — ends the whole GAME): this ends
 * only the current turn. codenamesduet's "Pass & end turn" is the first user;
 * default label "End turn".
 */
export function EndTurnButton({
  name = 'End turn',
  icon = IconEndTurn,
  weight = 'primary',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} weight={weight} {...rest} />
}
