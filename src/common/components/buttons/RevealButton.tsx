import { IconReveal } from '../icons'
import { ActionButton, type PurposeButtonProps } from './ActionButton'

/**
 * Reveal-the-solution button — uncovers the WHOLE hidden answer of a finished
 * game: waffle's grid, wordle's word, stackdown's six words, psychicnum's
 * secrets, codenamesduet's partner key, crosswords' author solution.
 *
 * **`error`** tone (red) and the boxed-eye glyph, both saying the same thing:
 * this is more than one word. It's a one-way door for the group's post-mortem —
 * once the solution is on screen, "what were you going to play next?" is over
 * and a Restart of the same board is no longer a genuine second try. That's
 * what's destructive about it, not any write: under the friends trust model the
 * reveal is a local display toggle (docs/ui.md → Terminal results), so nothing
 * is persisted and no peer is affected.
 *
 * Its quieter sibling is `SpoilerButton` — amber, bare eye, one item, mid-game.
 */
export function RevealButton({ label = 'Reveal', ...rest }: PurposeButtonProps) {
  return <ActionButton icon={IconReveal} label={label} tone="error" {...rest} />
}
