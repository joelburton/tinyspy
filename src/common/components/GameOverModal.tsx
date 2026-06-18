import type { ReactNode } from 'react'
import { cls } from '../lib/cls'
import { FloatingPanel } from './FloatingPanel'
import styles from './GameOverModal.module.css'

type Props = {
  /** Drives the subtle tonal accent inside the modal (a small
   *  colored bar above the title). `won` reads as success;
   *  `lost` reads as the more somber assassin / out-of-time
   *  family. Doesn't affect copy — the per-status title carries
   *  that. */
  outcome: 'won' | 'lost'
  /** Per-status verdict — short and punchy. Examples:
   *  "Victory!", "Out of time", "Assassin revealed",
   *  "Solved!", "Got it!". Becomes the FloatingPanel's title
   *  bar copy. */
  title: string
  /** Per-game factual reveal — the secret number for psychic-num,
   *  mistake count for wordknit, turns used + agents found for
   *  tinyspy. Renders below the title; ReactNode so a caller can
   *  do mild composition (multiple lines, a `<strong>` for a
   *  username, etc.) without a string-only constraint. */
  detail?: ReactNode
  /** Dismiss the modal. The user lands back in the PlayArea in
   *  review mode (board still visible, terminal indicator + Back-
   *  to-club affordance live in the slot where input used to be). */
  onClose: () => void
  /** Navigate to the club page. The caller (`<GamePage>` via
   *  `ctx.goToClub`) skips the suspend-confirm modal because the
   *  game is terminal — no progress to lose. Same callback the
   *  PlayArea indicator's Back-to-club button uses, so the two
   *  affordances are wired identically. */
  onBackToClub: () => void
}

/**
 * The shared terminal-state modal. One component, used by all
 * three games (and any future game), per docs/ui.md →
 * "Modals for terminal results."
 *
 * Built on `<FloatingPanel>` for the chrome (draggable, resizable,
 * ESC, X) — same shell the chat / Help / Hint modals use, so the
 * visual register stays consistent.
 *
 * **No backdrop.** Matches the other in-game modals — the user
 * can click straight through to the board to start reviewing
 * without first dismissing this modal.
 *
 * **No reopen after close.** This is presentational only; the
 * "do I open it?" decision lives in the per-game PlayArea via a
 * `useState(isTerminal)` + a useEffect that flips show=true on
 * the isTerminal transition. Once dismissed, the PlayArea
 * doesn't re-mount it — review mode takes over and the user
 * already knows the verdict.
 */
export function GameOverModal({
  outcome,
  title,
  detail,
  onClose,
  onBackToClub,
}: Props) {
  return (
    <FloatingPanel
      title={title}
      onClose={onClose}
      defaultSize={{ width: 420, height: 280 }}
      minWidth={300}
      minHeight={200}
    >
      <div className={cls(styles.accent, styles[outcome])} aria-hidden />
      {detail && <div className={styles.detail}>{detail}</div>}
      <div className={styles.actions}>
        <button type="button" autoFocus onClick={onBackToClub}>
          Back to club
        </button>
      </div>
    </FloatingPanel>
  )
}
