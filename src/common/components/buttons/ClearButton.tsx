import { IconClear } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Clear-the-selection button — wipes the current pending selection (connections'
 * 4 picked tiles). The `IconClear` eraser glyph at `neutral` tone (a plain
 * outline — clearing is reversible and low-stakes, neither a primary action nor
 * a destructive one). Default label "Clear".
 */
export function ClearButton({ label = 'Clear', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconClear} label={label} {...rest} />
}
