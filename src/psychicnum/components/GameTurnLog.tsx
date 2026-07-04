import type { KeyboardEvent, MouseEvent } from 'react'
import { TurnLogActor } from '../../common/components/TurnLogActor'
import { cls } from '../../common/lib/cls'
import { memberById } from '../../common/lib/peers'
import { useDefinePopover } from '../../common/hooks/useDefinePopover'
import { TurnLog, TurnLogBar, TurnLogNumber } from '../../common/components/TurnLog'
import turnLog from '../../common/components/TurnLog.module.css'
import type { Player, PsychicnumGuess } from '../hooks/useGame'
import styles from './GameTurnLog.module.css'

type Props = {
  guesses: PsychicnumGuess[]
  players: Player[]
  /** Turn-history: the turn currently open in the board viewer (by log position),
   *  or null when live. Its `#N` handle wears the shared yellow ring. */
  viewingTurn: number | null
  /** Open a turn in the board viewer (click its `#N`). */
  onSelectTurn: (index: number) => void
}

/**
 * psychicnum's turn log — its turns (guesses, hints, reveals) rendered with the
 * shared `<TurnLog>` table. (Named GameTurnLog, not GuessHistory: it's this
 * game's turn log, and a turn isn't always a guess — see TurnLog.tsx.)
 *
 * Stateless and presentational — owns no state, makes no RPC calls, just renders
 * the rows from the props it's given, newest snapping into view.
 *
 * Each turn is a single `<tr>` psychicnum renders itself (the row anatomy is the
 * game's — see TurnLog.tsx): the shared `<TurnLogBar>` cell, then the turn number
 * (muted), the word (bold — the important part), the result, and the actor
 * (right-aligned with their identity dot, so the dots line up down the column).
 * Cells use `<TurnLog>`'s content classes so they match other games' logs; the
 * `.turnLogDivider` class on each row draws the between-turns line (suppressed on
 * the first by `:first-child`).
 *
 * Three row kinds:
 *   - a **guess** → green (correct) / red (incorrect) outcome bar; word + result.
 *   - a **reveal** (a revealed answer) → amber bar; word + "Answer".
 *   - a **hint** (a clue) → amber bar; the word+result columns are **replaced by
 *     a single colspan** cell "Hint: <clue>" (the row carries the clue text, not
 *     a word).
 *
 * In compete mode RLS scopes all to the caller, so this shows only the viewer's
 * own attempts + helpers.
 */
export function GameTurnLog({ guesses, players, viewingTurn, onSelectTurn }: Props) {
  // The actor's identity cell — shared by every row kind. The shared
  // <TurnLogActor> is the right-aligned `.who` <td> wrapping the name + disc;
  // this local helper just resolves the userId to a member first.
  const whoCell = (userId: string) => (
    <TurnLogActor actor={memberById(players, userId)} />
  )

  // Click-to-define (a common feature — see common/hooks/useDefinePopover). The
  // guessed / revealed word is a real dictionary word, so it's definable; a HINT
  // row's `word` is a clue sentence, so it is NOT wired up.
  const { define, popover } = useDefinePopover()
  const defineProps = (word: string) => ({
    className: styles.definable,
    role: 'button' as const,
    tabIndex: 0,
    title: 'Click to define',
    onClick: (e: MouseEvent<HTMLSpanElement>) => define(word.toLowerCase(), e.currentTarget),
    onKeyDown: (e: KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        define(word.toLowerCase(), e.currentTarget)
      }
    },
  })

  return (
    <>
    <TurnLog
      heading="Turns"
      empty={guesses.length === 0}
      emptyText="No turns yet."
      scrollKey={guesses}
    >
      {guesses.map((g, i) => {
        // Hint: the word + result columns collapse into one colspan cell, since
        // the row carries a clue sentence, not a word + a one-word result.
        if (g.kind === 'hint') {
          return (
            <tr key={g.id} className={turnLog.turnLogDivider}>
              <TurnLogBar outcome="partial" />
              <TurnLogNumber n={i + 1} viewing={viewingTurn === i} onSelect={() => onSelectTurn(i)} />
              {/* The hint sentence spans the word+result columns; it's the row's
                  main column (absorbs the slack so `who` stays snug). */}
              <td colSpan={2} className={cls(turnLog.main, styles.hint)}>
                <span className={turnLog.meta}>Hint:</span> {g.word}
              </td>
              {whoCell(g.user_id)}
            </tr>
          )
        }
        // Guess (good/bad) or reveal (amber, the answer).
        const isReveal = g.kind === 'reveal'
        return (
          <tr key={g.id} className={turnLog.turnLogDivider}>
            <TurnLogBar outcome={isReveal ? 'partial' : g.was_correct ? 'good' : 'bad'} />
            <TurnLogNumber n={i + 1} viewing={viewingTurn === i} onSelect={() => onSelectTurn(i)} />
            {/* word = sized-to-fit (`.other`) + the bold lead look (`.primary`);
                result = the main column, absorbing the slack so the word + result
                stay clustered and `who` sits snug at the right. */}
            <td className={cls(turnLog.other, turnLog.primary)}>
              <span {...defineProps(g.word)}>{g.word.toUpperCase()}</span>
            </td>
            <td className={turnLog.main}>{isReveal ? 'Answer' : g.was_correct ? 'Correct' : 'Incorrect'}</td>
            {whoCell(g.user_id)}
          </tr>
        )
      })}
    </TurnLog>
    {popover}
    </>
  )
}
