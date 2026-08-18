import { IconConcede } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Concede-the-game button — drop out of a **compete** race (2+ players).
 *
 * Semantically distinct from End, which is why it's a separate component: End is
 * the neutral mutual "we're done" that terminates a solo / coop game for
 * everyone; Concede is ONE player quitting a race — a real per-player loss, while
 * the others keep playing (common.concede). The two never mean the same thing —
 * and bananagrams proves they aren't even exclusive: its compete row shows
 * Concede AND End side by side, which is what forced them apart visually
 * (2026-08-03). Concede keeps the **flag** (surrender, one player); End took the
 * crossed-out stop sign. They still share the `error` red: both are irreversible.
 * Default label "Concede".
 */
export function ConcedeGameButton({ label = 'Concede', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconConcede} label={label} tone="destructive" {...rest} />
}
