import { IconSpoiler } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Give-me-this-one button — hands over a single hidden item **while the game is
 * still live**: stackdown's next word, psychicnum's answer word. The rung above
 * `HintButton` on the same ladder: a hint points *at* the answer (a clue, a
 * definition), a spoiler *is* the answer.
 *
 * Shares HintButton's **`warning`** amber, because it's the same kind of act —
 * help you asked for, neither good nor bad — and the bare-eye glyph is what
 * separates it from the lightbulb. Deliberately NOT the boxed-eye
 * `RevealButton`, which is the whole solution at game-over and wears red; see
 * the icon registry for the pair.
 */
export function SpoilerButton({ label = 'Spoiler', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconSpoiler} label={label} tone="caution" {...rest} />
}
