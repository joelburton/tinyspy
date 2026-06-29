import { ActorTag } from '../../common/components/ActorTag'
import { TurnLog, TurnLogItem } from '../../common/components/TurnLog'
import turnLog from '../../common/components/TurnLog.module.css'
import { cls } from '../../common/lib/cls'
import type { ClueRow } from '../hooks/useClues'
import type { GuessRow } from '../hooks/useBoard'
import type { Player } from '../hooks/useGame'
import { turnOutcome } from '../lib/turnOutcome'
import styles from './GameTurnLog.module.css'

type Props = {
  clues: ClueRow[]
  /** Every guess, in any order — grouped by turn below. (A word can appear
   *  twice, once per seat, which is why this is the guess log, not per-word
   *  board state.) */
  guesses: GuessRow[]
  /** Both seated players, with usernames + profile colors — used to resolve a
   *  clue's seat letter ('A'/'B') back to the human-facing clue-giver. */
  players: Player[]
}

/**
 * codenamesduet's turn log — its turns rendered with the shared `<TurnLog>`
 * table (same chrome psychicnum + connections use). One `<TurnLogItem>` per turn
 * (a clue + the guesses made on it); the outcome bar carries the turn verdict
 * (see {@link turnOutcome}).
 *
 * Stateless + presentational. Two-line row body (like connections'): the clue
 * (turn number + count + WORD) with the clue-giver's `<ActorTag>` on the right,
 * then the guesses below — each word colored by its reveal outcome (agent green
 * / neutral tan / assassin red), the same vocabulary the board uses, or
 * "(no guesses)" when the guesser passed. All grouping is client-side (the data
 * set is tiny); the shared `<TurnLog>` snaps to the latest row.
 */
export function GameTurnLog({ clues, guesses, players }: Props) {
  // seat letter → Player, so each clue row resolves to its clue-giver's
  // identity. Key type `string` (not the narrower 'A'|'B') so it matches the
  // db-derived `by_seat` without a cast. Both seats are always populated.
  const playerBySeat = new Map<string, Player>(
    players.map((p) => [p.seat, p] as const),
  )

  const sortedGuesses = [...guesses].sort((a, b) =>
    (a.turn_number - b.turn_number)
    || a.guessed_at.localeCompare(b.guessed_at),
  )

  // Turns may exist in the clue list, the guess list, or both. Union + sort
  // ascending so the oldest turn is at the top; the shared TurnLog auto-snaps to
  // the latest.
  const turnNumbers = Array.from(
    new Set([
      ...clues.map((c) => c.turn_number),
      ...sortedGuesses.map((g) => g.turn_number),
    ]),
  ).sort((a, b) => a - b)

  return (
    <TurnLog
      heading="Clues"
      empty={clues.length === 0}
      emptyText="No clues yet."
      scrollKey={clues.length + sortedGuesses.length}
    >
      {turnNumbers.map((t) => {
        const clue = clues.find((c) => c.turn_number === t)
        if (!clue) return null
        const clueGiver = playerBySeat.get(clue.by_seat)
        const turnGuesses = sortedGuesses.filter((g) => g.turn_number === t)
        return (
          <TurnLogItem key={t} outcome={turnOutcome(turnGuesses)}>
            {/* One content cell beside the outcome bar: the clue (turn # + count
                + WORD) with the clue-giver on the right, then the guesses below
                (each colored by reveal outcome, or "no guesses"). */}
            <td>
              <div className={styles.clueRow}>
                <span>
                  <span className={turnLog.meta}>#{t}</span>{' '}
                  <span className={styles.clueWord}>
                    {clue.count} {clue.word.toUpperCase()}
                  </span>
                </span>
                <ActorTag actor={clueGiver} fallback={clue.by_seat} />
              </div>
              <div className={styles.guessLine}>
                {turnGuesses.length === 0 ? (
                  <span className={turnLog.meta}>(no guesses)</span>
                ) : (
                  turnGuesses.map((g, idx) => (
                    <span key={g.position}>
                      {idx > 0 && ' '}
                      <span
                        className={cls(
                          styles.guessWord,
                          g.outcome === 'G' && styles.guessWord_G,
                          g.outcome === 'N' && styles.guessWord_N,
                          g.outcome === 'A' && styles.guessWord_A,
                        )}
                      >
                        {g.word.toUpperCase()}
                      </span>
                    </span>
                  ))
                )}
              </div>
            </td>
          </TurnLogItem>
        )
      })}
    </TurnLog>
  )
}
