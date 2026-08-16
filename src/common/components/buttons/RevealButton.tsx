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
 *
 * **`alreadyShown`** is the third state, for the six games with a CLEAR WIN
 * (see `useSolutionReveal`'s `impliedBy`): you can only finish strands,
 * psychicnum, stackdown, waffle, connections or wordle by producing the answer,
 * so a solver is already looking at it. The control goes inert and says why
 * rather than offering to uncover what's on screen — or to hide what the win
 * itself put there. It reverts to a live Reveal/Hide the moment the player
 * makes their own choice.
 */
export function RevealButton({
  revealed = false,
  alreadyShown = false,
  label = 'Reveal',
  revealedLabel = 'Hide',
  disabled,
  tooltip,
  ...rest
}: PurposeButtonProps & {
  /** Is the solution on screen right now? Swaps glyph + label to the hide face. */
  revealed?: boolean
  /** Is it on screen because this player SOLVED it, rather than by their own
   *  press? Renders the inert "Solution already shown" face. */
  alreadyShown?: boolean
  /** The label for the hide face; `label` names the reveal face. */
  revealedLabel?: string
}) {
  // One string for both faces of "inert": it's the icon-only button's
  // accessible name AND its hover bubble, so they can't say different things.
  const shownLabel = alreadyShown
    ? 'Solution already shown'
    : revealed
      ? revealedLabel
      : label
  return (
    <ActionButton
      icon={revealed ? IconHideSolution : IconReveal}
      label={shownLabel}
      tone="error"
      // Present but inert, never absent — the row must not change shape between
      // a solved game and a lost one (docs/ui.md → Layout stability), and "there
      // is nothing to do here" beats a control that vanished.
      disabled={disabled ?? alreadyShown}
      tooltip={tooltip}
      {...rest}
    />
  )
}
