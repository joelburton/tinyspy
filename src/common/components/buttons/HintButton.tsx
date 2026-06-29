import { IconHint } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Get-a-hint button — asks for a clue. The **`warning`** tone (dark amber, the
 * same amber as a `warning` feedback pill) marks it as a "help / important, but
 * not good-or-bad" action, distinct from the destructive red End. Default label
 * "Hint".
 */
export function HintButton({ label = 'Hint', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconHint} label={label} tone="warning" {...rest} />
}
