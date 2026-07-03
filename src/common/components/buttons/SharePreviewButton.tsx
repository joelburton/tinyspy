import { IconShare } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Share-a-move button — broadcasts your in-progress (staged) board to your coop
 * teammates, who see it in a read-only preview (scrabble's "show a move"). The
 * **`info`** tone (blue outline, secondary weight — NOT the filled primary): it's
 * a helpful side action, not the main move, and shares the info tone with the
 * Swap button beside it. **Icon-only** by default (the share glyph reads on its
 * own); `label` is the aria-label + tooltip. Default label "Show move".
 */
export function SharePreviewButton({ label = 'Show move', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconShare} label={label} tone="info" iconOnly {...rest} />
}
