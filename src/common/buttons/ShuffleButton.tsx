// cs-blessed-buttons

import { IconShuffle } from '../icons/icons'
import { cls } from '../utils/cls'
import { actionSurface } from '../actions/actionSurface'
import type { BoundAction } from '../actions/useBoundAction'
import styles from './ShuffleButton.module.css'

type Props = {
  /** The action this pill fires — `act-shuffle`, or boggle's `act-rotate`. Its
   *  key rides in the hover bubble, and its state decides whether the control is
   *  live, so the pill and the key can't disagree. */
  action: BoundAction
  /** What to CALL it here, when the action's own word isn't specific enough:
   *  "Shuffle the words", "Shuffle rack". The key is appended either way.
   *  Defaults to the action's label. */
  tooltip?: string
  /** Extra class for the caller's layout (margins/placement). */
  className?: string
}

/**
 * The standard ⟲ shuffle control — an icon-only pill, used wherever a player
 * reshuffles their OWN tiles for a fresh look. It's part of the shared design
 * language: the same recognizable glyph + hover-spin everywhere, so a player
 * who learns it in one game knows it in the next. See docs/ui.md →
 * Consistency across games.
 *
 * **Not a `<StandardButton>`, and driven by an action anyway.** The round pill
 * and the spinning glyph are its own (docs/ui.md's button taxonomy lists it
 * among the families that are not the standard button) — but what it DOES,
 * what it is called and which key also does it come from the binding it is
 * given, like any other surface. A bespoke look is not a reason to write a
 * command down twice.
 *
 * **It never takes focus.** It is a game piece, and game pieces are not focus
 * targets — board tiles and readouts are not either. So it is not a tab stop
 * (`tabIndex={-1}`), and `onMouseDown` is suppressed so a click cannot park
 * focus on it either, which would steal it from a game's keyboard-handler
 * attachment point (spellingbee captures typed letters and must keep focus
 * where keydown is bound). Its key and its menu row are how a keyboard reaches
 * it.
 *
 * Shuffling is always local and harmless (no server write, no broadcast), so an
 * action that offers it usually stays `active` even at terminal — the post-game
 * fidget is deliberate.
 *
 * The glyph rotates on hover; the rotation lives on the inner span so the pill
 * itself stays put (rotating the button would spin the whole control, which
 * reads as a twitch).
 */
export function ShuffleButton({ action, tooltip, className }: Props) {
  const { hidden, buttonProps } = actionSurface(action, tooltip)
  if (hidden) return null

  return (
    <button
      type="button"
      className={cls(styles.shuffle, className)}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      {...buttonProps}
    >
      {/* The glyph spins on hover via the .glyph span (rotating the button
       *  would spin the whole pill). IconShuffle is the rotate glyph — chosen
       *  over the crossing-arrows `Shuffle` as the visually clearer "fresh
       *  look" (see the registry / docs/ui.md). */}
      <span className={styles.glyph}>
        <IconShuffle size={24} aria-hidden />
      </span>
    </button>
  )
}
