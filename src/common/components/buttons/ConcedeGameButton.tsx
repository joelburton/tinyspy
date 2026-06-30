import { IconEnd } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Concede-the-game button — give up a **compete** game ("I give up, you win").
 *
 * Shares EndGameButton's flag glyph + `error` (red) tone today, but it's a
 * SEPARATE component because it's a semantically different action: End is the
 * neutral mutual "we're done" (solo / coop), Concede is a player bowing out of a
 * race (compete). Keeping them apart lets us diverge the glyph / confirm /
 * outcome later — a concede should probably hand the win to the opponent rather
 * than end neutrally — without touching End's callers. Default label "Concede".
 */
export function ConcedeGameButton({ label = 'Concede', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconEnd} label={label} tone="error" {...rest} />
}
