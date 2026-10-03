// cs-blessed-psychicnum

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import { GameEventLog } from './GameEventLog'
import { StateLine } from './StateLine'
import shared from '@/common/info-sheet/infoCol.module.css'
import type { GGameData, GPlayer, GHistoryView, GActions } from '../types'

/**
 * psychicnum's info column: the shared readouts in the fixed order
 * (docs/playarea.md → Info-column readouts) — the state line, the whose-turn
 * line, the opponent strip, the action row, help, setup, then the event log.
 * Every command is an action PlayArea hands down; an action that does not
 * apply draws nothing, which is how one row serves coop and compete.
 */
export function InfoCol({
  gd,
  myId,
  endingMessage,
  actions,
  historyView,
}: {
  gd: GGameData
  myId: string
  // The ending that applies to me — the game's once it has ended, else mine —
  // or null while I can still play.
  endingMessage: TerminalMessage | null
  actions: GActions
  historyView: GHistoryView
}) {
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  // A player who has ended reads "out"; everyone else shows their progress.
  function getScoreOrOut(player: GPlayer) {
    return player.ending ? 'out' : player.foundSecretsCount
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
        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={myId}
            metricLabel="Found"
            metricFor={getScoreOrOut}
          />
        )}

        {/* One row, one order, every action listed once, in the game menu's
            order (docs/playarea.md). Each action answers whether it shows. */}
        <InfoActionsRow message={actionRowMessage}>
          <ActionButton action={actions.actHint} show="icon" />
          <ActionButton action={actions.actSpoiler} show="icon" />
          {/* Right of the bar is about the END of the game rather than
              playing it; the bar hides itself when nothing is left of it. */}
          <span className={shared.actionsDivider} />
          <ActionButton action={actions.actReveal} show="icon" />
          <ActionButton action={actions.actRestart} show="icon" />
          <ActionButton action={actions.actNewGame} show="icon" />
          <ActionButton action={actions.actConcede} show="icon" />
          <ActionButton action={actions.actStopGame} show="icon" />
          {/* Filled once the game has ended: the weight is the placement's
              choice, not the action's (docs/ui.md → What a `<button>` is). */}
          <ActionButton
            action={actions.actBackToClub}
            show="icon"
            weight={gd.ended ? 'primary' : 'secondary'}
          />
        </InfoActionsRow>

        {/* Only on my move: while I wait the board is inert, and the prompt
            would misdirect. */}
        {gd.me.onTurn && (
          <p className={shared.infoHelp}>Click on or type a word and hit submit.</p>
        )}

        <SetupDisclosure rows={gd.setupRows} />
      </div>

      <GameEventLog
        events={gd.events}
        players={gd.players}
        myId={myId}
        mode={gd.mode}
        isGameEnded={gd.ended}
        historyView={historyView}
      />
    </div>
  )
}
