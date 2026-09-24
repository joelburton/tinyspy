// cs-blessed-codenamesduet

import { Fragment } from 'react'
import { EventLog, EventLogActor, EventLogOutcomeBar, EventLogNumber } from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import { useEventLogPlayerPicker } from '@/common/event-log/useEventLogPlayerPicker'
import { cls } from '@/common/utils/cls'
import { IconAI } from '@/common/icons/icons'
import { VERDICT_TONE } from '@/common/game-page/verdictTone'
import { isSuddenDeathTurn, type ClueEvent, type WordedGuess } from '../lib/events'
import { answerMessage } from '../lib/answer'
import type { Player } from '../lib/seats'
import { turnOutcome } from '../lib/turnOutcome'
import styles from './GameEventLog.module.css'

/** The outcome the AI mark wears. */
const AI_CLUE_OUTCOME = answerMessage({ answerType: 'clue_ai' }).outcome

type Props = {
  clues: ClueEvent[]
  // Every guess, in any order — grouped by turn below. A word can appear twice,
  // once per seat, which is why this is the guess log, not per-word board state.
  guesses: WordedGuess[]
  // Both seated players, with usernames + profile colors — used to resolve a
  // row's seat letter ('A'/'B') back to the person.
  players: Player[]
  // The viewer, so the picker can order them first.
  selfId: string
  // The game's current turn number (`games.turn_number`). Lets a guess-less
  // turn read "(clue given)" while it's still live vs "(no guesses)" once it
  // has ended.
  currentTurn: number
  // Whether the game has ended. A guess-less *current* turn at terminal is no
  // longer in progress, so it reads "(no guesses)", not "(clue given)".
  gameOver: boolean
  // The game's turn budget (`setup.turns`): a turn past it is sudden death.
  turnBudget: number
  // The event whose turn is open in the board viewer — a turn's clue, or a
  // sudden-death guess — or null when live. Its `#N` handle wears the shared
  // viewing ring.
  historyId: number | null
  // Open a turn in the board viewer — click (or Enter/Space) its `#N`. Hands up
  // the handle's event id and the number this log printed, which is what the
  // banner shows back.
  onShowHistory: (eventId: number, n: number) => void
}

