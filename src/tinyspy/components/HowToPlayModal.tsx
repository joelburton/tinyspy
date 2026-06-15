import { useEffect, useRef } from 'react'
import styles from './HowToPlayModal.module.css'

type Props = {
  open: boolean
  onClose: () => void
}

/**
 * Short rules summary, opened from the home screen via a "How to play"
 * button. Backed by the native <dialog> element so we get focus trap +
 * Esc-to-close for free; we add backdrop-click-to-close on top of that
 * (the click target IS the dialog when the user clicks outside the
 * inner content box).
 */
export function HowToPlayModal({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Sync the dialog's open state with React. showModal() activates the
  // backdrop and focus trap; the matching close() reverses it. Using the
  // controlled style — not relying on the `open` prop directly — keeps
  // the dialog's internal state in step with React even after Esc-close.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className={styles.howToPlay}
      onClose={onClose}
      onClick={(e) => {
        // A click that targets the <dialog> element itself (and not any
        // descendant) is a click on the backdrop area.
        if (e.target === dialogRef.current) onClose()
      }}
    >
      <div className={styles.content}>
        <h2>How to play Codenames Duet</h2>

        <p>
          You and your partner are spies trying to identify <strong>15 agents</strong> hidden
          among 25 words on the board.
        </p>

        <h3>What you see</h3>
        <p>
          You see a 5×5 grid, tinted with <em>your</em> view of each card:
        </p>
        <ul>
          <li><strong className={styles.hintAgent}>Green</strong> — an agent (you're hunting these)</li>
          <li><strong className={styles.hintNeutral}>Tan</strong> — a bystander</li>
          <li><strong className={styles.hintAssassin}>Red</strong> — the assassin (revealing one ends the game)</li>
        </ul>
        <p>
          Your partner sees the same 25 words but with their <em>own</em> color view — different
          agents, different assassin. Together you have 15 unique agents to find.
        </p>

        <h3>Turns</h3>
        <ol>
          <li>The clue-giver types a clue: a <strong>count</strong> + a <strong>word or phrase</strong>.</li>
          <li>The partner guesses one card at a time on the board.</li>
          <li>Hitting a green agent? Keep going.</li>
          <li>Hitting a tan? Turn ends, one timer token spent.</li>
          <li>Hitting an assassin? Game over.</li>
        </ol>
        <p>
          You have <strong>9 timer tokens</strong>. When they run out, you enter sudden death —
          any wrong reveal loses the game.
        </p>

        <button type="button" autoFocus onClick={onClose}>
          Got it
        </button>
      </div>
    </dialog>
  )
}
