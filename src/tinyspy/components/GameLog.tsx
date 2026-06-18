import { useEffect, useRef } from 'react'
import type { ClueRow } from '../hooks/useClues'
import type { WordRow } from '../hooks/useBoard'
import type { Player } from '../hooks/useGame'
import { cls } from '../../common/lib/cls'
import { colorVarFor } from '../../common/lib/memberColor'
import { labelName } from '../lib/labels'
import styles from './GameLog.module.css'

type Props = {
  clues: ClueRow[]
  words: WordRow[]
  /** Both seated players, with usernames + profile colors. Used to
   *  resolve seat letters (`'A'` / `'B'`) on each clue / guess row
   *  back to the human-facing identity. */
  players: Player[]
}

/**
 * Turn-by-turn replay in the right column, beneath the action slot.
 * Chronological order: oldest turn at the top, latest at the bottom.
 * Within a turn, the clue is listed first and then each guess in
 * chronological order — each turn reads as a small top-down
 * narrative, and the log overall reads top-down too.
 *
 * The list auto-scrolls to the bottom on every new clue or guess
 * (see the effect below) — same pattern as wordknit / psychic-num
 * GuessHistory and ChatBody.
 *
 * **Visual register** matches wordknit + psychic-num's
 * `<GuessHistory>`: each guess is a small card with a 10px-wide
 * colored left strip — green for an agent hit, amber for neutral,
 * red for the assassin. The clue heading for a turn sits above
 * its guesses as a narrower line with no strip, so the eye reads
 * "the clue" then "what we revealed against it."
 *
 * **Seat letters → usernames.** The DB stores `by_seat` and
 * `revealed_by` as `'A'` / `'B'`. The log shows the corresponding
 * player's username + profile color so the log reads as "ada gave
 * a clue" rather than "A gave a clue" — same identity vocabulary
 * the rest of the chrome (PlayersStrip, ClubGameCard usernames)
 * uses.
 *
 * Data source: the same `clues` and `words` arrays the board
 * already has from useClues + useBoard. All grouping happens
 * client-side — no extra queries — because the data set is tiny
 * (≤ a handful of clues and ≤ 25 guesses).
 *
 * The list scrolls inside its own frame (see the `.list` styles +
 * the parent column's bounded height in PlayArea.module.css) so a
 * long history doesn't push the page past the viewport.
 */
export function GameLog({ clues, words, players }: Props) {
  const listRef = useRef<HTMLOListElement>(null)

  // Auto-scroll to the bottom on every new clue or guess —
  // ChatBody-style "always snap to latest." Effect runs even
  // when listRef is null (empty state); the early null-check on
  // the ref makes that a no-op.
  useEffect(function scrollToLatest() {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [clues, words])

  if (clues.length === 0) return null

  // seat letter → Player so each clue / guess row can resolve back
  // to the human-facing identity (username + profile color). Both
  // seats are always populated by create_game, so the lookup
  // never misses in a valid game. Key type is `string` (not the
  // narrower `'A' | 'B'`) so the lookup works on the db-derived
  // `by_seat` / `revealed_by` strings without casts.
  const playerBySeat = new Map<string, Player>(
    players.map((p) => [p.seat, p] as const),
  )

  const guesses = words
    .filter((w) => w.revealed_at !== null)
    .sort((a, b) =>
      (a.revealed_in_turn ?? 0) - (b.revealed_in_turn ?? 0)
      || (a.revealed_at ?? '').localeCompare(b.revealed_at ?? ''),
    )

  // Turns may exist in the clue list, in the guess list, or both.
  // Union the turn numbers so the log shows every turn that did
  // anything. Sorted ascending so the oldest turn is at the top
  // of the log; the auto-scroll effect keeps the latest in view.
  const turnNumbers = Array.from(
    new Set([
      ...clues.map((c) => c.turn_number),
      ...guesses.map((g) => g.revealed_in_turn ?? 0),
    ]),
  ).sort((a, b) => a - b)

  return (
    <section className={styles.gameLog}>
      <h3 className={styles.heading}>Game log</h3>
      <ol ref={listRef} className={styles.list}>
        {turnNumbers.map((t) => {
          const clue = clues.find((c) => c.turn_number === t)
          const clueGiver = clue ? playerBySeat.get(clue.by_seat) : undefined
          const turnGuesses = guesses.filter((g) => g.revealed_in_turn === t)
          return (
            <li key={t} className={styles.turn}>
              {clue && (
                <div className={styles.clueLine}>
                  <span className="muted">Turn {t}</span>
                  {' · '}
                  <strong style={{ color: colorVarFor(clueGiver?.color) }}>
                    {clueGiver?.username ?? clue.by_seat}
                  </strong>
                  : <span className={styles.clueWord}>
                    {clue.word.toUpperCase()}
                  </span>
                  {' · '}
                  {clue.count}
                </div>
              )}
              {turnGuesses.map((g) => {
                const guesser = g.revealed_by
                  ? playerBySeat.get(g.revealed_by)
                  : undefined
                return (
                  <div
                    key={g.position}
                    className={cls(
                      styles.guess,
                      g.revealed_as === 'G' && styles.guess_G,
                      g.revealed_as === 'N' && styles.guess_N,
                      g.revealed_as === 'A' && styles.guess_A,
                    )}
                  >
                    <strong style={{ color: colorVarFor(guesser?.color) }}>
                      {guesser?.username ?? g.revealed_by ?? '?'}
                    </strong>
                    {' → '}
                    {g.word}
                    <span className={styles.spacer} />
                    <span
                      className={cls(
                        styles.label,
                        styles[`label${g.revealed_as}`],
                      )}
                    >
                      {labelName(g.revealed_as)}
                    </span>
                  </div>
                )
              })}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
