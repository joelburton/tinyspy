// cs-unmet

import type { useSuggestMove } from '../hooks/useSuggestMove'
import styles from './SuggestPanel.module.css'

/** "15" / "-3" / "19.5" — the rating, bare (no "+"; the score beside it keeps
 *  its plus), decimals only when the leave's half-point weights put them there. */
function formatRating(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1)
}

/**
 * Coop's suggest-a-move results: "Thinking…", the top moves, "No legal moves —
 * swap tiles?", or the reason the suggester refused. The Suggest button is in
 * the action row.
 *
 * Idle, it renders nothing and claims no space — a deliberate exception to the
 * pre-claim-space rule (Joel's call: an empty reserved gap below the help read
 * as clutter). Shown, it holds a fixed height, so a list arriving never moves
 * what is below it. Pressing a row stages that move's tiles on the board; the
 * suggester never sends.
 */
export function SuggestPanel({ suggestion }: {
  suggestion: ReturnType<typeof useSuggestMove>
}) {
  const view = suggestion.view
  if (view.status === 'idle') return null
  return (
    <div className={styles.suggestBox} data-zone="suggest">
      {view.status === 'loading' && <p>Thinking…</p>}
      {view.status === 'error' &&
          <p className={styles.suggestError}>{view.message}</p>}
      {view.status === 'ready' && view.moves.length === 0 &&
          <p>No legal moves — swap tiles?</p>}
      {view.status === 'ready' &&
        view.moves.map((move, i) => (
          <button
            key={i}
            type="button"
            className={styles.suggestRow}
            onClick={() => suggestion.apply(move)}
            title="Stage these tiles on the board"
          >
            <span
              className={styles.suggestWords}>{move.words.map((w) => w.word).join(
              ', ')}</span>
            <span className={styles.suggestScore}>+{move.score}</span>
            {/* The overall rating — equity, score plus the leave heuristic,
                which the list is sorted by. Muted on purpose (Joel's spec):
                the score is the headline, this is the "but really" number. */}
            <span
              className={styles.suggestRating}>({formatRating(move.equity)})</span>
          </button>
        ))}
    </div>
  )
}
