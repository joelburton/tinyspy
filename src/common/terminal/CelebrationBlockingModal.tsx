// cs-blessed-terminal

import { useEffect, useRef } from 'react'
import { BlockingModal } from '../floating-panels/BlockingModal'
import styles from './CelebrationBlockingModal.module.css'
import { StandardButton } from '../buttons/StandardButton'
import { playSound } from '../sounds/playSound'

// Festive glyphs the keyframes animate in. Mixed sizes/rotations (via the
// per-piece stagger) keep the cluster feeling chaotic rather than tidy.
const CONFETTI = ['🎉', '🎊', '✨', '🥳', '🎈', '⭐']

type Props = {
  // Headline — the game's own words for its win.
  title: string
  // Sub-line under the headline. Omit it and the card is title + confetti: there
  // is no default, because no one sentence is true of every game's win.
  body?: string
  // Dismiss the dialog — Esc or a button, never the scrim; see `BlockingModal`.
  onClose: () => void
  // Play the celebratory jingle on mount. Defaults to true; the player's
  // "Enable sounds" setting still has the last word (`sounds/playSound`).
  playSound?: boolean
}

/**
 * The shared "you won!" celebration — confetti glyphs that bounce in, an
 * optional jingle, and the way out.
 *
 * A terminal game pops nothing else. Every game carries its verdict in-page
 * (the below-board pill + the info-column outcome line) and reserves this for a
 * win worth marking, popped at the moment it happens via `useCelebration` and
 * never when opening an already-won game. Which win counts is the caller's:
 * whichever flip that game can read correctly on its first render.
 *
 * It rides the shared `<BlockingModal>` because a card family stays a card at
 * every size — a small card over a dimmed board on a phone as much as on a
 * desktop — and gets no titlebar, which suits a celebration better than a gray
 * strip with a ✕ would (docs/ui.md → Floating panels).
 *
 * Focus moves to the "Nice!" button on mount so a keyboard player can Enter
 * through it; Esc dismisses. The jingle goes through `playSound`, so it is
 * best-effort and obeys the player's "Enable sounds" setting; the visual
 * celebration happens either way.
 */
export function CelebrationBlockingModal({ title, body, onClose, playSound: withSound = true }: Props) {
  const focusRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    focusRef.current?.focus()
    const stopJingle = withSound ? playSound('tada') : () => {}

    // No Escape handler of its own — `usePanelEscape` owns the key for every
    // floating panel, so a celebration over anything else dismisses only itself.
    // Dismissed early, the jingle stops with it.
    return stopJingle
  }, [withSound])

  return (
    <BlockingModal
      onClose={onClose}
      actions={
        // The way out is the only button, so it is the filled one: a
        // celebration with a lone gray outline button undersells itself.
        <StandardButton show="label" label="Nice!" fullWidth ref={focusRef} weight="primary" onClick={onClose} />
      }
    >
      {/* The title is rendered HERE rather than passed to `<BlockingModal>`
          because the confetti has to come above it. */}
      {/* `role="dialog"` named by the title is the handle every test queries —
          `FloatingPanel` sets no role, so this is the only one in the tree. */}
      <div className={styles.content} role="dialog" aria-label={title}>
        <div className={styles.confetti} aria-hidden>
          {CONFETTI.map((g, i) => (
            <span key={i} className={styles.piece} style={{ animationDelay: `${i * 0.12}s` }}>
              {g}
            </span>
          ))}
        </div>
        <h2 className={styles.title}>{title}</h2>
        {body && <p className={styles.subline}>{body}</p>}
      </div>
    </BlockingModal>
  )
}
