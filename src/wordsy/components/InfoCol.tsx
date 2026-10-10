// cs-unmet

import type { EndingMessage } from '@/common/ending/endingMessage'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import type { GActions, GGameData, GHistoryView, GPlayer } from '../types'
import { GameEventLog } from './GameEventLog'
import { StateLine } from './StateLine'
import shared from '@/common/info-sheet/infoCol.module.css'

/**
 * wordsy's info column, in the canonical order (docs/playarea.md →
 * Info-column readouts): state → opponents → action row → setup disclosure →
 * event log. Every command arrives as an action this column places, and the
 * log opens a past round through `historyView`; PlayArea owns the
 * coordination.
 */
export function InfoCol({
  gd,
  endingMessage,
  actions,
  historyView,
}: {
  gd: GGameData
  // The ending that applies to me — the game's once it has ended, else mine
  // once I have conceded — or null while I play.
  endingMessage: EndingMessage | null
  actions: GActions
  historyView: GHistoryView
}) {
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  /** A player's cell in the strip: their total; "in" after it while their
   *  word stands for the round in play; once they are out of play, how they
   *  came out: "46 (won)", "31 (2nd)", "12 (conceded)". */
  function getTotalAndStatus(player: GPlayer) {
    if (player.endingLabel !== null) {
      return `${player.total} (${player.endingLabel.word.toLowerCase()})`
    }
    return player.hasSubmitted ? `${player.total} in` : `${player.total}`
  }

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        <p className={shared.infoState}>
          <StateLine gd={gd}/>
        </p>

        <OpponentStrip
          players={gd.players}
          myId={gd.me.id}
          metricLabel="Total"
          metricFor={getTotalAndStatus}
        />

        {/* One row, one order, every action listed once (docs/playarea.md).
            Each action answers whether it shows. ICON-ONLY; the menu is the
            glyphs' legend. */}
        <InfoActionsRow message={actionRowMessage}>
          <ActionButton action={actions.actConcede} show="icon"/>
          <ActionButton action={actions.actStopGame} show="icon"/>
          <span className={shared.actionsDivider}/>
          <ActionButton action={actions.actRestart} show="icon"/>
          <ActionButton action={actions.actNewGame} show="icon"/>
          {/* Filled once the game has ended: the weight is the placement's
              choice, not the action's (docs/ui.md → What a `<button>` is). */}
          <ActionButton
            action={actions.actBackToClub}
            show="icon"
            weight={gd.ended ? 'primary' : 'secondary'}
          />
        </InfoActionsRow>

        <SetupDisclosure rows={gd.setupRows}/>
      </div>

      {/* The log scrolls inside its own box, so a growing log never moves
          anything above it. */}
      <GameEventLog
        events={gd.events}
        players={gd.players}
        myId={gd.me.id}
        isGameEnded={gd.ended}
        historyView={historyView}
      />
    </div>
  )
}
