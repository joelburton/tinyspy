import { useEffect, useRef } from 'react'
import styles from './CelebrationDialog.module.css'

// Festive glyphs the keyframes animate in. Mixed sizes/rotations (via the
// per-piece stagger) keep the cluster feeling chaotic rather than tidy.
const CONFETTI = ['🎉', '🎊', '✨', '🥳', '🎈', '⭐']

type Props = {
  /** Headline. Defaults to a generic win message. */
  title?: string
  /** Sub-line under the headline. */
  body?: string
  /** Dismiss the dialog. Esc, the backdrop is deliberately NOT click-to-close
   *  (a stray click at the moment of winning shouldn't cancel the moment). */
  onClose: () => void
  /** Optional primary action (e.g. "Play again"). When present it renders as
   *  the focused button; otherwise the (always-present) "Nice!" close button
   *  takes focus. */
  primary?: { label: string; onClick: () => void }
  /** Play the celebratory jingle on mount. Defaults to true. */
  playSound?: boolean
}

/**
 * A generic celebratory modal — confetti glyphs that bounce in over a
 * scale-up card, plus an optional jingle. Ported from crossplay's
 * `SolvedDialog`, themed to this repo's tokens and made game-agnostic.
 *
 * **Currently unwired.** It's the shared "you won!" celebration a game's
 * terminal flow can adopt on top of (or instead of) the plain
 * `<GameOverModal>`; kept here ready for a first consumer.
 *
 * Focus moves to the primary (or close) button on mount so a keyboard
 * player can Enter through it; Esc dismisses. The jingle is best-effort —
 * browsers block autoplay outside a user-gesture window, and jsdom doesn't
 * implement media playback at all, so any failure is swallowed and the
 * visual celebration still happens.
 */
export function CelebrationDialog({
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

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      // Stop the jingle if the dialog is dismissed early.
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
    }
  }, [onClose, playSound])

  return (
    <div className={styles.backdrop}>
      <div className={styles.card} role="dialog" aria-label={title}>
        <div className={styles.confetti} aria-hidden>
          {CONFETTI.map((g, i) => (
            <span key={i} className={styles.piece} style={{ animationDelay: `${i * 0.12}s` }}>
              {g}
            </span>
          ))}
        </div>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.body}>{body}</p>
        <div className={styles.actions}>
          {primary && (
            <button
              type="button"
              ref={focusRef}
              className={`${styles.button} ${styles.primary}`}
              onClick={primary.onClick}
            >
              {primary.label}
            </button>
          )}
          <button
            type="button"
            ref={primary ? undefined : focusRef}
            className={styles.button}
            onClick={onClose}
          >
            Nice!
          </button>
        </div>
      </div>
    </div>
  )
}