/**
 * codenamesduet's event log — its turns rendered with the shared `<EventLog>`
 * table. The outcome bar carries the turn's outcome (see {@link turnOutcome}).
 *
 * **Whose turns** are shown is the shared `useEventLogPlayerPicker` dropdown, one
 * vocabulary across every event-log game — here "Team" plus each of the two
 * players (duet is coop-only). A turn is filed under the person its actor column
 * names — its **clue-giver**, or in sudden death the guesser: picking someone
 * answers "which clues did I give?", not "which words did I guess". That's the
 * useful question, since a duet turn is one clue and the guesses that answered it.
 *
 * The rows are GROUPED by `turn_number` and LINKED by event id, like every other
 * game's log: a turn's handle is its clue's id — the row that exists as soon as
 * the turn does and never changes as guesses land — and a sudden-death row's is
 * its guess's. The `#N` it prints is the turn's place in what is shown, so
 * filtering renumbers it without changing which turn a handle opens.
 *
 * Presentational: the only state is the picker's selection. A turn is **two
 * `<tr>`s** (the row anatomy is the game's — see EventLog.tsx) so the pieces sit in real table
 * columns: row 1 is `[bar] | # | count WORD [AI mark] | clue-giver` (the bar
 * `rowSpan`s the whole turn; the AI mark only on a clue given exactly as the AI
 * suggested it; the `<ActorDot>` right-aligned via the shared `.who` column), and
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
 * **Sudden death** has no clue, and every guess there is a turn of its own —
 * either player may make it — so each is ONE row: "Sudden death: WORD", the word
 * in its key-card color, the guesser in the actor column. Its bar follows the
 * game's rule there: an agent is `won`, anything else `lost`.
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
  turnBudget,
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
  // identity. Both seats are always populated.
  const playerBySeat = new Map<string, Player>(
    players.map((p) => [p.seat, p] as const),
  )

  // Turns may exist in the clue list, the guess list, or both. Union + sort
  // ascending so the oldest turn is at the top; the shared EventLog auto-snaps to
  // the latest.
  const turnNumbers = Array.from(
    new Set([
      ...clues.map((c) => c.turn_number),
      ...guesses.map((g) => g.turn_number),
    ]),
  ).sort((a, b) => a - b)

  // Filtered by CLUE-GIVER (see the docstring), or for a sudden-death turn,
  // which has none, by its guesser — the person its actor column names. By hand
  // rather than through `eventLogPicker.filter`, because the log's unit is a
  // turn number, not a row with a `user_id`.
  const shownTurns = turnNumbers.filter((t) => {
    if (eventLogPicker.showsEveryone) return true
    if (isSuddenDeathTurn(t, turnBudget)) {
      return guesses.some((g) => g.turn_number === t && g.user_id === eventLogPicker.picked)
    }
    const seat = clues.find((c) => c.turn_number === t)?.seat
    return playerBySeat.get(seat ?? '')?.user_id === eventLogPicker.picked
  })

  // The word of a guess, in the key-card color of what it turned over.
  const guessWord = (g: WordedGuess) => (
    <span
      className={cls(
        styles.guessWord,
        g.guess_result === 'G' && styles.guessWord_G,
        g.guess_result === 'N' && styles.guessWord_N,
        g.guess_result === 'A' && styles.guessWord_A,
      )}
    >
      {g.word.toUpperCase()}
    </span>
  )

  return (
    <EventLog
      heading="Clues"
      picker={eventLogPicker}
      shown={shownTurns}
      // An entry here is a TURN, and guesses land inside a turn that already
      // exists (they grow its second row rather than adding one), so counting
      // turns alone would miss the snap.
      entryCount={clues.length + guesses.length}
    >
      {shownTurns.map((t, index) => {
        const n = index + 1
        const clue = clues.find((c) => c.turn_number === t)
        const suddenDeath = isSuddenDeathTurn(t, turnBudget)
        const turnGuesses = guesses.filter((g) => g.turn_number === t)

        if (suddenDeath) {
          // One row per sudden-death turn — one guess, made by either player.
          const g = turnGuesses[0]
          if (!g) return null
          return (
            <tr key={t} className={gameEventLog.divider}>
              <EventLogOutcomeBar outcome={turnOutcome(turnGuesses, { suddenDeath })} />
              <EventLogNumber
                n={n}
                isOpenInHistory={historyId === g.id}
                onShowHistory={() => onShowHistory(g.id, n)}
              />
              <td className={gameEventLog.main}>
                <span className={styles.clueWord}>Sudden death:</span> {guessWord(g)}
              </td>
              <EventLogActor actor={playerBySeat.get(g.seat)} fallback={g.seat} />
            </tr>
          )
        }

        if (!clue) return null
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
                n={n}
                isOpenInHistory={historyId === clue.id}
                onShowHistory={() => onShowHistory(clue.id, n)}
              />
              <td className={gameEventLog.main}>
                <span className={styles.clueWord}>
                  {clue.clue_count} {clue.clue_word.toUpperCase()}
                </span>
                {clue.clue_from_ai && (
                  // The clue is exactly the AI's suggestion — in that answer's
                  // outcome, which `lib/answer.ts` decides. A clue the giver
                  // edited, or thought of alone, wears nothing.
                  <span
                    className={cls(styles.aiClueMark, VERDICT_TONE[AI_CLUE_OUTCOME])}
                    data-tooltip="AI clue"
                  >
                    <IconAI size="1em" aria-hidden />
                  </span>
                )}
              </td>
              <EventLogActor actor={playerBySeat.get(clue.seat)} fallback={clue.seat} />
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
                    <span key={g.id}>
                      {idx > 0 && ' '}
                      {guessWord(g)}
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
