import { IconDelete } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Delete / backspace button — removes the last typed character. The `IconDelete`
 * glyph reads denser/smaller than most, so it's bumped to 22 (vs the default 18)
 * here, once, for every consumer; `.icon-only`'s fixed box keeps the button the
 * same size as its neighbours regardless. Secondary weight. Default label
 * "Delete".
 */
export function DeleteButton({ label = 'Delete', ...rest }: PurposeButtonProps) {
  return (
    <ActionButton icon={IconDelete} label={label} iconSize={22} tone="secondary" {...rest} />
  )
}
