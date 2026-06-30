import { IconEndTurn } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

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
export function EndTurnButton({ label = 'End turn', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconEndTurn} label={label} weight="primary" {...rest} />
}
