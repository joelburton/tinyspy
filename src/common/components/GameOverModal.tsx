import { cls } from '../lib/cls'
import { FloatingPanel } from './FloatingPanel'
import styles from './GameOverModal.module.css'

type Props = {
  /** Drives the subtle tonal accent inside the modal (a small
   *  colored bar above the verdict). `won` reads as success;
   *  `lost` reads as the more somber assassin / out-of-time
   *  family. Doesn't affect copy — the verdict text carries that. */
  outcome: 'won' | 'lost'
  /** The verdict line — centered, large in the body. Per game,
   *  picked per-status by the caller: "You win!", "You lost: out
   *  of guesses", "You lost: assassin revealed", etc. The
   *  FloatingPanel's title bar is always "Game over"; this is the
   *  important per-status line that the user actually reads. */
  verdict: string
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
 * The FloatingPanel's title bar is always "Game over". The
 * important per-status line — the verdict — lives in the body as
 * a centered large-font label. No further detail in the body:
 * everything the player might want to review (revealed tiles,
 * matched categories, the secret number) is on the PlayArea
 * already, so the modal stays focused on the moment-of-result.
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
  verdict,
  onClose,
  onBackToClub,
}: Props) {
  return (
    <FloatingPanel
      title="Game over"
      onClose={onClose}
      defaultSize={{ width: 420, height: 240 }}
      minWidth={300}
      minHeight={180}
    >
      <div className={cls(styles.accent, styles[outcome])} aria-hidden />
      <div className={styles.verdict}>{verdict}</div>
      <div className={styles.actions}>
        <button type="button" autoFocus onClick={onBackToClub}>
          Back to club
        </button>
      </div>
    </FloatingPanel>
  )
}
