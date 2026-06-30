import { Fragment } from 'react'
import { ActorTag } from '../../common/components/ActorTag'
import { TurnLog, TurnLogBar } from '../../common/components/TurnLog'
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
  /** The game's current (in-progress) turn number (`games.turn_number`). Lets a
   *  guess-less turn read "(clue given)" while it's still live vs "(no guesses)"
   *  once it's ended — see the guess-line note below. */
  currentTurn: number
  /** Whether the game has ended. A guess-less *current* turn at terminal is no
   *  longer "in progress," so it reads "(no guesses)", not "(clue given)". */
  gameOver: boolean
}

/**
 * codenamesduet's turn log — its turns rendered with the shared `<TurnLog>`
 * table (same chrome psychicnum + connections use). The outcome bar carries the
 * turn verdict (see {@link turnOutcome}).
 *
 * Stateless + presentational. codenamesduet *chooses* a **two-`<tr>`** turn (the
 * row anatomy is the game's — see TurnLog.tsx) so the pieces sit in real table
 * columns: row 1 is `[bar] | # | count WORD | clue-giver` (the bar `rowSpan`s the
 * whole turn; the `<ActorTag>` right-aligned via the shared `.who` column), and
 * row 2 spans those three content columns with the turn's guesses — each word
 * colored by its reveal outcome (agent green / neutral tan / assassin red), the
 * same vocabulary the board uses. The `.turnLogDivider` on row 1 draws the
 * between-turns line (so there's no line *within* a turn). A guess-less turn reads
 * **"(clue given)"** while it's the current, still-live turn (the guesser hasn't
 * acted yet) and **"(no guesses)"** once it has ended empty (the guesser passed) —
 * distinguished by `currentTurn` + `gameOver`, since both look identical in the
 * data (a clue, no guess rows). All grouping is client-side (the data set is
 * tiny); the shared `<TurnLog>` snaps to the latest row.
 */
export function GameTurnLog({ clues, guesses, players, currentTurn, gameOver }: Props) {
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
        // A guess-less turn is still "in progress" (clue given, guesser yet to
        // act) only while it's the current turn AND the game is live; otherwise
        // it ended empty (a pass). See the docstring.
        const inProgress = turnGuesses.length === 0 && t === currentTurn && !gameOver
        return (
          <Fragment key={t}>
            {/* Row 1, real columns: [bar ⇣rowSpan 2] | # (`.meta`) | count WORD
                (`.main`, absorbs the slack) | clue-giver (`.who`, shrinks to the
                username). `.turnLogDivider` draws the line above this turn
                (suppressed on the first); `.entryHead`/`.entryCont` hug the two
                rows together. */}
            <tr className={cls(turnLog.turnLogDivider, turnLog.entryHead)}>
              <TurnLogBar outcome={turnOutcome(turnGuesses)} rowSpan={2} />
              <td className={turnLog.meta}>#{t}</td>
              <td className={turnLog.main}>
                <span className={styles.clueWord}>
                  {clue.count} {clue.word.toUpperCase()}
                </span>
              </td>
              <td className={turnLog.who}>
                <ActorTag actor={clueGiver} fallback={clue.by_seat} />
              </td>
            </tr>
            {/* Row 2: the turn's guesses, spanning the three content columns
                (#, clue, clue-giver) beneath the clue line. No divider class — the
                line belongs between turns, not within one. The bar's rowSpan
                occupies col 0 here, so this colSpan starts at the # column. */}
            <tr className={turnLog.entryCont}>
              <td colSpan={3}>
                {turnGuesses.length === 0 ? (
                  <span className={turnLog.meta}>
                    {inProgress ? '(clue given)' : '(no guesses)'}
                  </span>
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
              </td>
            </tr>
          </Fragment>
        )
      })}
    </TurnLog>
  )
}
