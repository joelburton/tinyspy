// cs-blessed-buttons

import { IconShare } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * SHOW A TEAMMATE WHAT YOU'RE ABOUT TO DO — broadcasts your in-progress
 * (staged) board to your coop partners, who see it in a read-only preview.
 *
 * A blue outline rather than the filled primary: it is a helpful side action,
 * not the main move, and it matches the Swap button beside it. Pass
 * `show="icon"` — the share glyph reads on its own, and the label becomes the
 * hover bubble.
 */
export function SharePreviewButton({
  label = 'Show move',
  icon = IconShare,
  tone = 'normal',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} tone={tone} {...rest} />
}
