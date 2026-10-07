// cs-blessed-codenamesduet

import { Fragment } from 'react'
import {
  EventLog,
  EventLogActor,
  EventLogOutcomeBar,
  EventLogNumber,
} from '@/common/event-log/EventLog'
import gameEventLog from '@/common/event-log/gameEventLog.module.css'
import {
  useEventLogPlayerPicker,
} from '@/common/event-log/useEventLogPlayerPicker'
import { cls } from '@/common/utils/cls'
import { IconAI } from '@/common/icons/icons'
import {
  OUTCOME_TO_VERDICT_CLASS,
} from '@/common/game-page/outcomeToVerdictClass'
import { answerMessage } from '../lib/answer'
import { turnOutcome } from '../lib/turnOutcome'
import type { GClueEvent, GGuessEvent, GHistoryView, GPlayer } from '../types'
import styles from './GameEventLog.module.css'

/** The outcome the AI mark wears. */
const AI_CLUE_OUTCOME = answerMessage({ answerType: 'clue_ai' }).outcome

type Props = {
  // Every clue, and every guess with the word on its tile, in order.
  clues: GClueEvent[]
  guesses: GGuessEvent[]
  // Both players, for the picker.
  players: GPlayer[]
  // The viewer, so the picker can order them first.
  myId: string
  // The turn being played: a guess-less turn reads "(clue given)" while it is
  // this one and the game runs, and "(no guesses)" once it has ended.
  turnNum: number
  isGameEnded: boolean
  // A turn's `#N` opens it on the board, and wears the shared viewing ring
  // while it is open.
  historyView: GHistoryView
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
 * The rows are GROUPED by turn and LINKED by event id, like every other
 * game's log: a turn's handle is its clue's id — the row that exists as soon as
 * the turn does and never changes as guesses land — and a sudden-death row's is
 * its guess's. The `#N` it prints is the turn's place in what is shown, so
 * filtering renumbers it without changing which turn a handle opens.
 *
 * Presentational: the only state is the picker's choice. A turn is **two
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
 * distinguished by the turn being played and the game's end, since both look identical in the
 * data (a clue, no guess rows). All grouping is client-side (the data set is
 * tiny); the shared `<EventLog>` snaps to the latest row.
 *
 * **Sudden death** has no clue, and every guess there is a turn of its own —
 * either player may make it — so each is ONE row: "Sudden death: WORD", the word
 * in its key-card color, the guesser in the actor column. Its bar follows the
 * game's rule there: an agent is `won`, anything else `lost`.
 *
 * **Turn-history:** the turn's `#N` handle (the shared `<EventLogNumber>`) opens that
 * turn on the board (`useHistoryView`) and rings itself in the history
 * blue while open. The click + marker live on the number, not the row, precisely because a
 * codenamesduet turn is TWO `<tr>`s — a whole-turn outline would draw a broken box
 * and a per-row hover would light only half of it (see `<EventLogNumber>`).
 */
export function GameEventLog({
  clues,
  guesses,
  players,
  myId,
  turnNum,
  isGameEnded,
  historyView,
}: Props) {
  const eventLogPicker = useEventLogPlayerPicker({
    players,
    myId,
    mode: 'coop',
    // Coop: every clue and guess is shared, so nothing is ever RLS-hidden and
    // the honest-hidden empty text can't apply.
    isGameEnded: true,
    label: 'Whose clues to show',
    emptyLabel: 'No clues yet.',
  })
  // Turns may exist in the clue list, the guess list, or both. Union + sort
  // ascending so the oldest turn is at the top; the shared EventLog auto-snaps to
  // the latest.
  const turnNumbers = Array.from(
    new Set([
      ...clues.map((c) => c.turnNum),
      ...guesses.map((g) => g.turnNum),
    ]),
  ).sort((a, b) => a - b)
  // The turns played in sudden death, as the builder marked their guesses.
  const suddenDeathTurns =
    new Set(guesses.filter((g) => g.suddenDeath).map((g) => g.turnNum))

  // Filtered by CLUE-GIVER (see the docstring), or for a sudden-death turn,
  // which has none, by its guesser — the person its actor column names. By hand
  // rather than through `eventLogPicker.filter`, because the log's unit is a
  // turn number, not a row with a player.
  const shownTurns = turnNumbers.filter((t) => {
    if (eventLogPicker.showsEveryone) return true
    if (suddenDeathTurns.has(t)) {
      return guesses.some((g) => g.turnNum === t && g.by.id ===
        eventLogPicker.picked)
    }
    return clues.find((c) => c.turnNum === t)?.by.id === eventLogPicker.picked
  })

  // The word of a guess, in the key-card color of what it turned over.
  const guessWord = (g: GGuessEvent) => (
    <span
      className={cls(
        styles.guessWord,
        g.result === 'G' && styles.guessWord_G,
        g.result === 'N' && styles.guessWord_N,
        g.result === 'A' && styles.guessWord_A,
      )}
    >
      {g.word}
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
        const clue = clues.find((c) => c.turnNum === t)
        const suddenDeath = suddenDeathTurns.has(t)
        const turnGuesses = guesses.filter((g) => g.turnNum === t)

        if (suddenDeath) {
          // One row per sudden-death turn — one guess, made by either player.
          const g = turnGuesses[0]
          if (!g) return null
          return (
            <tr key={t} className={gameEventLog.divider}>
              <EventLogOutcomeBar
                outcome={turnOutcome(turnGuesses, { suddenDeath })}/>
              <EventLogNumber
                n={n}
                isOpenInHistory={historyView.viewedEventId === g.id}
                onShowHistory={() => historyView.show(g.id, n)}
              />
              <td className={gameEventLog.main}>
                <span
                  className={styles.clueWord}>Sudden death:</span> {guessWord(g)}
              </td>
              <EventLogActor actor={g.by}/>
            </tr>
          )
        }

        if (!clue) return null
        // A guess-less turn is still "in progress" (clue given, guesser yet to
        // act) only while it's the current turn AND the game is live; otherwise
        // it ended empty (a pass). See the docstring.
        const inProgress = turnGuesses.length === 0 && t === turnNum &&
          !isGameEnded
        return (
          <Fragment key={t}>
            {/* Row 1, real columns: [bar ⇣rowSpan 2] | #N handle (<EventLogNumber>) | count
                WORD (`.main`, absorbs the slack) | clue-giver (<EventLogActor>, shrinks to
                the username). `.divider` draws the line above this turn
                (suppressed on the first); `.entryHead`/`.entryCont` hug the two rows
                together. The `#N` handle is the turn-viewer control (see the note). */}
            <tr className={cls(gameEventLog.divider, gameEventLog.entryHead)}>
              <EventLogOutcomeBar outcome={turnOutcome(turnGuesses)}
                                  rowSpan={2}/>
              <EventLogNumber
                n={n}
                isOpenInHistory={historyView.viewedEventId === clue.id}
                onShowHistory={() => historyView.show(clue.id, n)}
              />
              <td className={gameEventLog.main}>
                <span className={styles.clueWord}>
                  {clue.clueCount} <span
                  className={styles.clueText}>{clue.clueWord}</span>
                </span>
                {clue.clueFromAi && (
                  // The clue is exactly the AI's suggestion — in that answer's
                  // outcome, which `lib/answer.ts` decides. A clue the giver
                  // edited, or thought of alone, wears nothing.
                  <span
                    className={cls(styles.aiClueMark,
                      OUTCOME_TO_VERDICT_CLASS[AI_CLUE_OUTCOME])}
                    data-tooltip="AI clue"
                  >
                    <IconAI size="1em" aria-hidden/>
                  </span>
                )}
              </td>
              <EventLogActor actor={clue.by}/>
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
