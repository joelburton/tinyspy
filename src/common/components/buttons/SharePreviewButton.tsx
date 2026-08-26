// cs-unmet

import { IconShare } from '../icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Share-a-move button — broadcasts your in-progress (staged) board to your coop
 * teammates, who see it in a read-only preview (scrabble's "show a move"). The
 * **`normal`** tone (blue outline, secondary weight — NOT the filled primary):
 * it's a helpful side action, not the main move, and shares the tone with the
 * Swap button beside it. **Icon-only** by default (the share glyph reads on its
 * own); `label` is the aria-label + tooltip. Default label "Show move".
 */
export function SharePreviewButton({
  name = 'Show move',
  icon = IconShare,
  tone = 'normal',
  label = null,
  ...rest
}: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} tone={tone} label={label} {...rest} />
}
