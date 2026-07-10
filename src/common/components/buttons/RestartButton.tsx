import { IconRestart } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Restart-the-board button — start THIS board over from scratch (same
 * scramble/setup, all progress cleared). The **`info`** tone (blue) marks it as
 * a navigational "do something different" action, not a destructive end (that's
 * EndGameButton's red) — restarting un-terminals the game rather than closing
 * it. Label is always **"Restart"**; waffle's terminal action row is the first
 * user.
 */
export function RestartButton({ label = 'Restart', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconRestart} label={label} tone="info" {...rest} />
}
