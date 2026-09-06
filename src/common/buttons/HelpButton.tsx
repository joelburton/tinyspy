// cs-audited-buttons

import { IconHelp } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * OPEN THE RULES — the "?" in the setup dialog's action row, so a player can
 * read a game before starting it. It opens Help ON TOP of the setup dialog,
 * which stays open behind it; the in-game menu's Help item is the other route
 * and does not.
 *
 * Pass `show="icon"`: the ? is universally read, and the surfaces that carry
 * it — a setup dialog's footer, a game's chrome — have no room for a word. The
 * label survives as the hover bubble.
 */
export function HelpButton({ label = 'Help', icon = IconHelp, ...rest }: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} {...rest} />
}
