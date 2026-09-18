// cs-fixed-outcome-fix

import { Fragment } from 'react'
import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import { cls } from '@/common/utils/cls'
import type { ClueRow } from '../hooks/useClues'
import type { GuessRow } from '../hooks/useBoard'
import type { Player } from '../hooks/useGame'
import { turnOutcome } from '../lib/turnOutcome'
import styles from './GameEventLog.module.css'

type Props = {
  clues: ClueRow[]
  /** Every guess, in any order — grouped by turn below. (A word can appear
   *  twice, once per seat, which is why this is the guess log, not per-word
   *  board state.) */
  guesses: GuessRow[]
  /** Both seated players, with usernames + profile colors — used to resolve a
   *  clue's seat letter ('A'/'B') back to the human-facing clue-giver. */
  players: Player[]
  /** The viewer, so the picker can order them first. */
  selfId: string
  /** The game's current (in-progress) turn number (`games.turn_number`). Lets a
   *  guess-less turn read "(clue given)" while it's still live vs "(no guesses)"
   *  once it's ended — see the guess-line note below. */
  currentTurn: number
  /** Whether the game has ended. A guess-less *current* turn at terminal is no
   *  longer "in progress," so it reads "(no guesses)", not "(clue given)". */
  gameOver: boolean
  // The turn currently open in the board viewer (by `turn_number`), or null when
  // live. That turn's `#N` handle wears the shared viewing ring.
  historyId: number | null
  // Open a turn in the board viewer — click (or Enter/Space) any of its rows.
  onShowHistory: (turnNumber: number) => void
}

/**
 * codenamesduet's event log — its turns rendered with the shared `<EventLog>`
 * table (same chrome psychicnum + connections use). The outcome bar carries the
 * turn verdict (see {@link turnOutcome}).
 *
 * **Whose turns** are shown is the shared `useEventLogPlayerPicker` dropdown, one
 * vocabulary across every event-log game — here "Team" plus each of the two
 * players (duet is coop-only). A turn is filed under its **clue-giver**, which is
 * the person the row's actor column already names: picking someone answers "which
 * clues did I give?", not "which words did I guess". That's the useful question,
 * since a duet turn is one clue and the guesses that answered it.
 *
 * It ignores the hook's `boardIsShown`: the `#N` handle addresses a turn by
 * `turn_number`, not by log position, so filtering can't misaddress it.
 *
 * Stateless + presentational. codenamesduet *chooses* a **two-`<tr>`** turn (the
 * row anatomy is the game's — see EventLog.tsx) so the pieces sit in real table
 * columns: row 1 is `[bar] | # | count WORD | clue-giver` (the bar `rowSpan`s the
 * whole turn; the `<ActorDot>` right-aligned via the shared `.who` column), and
 * row 2 spans those three content columns with the turn's guesses — each word
 * colored by what it REVEALED (agent green / neutral tan / assassin red), the
 * key-card vocabulary the board uses, not an outcome. The `.divider` on row 1 draws the
 * between-turns line (so there's no line *within* a turn). A guess-less turn reads
 * **"(clue given)"** while it's the current, still-live turn (the guesser hasn't
 * acted yet) and **"(no guesses)"** once it has ended empty (the guesser passed) —
 * distinguished by `currentTurn` + `gameOver`, since both look identical in the
 * data (a clue, no guess rows). All grouping is client-side (the data set is
 * tiny); the shared `<EventLog>` snaps to the latest row.
 *
 * **Turn-history:** the turn's `#N` handle (the shared `<EventLogNumber>`) opens that
 * turn on the board (PlayArea's `useHistoryViewer`) and rings itself in the history
 * blue while open. The click + marker live on the number, not the row, precisely because a
 * codenamesduet turn is TWO `<tr>`s — a whole-turn outline would draw a broken box
 * and a per-row hover would light only half of it (see `<EventLogNumber>`).
 */
export function GameEventLog({
  clues,
  guesses,
  players,
  selfId,
  currentTurn,
  gameOver,
  historyId,
  onShowHistory,
}: Props) {
  const eventLogPicker = useEventLogPlayerPicker({
    players,
    selfId,
    mode: 'coop',
    // Coop: every clue and guess is shared, so nothing is ever RLS-hidden and
    // the honest-hidden empty text can't apply.
    isTerminal: true,
    label: 'Whose clues to show',
    emptyLabel: 'No clues yet.',
  })
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
  // ascending so the oldest turn is at the top; the shared EventLog auto-snaps to
  // the latest.
  const turnNumbers = Array.from(
    new Set([
      ...clues.map((c) => c.turn_number),
      ...sortedGuesses.map((g) => g.turn_number),
    ]),
  ).sort((a, b) => a - b)

  // Filtered by CLUE-GIVER (see the docstring). Filtered by hand rather than
  // through `eventLogPicker.filter`, because the log's unit is a turn number, not a row
  // with a `user_id` — reading `picked` / `showsEveryone` keeps the one
  // selection the hook owns without inventing a row shape to satisfy it.
  const shownTurns = turnNumbers.filter((t) => {
    if (eventLogPicker.showsEveryone) return true
    const seat = clues.find((c) => c.turn_number === t)?.by_seat
    return playerBySeat.get(seat ?? '')?.user_id === eventLogPicker.picked
  })

  return (
    <EventLog
      heading="Clues"
      picker={eventLogPicker}
      shown={shownTurns}
      // The one game that overrides the count: an entry here is a TURN, and
      // guesses land inside a turn that already exists (they grow its second row
      // rather than adding one), so counting turns alone would miss the snap.
      entryCount={clues.length + sortedGuesses.length}
    >
      {shownTurns.map((t) => {
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
            {/* Row 1, real columns: [bar ⇣rowSpan 2] | #N handle (<EventLogNumber>) | count
                WORD (`.main`, absorbs the slack) | clue-giver (<EventLogActor>, shrinks to
                the username). `.divider` draws the line above this turn
                (suppressed on the first); `.entryHead`/`.entryCont` hug the two rows
                together. The `#N` handle is the turn-viewer control (see the note). */}
            <tr className={cls(gameEventLog.divider, gameEventLog.entryHead)}>
              <EventLogOutcomeBar outcome={turnOutcome(turnGuesses)} rowSpan={2} />
              <EventLogNumber
                n={t}
                isOpenInHistory={historyId === t}
                onShowHistory={() => onShowHistory(t)}
              />
              <td className={gameEventLog.main}>
                <span className={styles.clueWord}>
                  {clue.count} {clue.word.toUpperCase()}
                </span>
              </td>
              <EventLogActor actor={clueGiver} fallback={clue.by_seat} />
            </tr>
            {/* Row 2: the turn's guesses, spanning the three content columns
                (#, clue, clue-giver) beneath the clue line. No divider class — the
                line belongs between turns, not within one. The bar's rowSpan
                occupies col 0 here, so this colSpan starts at the # column. */}
            <tr className={gameEventLog.entryCont}>
              <td colSpan={3}>
                {turnGuesses.length === 0 ? (
                  <span className={gameEventLog.muted}>
                    {inProgress ? '(clue given)' : '(no guesses)'}
                  </span>
                ) : (
                  turnGuesses.map((g, idx) => (
                    <span key={g.position}>
                      {idx > 0 && ' '}
                      <span
                        className={cls(
                          styles.guessWord,
                          g.result === 'G' && styles.guessWord_G,
                          g.result === 'N' && styles.guessWord_N,
                          g.result === 'A' && styles.guessWord_A,
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
    </EventLog>
  )
}
