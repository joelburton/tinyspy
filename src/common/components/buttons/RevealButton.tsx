import { IconHideSolution, IconReveal } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Reveal-the-solution button — uncovers the WHOLE hidden answer of a finished
 * game: waffle's grid, wordle's word, stackdown's six words, psychicnum's
 * secrets, codenamesduet's partner key, crosswords' author solution.
 *
 * **`error`** tone (red) and the boxed-eye glyph, both saying the same thing:
 * this is more than one word. Its quieter sibling is `SpoilerButton` — amber,
 * bare eye, one item, mid-game.
 *
 * **It is a TWO-STATE control**, and that's the whole design (docs/ui.md →
 * Terminal results). The reveal is a local display toggle: nothing is written,
 * no peer's board opens, and `revealed` flips this to EyeOff / "Hide" so the
 * same button puts the solution away again. That matters most for the games
 * whose reveal REWRITES the board (crosswords, strands, waffle, connections) —
 * hiding returns the board to how the game actually ended, so the record of how
 * far the players got survives the post-mortem instead of being overwritten by
 * it.
 *
 * Games that want a noun ("Reveal answer") pass `label`; pass `revealedLabel`
 * with it so the other face reads the same way ("Hide answer"). Both default,
 * so the plain `<RevealButton revealed={…} onClick={toggle} />` is the norm.
 */
export function RevealButton({
  revealed = false,
  label = 'Reveal',
  revealedLabel = 'Hide',
  ...rest
}: PurposeButtonProps & {
  /** Is the solution on screen right now? Swaps glyph + label to the hide face. */
  revealed?: boolean
  /** The label for the hide face; `label` names the reveal face. */
  revealedLabel?: string
}) {
  return (
    <ActionButton
      icon={revealed ? IconHideSolution : IconReveal}
      label={revealed ? revealedLabel : label}
      tone="error"
      {...rest}
    />
  )
}
