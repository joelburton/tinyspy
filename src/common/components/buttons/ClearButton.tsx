// cs-unmet

import { IconClear } from '../icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Clear-the-selection button — wipes the current pending selection (connections'
 * 4 picked tiles). The `IconClear` eraser glyph at `neutral` tone (a plain
 * outline — clearing is reversible and low-stakes, neither a primary action nor
 * a destructive one). Default label "Clear".
 */
export function ClearButton({ name = 'Clear', icon = IconClear, ...rest }: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} {...rest} />
}
