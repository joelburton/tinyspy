// cs-audited-buttons

import { IconNewGame } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Start-a-fresh-game button — a follow-up game with the same setup but a new
 * board and a new game id (waffle's "New game"; see `GamePageCtx.goToGame`).
 * The accent blue, like RestartButton: a navigational "play more" action, not
 * an irreversible end. Label is always **"New game"**; waffle's
 * terminal action row is the first user.
 */
export function NewGameButton({
  label = 'New game',
  icon = IconNewGame,
  tone = 'normal',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} tone={tone} {...rest} />
}
