// cs-blessed-buttons

import { IconClear } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Clear-the-selection button — wipes the current pending selection (connections'
 * 4 picked tiles). The `IconClear` eraser glyph on a plain outline: clearing is
 * reversible and low-stakes, neither the main move nor an irreversible one.
 * Default label "Clear".
 */
export function ClearButton({ label = 'Clear', icon = IconClear, ...rest }: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} {...rest} />
}
