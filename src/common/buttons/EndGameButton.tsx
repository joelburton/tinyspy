// cs-blessed-buttons

import { IconEndGame } from '../icons/icons'
import { StandardButton, type PurposeButtonProps } from './StandardButton'

/**
 * End-the-game button, for the ONE surface that cannot reach the action: the
 * pause overlay. It is the irreversible act in the row and is colored to say so
 * before the press; its glyph is the crossed-out stop sign.
 *
 * **In a game, End is `act-end-game`** — bound by `useStandardGameActions` and
 * placed with `<ActionButton>`, which is where its words, glyph, tone, key and
 * confirmation come from. The overlay is the exception because it REPLACES the
 * play area: while the game is paused the PlayArea is unmounted, so its binding
 * is not on the stack and there is no action to place. Hence a callback and
 * this button, which keeps the two looking identical.
 *
 * Label is always **"End game"** — the full phrase rather than a bare "End",
 * because "End" alone doesn't say end *what*.
 */
export function EndGameButton({
  label = 'End game',
  icon = IconEndGame,
  tone = 'destructive',
  ...rest
}: PurposeButtonProps) {
  return <StandardButton label={label} icon={icon} tone={tone} {...rest} />
}
