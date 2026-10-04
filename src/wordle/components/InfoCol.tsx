// cs-blessed-wordle

import { cls } from '@/common/utils/cls'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { GameEventLog } from './GameEventLog'
import { StateLine } from './StateLine'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import shared from '@/common/info-sheet/infoCol.module.css'
import styles from './InfoCol.module.css'
import type { GActions, GGameData, GHistoryView, GPlayer } from '../types'

/**
 * wordle's info column: the shared readouts in the fixed order
 * (docs/playarea.md → Info-column readouts) — the guess count, the whose-turn
 * line, the opponent strip, the action row, help, the answer once revealed,
 * setup, then the event log. Every command is an action PlayArea hands
 * down; an action that does not apply draws nothing, which is how one row
 * serves coop and compete.
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
  // while the others play on — for the action row's line; null while I play.
  endingMessage: TerminalMessage | null
  actions: GActions
  historyView: GHistoryView
  // The answer to DISPLAY, or null while it stays hidden — which is the default
  // once a game ends that this viewer did not solve.
  solution: string | null
}) {
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  // A player who dropped out or ran out of guesses reads "out"; everyone else,
  // a solver waiting on the rest included, shows their guesses.
  function getGuessesOrOut(player: GPlayer) {
    const endedReason = player.ending?.reason
    if (endedReason === 'conceded' || endedReason === 'resource_exhausted') return 'out'
    return player.nGuessesUsed
  }

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        <p className={shared.infoState}>
          <StateLine data={gd.stateLineData} />
        </p>
        {gd.turns !== null && (
          <TurnStatusLine
            turnHolder={gd.turns.holder}
            isMyTurn={gd.me.onTurn}
            isGameEnded={gd.ended}
          />
        )}

        {/* Each player's guess COUNT, not their letters, which are withheld
            until the game ends. */}
        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={gd.me.id}
            metricLabel="Guesses"
            metricFor={getGuessesOrOut}
          />
        )}

        {/* One row, one order, every action listed once, in the game menu's
            order (docs/playarea.md). Each action answers whether it shows. */}
        <InfoActionsRow message={actionRowMessage}>
          <ActionButton action={actions.actReveal} show="icon" />
          <ActionButton action={actions.actRestart} show="icon" />
          <ActionButton action={actions.actNewGame} show="icon" />
          <ActionButton action={actions.actConcede} show="icon" />
          <ActionButton action={actions.actStopGame} show="icon" />
          <ActionButton
            action={actions.actBackToClub}
            show="icon"
            weight={gd.ended ? 'primary' : 'secondary'}
          />
        </InfoActionsRow>

        {/* Only on my move: while I wait the board is inert, and the prompt
            would misdirect. */}
        {gd.me.onTurn && (
          <p className={shared.infoHelp}>Type a 5-letter word, then Enter.</p>
        )}

        {/* The word shows here and nowhere else — the below-board pill is a
            one-line ellipsizing row with the verdict in it, and this has the
            room to be a sentence and a click-to-define target. The region grows
            when the viewer opens it and gives the space back when they close it,
            a blessed exception to docs/ui.md → Layout stability. */}
        {solution !== null && (
          <div className={shared.terminalExtra}>
            <p className={cls(shared.infoState, styles.answerLine)}>
              The answer was <DefinableWord word={solution} className={styles.answerReveal} />
            </p>
          </div>
        )}

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
