// cs-blessed-buttons

import { IconClear } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Clear-the-selection button — wipes a pending selection. The `IconClear`
 * eraser glyph on a plain outline: clearing is reversible and low-stakes,
 * neither the main move nor an irreversible one. Default label "Clear".
 *
 * Chrome, not a command: a game's own clear is a registry action
 * (`act-clear-selection`, `act-recall-tiles`); this is the generic control for
 * a surface that is not a game.
 */
export function ClearButton({ label = 'Clear', icon = IconClear, ...rest }: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} {...rest} />
}
