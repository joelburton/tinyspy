import { IconHelp } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Icon-only "?" button that opens a game's Help/rules. Uses lucide's
 * circle-question-mark (`IconHelp`). Rendered in the setup dialog's action row so
 * a player can read the rules before starting — it opens Help ON TOP of the setup
 * dialog (which stays open behind it), unlike the in-game menu's Help item.
 *
 * Icon-only by default (the glyph is self-explanatory); `label` becomes the
 * aria-label + tooltip ("Help" unless overridden). A thin wrapper over
 * `ActionButton`, like the other purpose buttons — so it can't drift from them.
 */
export function HelpButton({ label = 'Help', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconHelp} label={label} iconOnly {...rest} />
}
