// cs-unmet

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { cls } from '@/common/utils/cls'
import type { GActions, GGameData, GHistoryView, GPlayer, GWord } from '../types'
import { GameEventLog } from './GameEventLog'
import { StateLine } from './StateLine'
import shared from '@/common/info-sheet/infoCol.module.css'
import styles from './InfoCol.module.css'

/**
 * strands' info column, in the canonical order (docs/playarea.md → Info-column
 * readouts): **state → opponents (compete) → action row → help → the words'
 * reveal → setup disclosure → event log**. Every command arrives as an action
 * this column places, and the log opens a past turn through `historyView`;
 * PlayArea owns the coordination.
 *
 * The **theme prompt** leads the state region. It is the puzzle's title, not
 * the answer, so it belongs on screen from the first second; putting it
 * anywhere else would imply it had to be earned.
 */
export function InfoCol({
  gd,
  endingMessage,
  actions,
  historyView,
  solution,
}: {
  gd: GGameData
  // The ending that applies to me — the game's once it has ended, else mine
  // while the others race on — or null while I play.
  endingMessage: TerminalMessage | null
  actions: GActions
  historyView: GHistoryView
  // The puzzle words, spangram first, while I have them revealed; else null.
  // The board draws paths and never spells anything out, so without this the
  // reveal makes you read the words off the grid letter by letter.
  solution: GWord[] | null
}) {
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  /** A racer's cell in the strip: hints used, the one number a race publishes;
   *  "out" once they have ended on their own — solved or conceded; and their
   *  verdict once the game has ended. */
  function getHintsOrOut(player: GPlayer) {
    if (gd.ended) {
      const verdict = player.outcome === 'won' ? 'Won' : player.conceded ? 'Conceded' : 'Lost'
      return `${verdict} on ${player.nHintsUsed}`
    }
    if (player.ending !== null) return 'out'
    return player.nHintsUsed
  }

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* InfoCol order is FIXED (docs/playarea.md → Info-column readouts):
            state → opponent strip → action row → help → reveal → setup
            disclosure → log. */}

        {/* Quoted: the prompt is the puzzle's own words, not ours, and unquoted
            it reads as a heading the app wrote. */}
        <p className={styles.clue}>“{gd.puzzle.title}”</p>
        <p className={shared.infoState}>
          <StateLine data={gd.stateLineData} />
        </p>

        {/* Opponent strip (compete). The metric is HINTS USED and nothing else:
            it is the ranking, so it makes the race legible, and it says nothing
            about the puzzle. */}
        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={gd.me.id}
            metricLabel="Hints"
            metricFor={getHintsOrOut}
          />
        )}

        {/* Whose-turn line — ONLY in a turn-order game. Rendering it in a
            free-for-all game would print "Waiting for someone…" forever. */}
        {gd.turns !== null && (
          <TurnStatusLine
            turnHolder={gd.turns.holder}
            isMyTurn={gd.me.onTurn}
            isGameEnded={gd.ended}
          />
        )}

        {/* One row, one order, every action listed once, in the game menu's
            order (docs/playarea.md). Each action answers whether it shows. The
            line is the ending that applies to me — the game's, or mine while
            the others race on. ICON-ONLY; the menu is the glyphs' legend. */}
        <InfoActionsRow message={actionRowMessage}>
          {/* Both exits are placed; each hides itself in the mode that isn't
              its own, and out of the race Stop takes Concede's place. */}
          <ActionButton action={actions.actConcede} show="icon" />
          <ActionButton action={actions.actStopGame} show="icon" />
          {/* Right of the bar is about the END of the game rather than
              playing it; the bar hides itself when nothing is left of it. */}
          <span className={shared.actionsDivider} />
          <ActionButton action={actions.actReveal} show="icon" />
          <ActionButton action={actions.actRestart} show="icon" />
          <ActionButton action={actions.actNewGame} show="icon" />
          {/* Filled once the game has ended: the weight is the placement's
              choice, not the action's (docs/ui.md → What a `<button>` is). */}
          <ActionButton
            action={actions.actBackToClub}
            show="icon"
            weight={gd.ended ? 'primary' : 'secondary'}
          />
        </InfoActionsRow>

        {/* Only on my move: once I can't trace, the instructions would
            contradict the inert board. */}
        {gd.me.onTurn && (
          <p className={shared.infoHelp}>
            Click letters in order — they may touch diagonally. After the first,
            you can type the rest. Press <kbd>Enter</kbd> (or the Submit button)
            to submit; <kbd>⌫</kbd> undoes one.
          </p>
        )}

        {/* The words themselves — the other half of the reveal: a path shows
            you WHERE a word is, never what it says. Spangram first, each
            click-to-define. Comes and goes with the board's gray lines — one
            toggle, one secret (a blessed exception to docs/ui.md → Layout
            stability). */}
        {solution && (
          <p className={cls(shared.terminalExtra, styles.solutionWords)}>
            <span className="muted">Words:</span>{' '}
            {solution.map((w) => (
              <DefinableWord key={w.word} word={w.word} />
            ))}
          </p>
        )}

        {/* Setup — LAST before the log, behind a disclosure. */}
        <SetupDisclosure rows={gd.setupRows} />
      </div>

      <GameEventLog
        events={gd.events}
        players={gd.players}
        myId={gd.me.id}
        mode={gd.mode}
        isGameEnded={gd.ended}
        historyView={historyView}
      />
    </div>
  )
}
