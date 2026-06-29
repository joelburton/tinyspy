import { IconReveal } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Reveal-the-answer button — uncovers a hidden answer (psychicnum's secret word).
 * Shares the **`warning`** tone (dark amber) with HintButton: both are "help /
 * important, but not good-or-bad" actions, set apart from the destructive red
 * End. Default label "Reveal".
 */
export function RevealButton({ label = 'Reveal', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconReveal} label={label} tone="warning" {...rest} />
}
