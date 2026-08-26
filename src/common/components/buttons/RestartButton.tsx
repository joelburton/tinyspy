// cs-unmet

import { IconRestart } from '../icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Restart-the-board button — start THIS board over from scratch (same
 * scramble/setup, all progress cleared). The **`info`** tone (blue) marks it as
 * a navigational "do something different" action, not a destructive end (that's
 * EndGameButton's red) — restarting un-terminals the game rather than closing
 * it. Label is always **"Restart"**; waffle's terminal action row is the first
 * user.
 */
export function RestartButton({
  name = 'Restart',
  icon = IconRestart,
  tone = 'normal',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} tone={tone} {...rest} />
}
