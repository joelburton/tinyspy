// cs-blessed-buttons

import { IconRestart } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Restart-the-board button — start THIS board over from scratch (same
 * scramble/setup, all progress cleared). The accent blue marks it as a
 * navigational "do something different" action, not an irreversible end (that's
 * EndGameButton's red) — restarting un-terminals the game rather than closing
 * it. Label is always **"Restart"**.
 */
export function RestartButton({
  label = 'Restart',
  icon = IconRestart,
  tone = 'normal',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} tone={tone} {...rest} />
}
