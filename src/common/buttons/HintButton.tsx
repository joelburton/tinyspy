// cs-unmet

import { IconHint } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * Get-a-hint button — asks for a clue. The **`warning`** tone (dark amber, the
 * same amber as a `warning` feedback pill) marks it as a "help / important, but
 * not good-or-bad" action, distinct from the destructive red End. Default label
 * "Hint".
 */
export function HintButton({ name = 'Hint', icon = IconHint, tone = 'caution', ...rest }: PurposeButtonProps) {
  return <StandardButton name={name} icon={icon} tone={tone} {...rest} />
}
