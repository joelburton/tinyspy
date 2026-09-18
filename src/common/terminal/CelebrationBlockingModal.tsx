// cs-audited-terminal

import { useEffect, useRef } from 'react'
import { BlockingModal } from '../floating-panels/BlockingModal'
import styles from './CelebrationBlockingModal.module.css'
import { StandardButton } from '../buttons/StandardButton'

// Festive glyphs the keyframes animate in. Mixed sizes/rotations (via the
// per-piece stagger) keep the cluster feeling chaotic rather than tidy.
const CONFETTI = ['🎉', '🎊', '✨', '🥳', '🎈', '⭐']

type Props = {
  // Headline. Defaults to a generic win message.
  title?: string
  // Sub-line under the headline.
  body?: string
  // Dismiss the dialog — Esc or a button, never the scrim; see `BlockingModal`.
  onClose: () => void
  // Optional primary action (e.g. "Play again"). When present it renders as the
  // focused button; otherwise the (always-present) "Nice!" close button takes focus.
  primary?: { label: string; onClick: () => void }
  // Play the celebratory jingle on mount. Defaults to true.
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
 * Focus moves to the primary (or close) button on mount so a keyboard
 * player can Enter through it; Esc dismisses. The jingle is best-effort —
 * browsers block autoplay outside a user-gesture window, and jsdom doesn't
 * implement media playback at all, so any failure is swallowed and the
 * visual celebration still happens.
 */
export function CelebrationBlockingModal({
  title = 'Congratulations!',
  body = 'You solved the puzzle.',
  onClose,
  primary,
  playSound = true,
}: Props) {
  const focusRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    focusRef.current?.focus()

    // Best-effort jingle. Wrapped defensively: autoplay may be blocked
    // (rejected promise) and jsdom throws "not implemented" synchronously —
    // either way, the visual celebration is the point, so swallow.
    let audio: HTMLAudioElement | null = null
    if (playSound) {
      try {
        audio = new Audio('/audio/tada.mp3')
        audio.volume = 0.8
        void audio.play()?.catch(() => {})
      } catch {
        audio = null
      }
    }

    // No Escape handler of its own — `usePanelEscape` owns the key for every
    // floating panel, so a celebration over anything else dismisses only itself.
    return () => {
      // Stop the jingle if the dialog is dismissed early.
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
    }
  }, [playSound])

  return (
    <BlockingModal
      onClose={onClose}
      actions={
        <>
          {primary && (
            <StandardButton
              show="label"
              label={primary.label}
              ref={focusRef}
              weight="primary"
              onClick={primary.onClick}
            />
          )}
          {/* "Nice!" is the DISMISS when there's an action beside it, and the
              ACTION when it's alone — so the dialog always has exactly one
              primary and never offers two. Same rule as every other dialog
              (docs/ui.md → Dialog buttons): the thing you're being offered is
              filled, the way out is the outline. A celebration with only a
              gray outline button undersells itself. */}
          <StandardButton
            show="label"
            label="Nice!"
            ref={primary ? undefined : focusRef}
            weight={primary ? 'secondary' : 'primary'}
            onClick={onClose}
          />
        </>
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
        <p className={styles.subline}>{body}</p>
      </div>
    </BlockingModal>
  )
}
