// cs-audited

import { useEffect, useRef } from 'react'
import { BlockingModal } from '../floating-panels/BlockingModal'
import styles from './CelebrationBlockingModal.module.css'
import { cls } from '../../lib/util/cls'

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
 * A generic celebratory modal — confetti glyphs that bounce in, plus an
 * optional jingle. Ported from crossplay's `SolvedDialog`, themed to this
 * repo's tokens and made game-agnostic.
 *
 * **A `modal-blocking` on the shared `<BlockingModal>`** since 2026-08-25. It
 * was hand-rolled — its own scrim, its own card, its own Escape handler — and
 * §20 warned against unifying it because `FloatingPanel` became a full-screen
 * sheet on a phone and this must stay a small card. That objection is gone: a
 * card family stays a card at every size, and gets no titlebar either, which
 * suits a celebration better than a gray strip with a ✕ would
 * (plans/areas/floating-panels.md → "a panel is a WINDOW or a CARD").
 *
 * The shared "you won!" celebration, and the ONLY modal a terminal game pops:
 * every game carries its verdict in-page (the below-board pill + the
 * info-column outcome line), and reserves this for a win worth marking — popped
 * at the moment it happens via `useCelebration`, never when opening an
 * already-won game. Which win counts is per-game: the COOP solve in most, the
 * COMPETE win in scrabble and bananagrams (whose coop has no win at all).
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
    // floating panel now, so a celebration over anything else dismisses only
    // itself.
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
            <button
              type="button"
              ref={focusRef}
              className={cls('button', 'primary', styles.button, styles.primary)}
              onClick={primary.onClick}
            >
              {primary.label}
            </button>
          )}
          {/* "Nice!" is the DISMISS when there's an action beside it, and the
              ACTION when it's alone — so the dialog always has exactly one
              primary and never offers two. Same rule as every other dialog
              (docs/ui.md → Dialog buttons): the thing you're being offered is
              filled, the way out is the outline. A celebration with only a
              gray outline button undersells itself. */}
          <button
            type="button"
            ref={primary ? undefined : focusRef}
            className={cls('button', primary ? 'secondary' : 'primary', styles.button)}
            onClick={onClose}
          >
            Nice!
          </button>
        </>
      }
    >
      {/* The title is rendered HERE rather than passed to `<BlockingModal>`,
          because the confetti has to come above it — and because this h2 is
          still at h1's size, which is a live question (plans/css-system-2.md §7)
          and not something a structural move should quietly settle. */}
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
