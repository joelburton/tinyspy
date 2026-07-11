import { IconNewGame } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Start-a-fresh-game button — a follow-up game with the same setup but a new
 * board and a new game id (waffle's "New game"; see `GamePageCtx.goToGame`).
 * The **`info`** tone (blue), like RestartButton: a navigational "play more"
 * action, not a destructive end. Label is always **"New game"**; waffle's
 * terminal action row is the first user.
 */
export function NewGameButton({ label = 'New game', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconNewGame} label={label} tone="info" {...rest} />
}
