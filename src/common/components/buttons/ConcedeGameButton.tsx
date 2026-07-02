import { IconEnd } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Concede-the-game button — drop out of a **compete** race (2+ players).
 *
 * Semantically distinct from End, which is why it's a separate component: End is
 * the neutral mutual "we're done" that terminates a solo / coop game for
 * everyone; Concede is ONE player quitting a race — a real per-player loss, while
 * the others keep playing (common.concede). The two never mean the same thing, so
 * a game shows exactly one: Concede in compete, End in coop. They share the flag
 * glyph + `error` (red) tone today but stay apart so either can diverge later.
 * Default label "Concede".
 */
export function ConcedeGameButton({ label = 'Concede', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconEnd} label={label} tone="error" {...rest} />
}
