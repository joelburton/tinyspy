import { useEffect, useRef } from 'react'
import { cls } from '../../common/lib/cls'
import { colorVarFor } from '../../common/lib/memberColor'
import type { Player, PsychicnumGuess } from '../hooks/useGame'
import styles from './GuessHistory.module.css'

type Props = {
  guesses: PsychicnumGuess[]
  players: Player[]
}

/**
 * The append-only log of guesses for this game.
 *
 * Stateless and presentational — owns no state, makes no RPC
 * calls, just renders the rows from the props it's given.
 *
 * **Visual style** mirrors wordknit's GuessHistory: each row is
 * a small card with a 10px-wide colored strip on the left
 * (green for correct, red for wrong), the rest transparent.
 * Same semantic palette across games — "wrong guess" reads the
 * same in wordknit as it does here.
 *
 * **Chronological order** (oldest at top, latest at bottom).
 * The list scrolls inside its own frame (see the `.list` styles
 * + the parent column's bounded height in PlayArea.module.css)
 * and auto-snaps to the bottom on every new guess via the
 * effect below — same UX as a chat panel.
 *
 * The pattern carries forward to harder games: tinyspy's clue +
 * guess log, future game move lists. When those land, each
 * `<XHistory>` can adopt this same shape — pure render from a
 * list + the member roster needed to resolve attribution.
 */
export function GuessHistory({ guesses, players }: Props) {
  const playerFor = (userId: string) =>
    players.find((m) => m.user_id === userId)
  const listRef = useRef<HTMLOListElement>(null)

  // Auto-scroll to the latest on every guess — see the
  // wordknit GuessHistory for the rationale; same simple
  // pattern as ChatBody's autoScrollToBottom.
  useEffect(function scrollToLatest() {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [guesses])

  return (
    <section className={styles.history}>
      <h3 className={styles.heading}>Guesses</h3>
      {guesses.length === 0 ? (
        <p className="muted">No guesses yet.</p>
      ) : (
        <ol ref={listRef} className={styles.list}>
          {guesses.map((g) => {
            const guesser = playerFor(g.user_id)
            return (
              <li
                key={g.id}
                className={cls(
                  styles.item,
                  g.was_correct ? styles.item_correct : styles.item_wrong,
                )}
              >
                <div className={styles.number}>{g.number}</div>
                <div className={styles.meta}>
                  <span
                    className={styles.user}
                    style={{ color: colorVarFor(guesser?.color) }}
                  >
                    {guesser?.username ?? 'someone'}
                  </span>
                  <span className={styles.separator}>·</span>
                  <span>{g.was_correct ? 'Correct!' : 'Not the number'}</span>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
