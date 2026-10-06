// cs-unmet

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import {
  InfoActionsRow,
  type InfoActionsMessage,
} from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import type { useSuggestMove } from '../hooks/useSuggestMove'
import type { GActions } from '../reactTypes'
import type { GGameData, GHistoryView, GPlayer } from '../types'
import { GameEventLog } from './GameEventLog'
import { StateLine } from './StateLine'
import { SuggestPanel } from './SuggestPanel'
import shared from '@/common/info-sheet/infoCol.module.css'

/**
 * scrabble's info column, in the canonical order (docs/playarea.md →
 * Info-column readouts): **state → opponents (compete) → turn line → action
 * row → help → suggestions → setup disclosure → event log**. Every command
 * arrives as an action this column places, and the log opens a past turn
 * through `historyView`; PlayArea owns the coordination.
 */
export function InfoCol({
  gd,
  endingMessage,
  actions,
  historyView,
  suggestion,
}: {
  gd: GGameData
  // The ending that applies to me — the game's once it has ended, else mine
  // while the others race on — or null while I play.
  endingMessage: TerminalMessage | null
  actions: GActions
  historyView: GHistoryView
  // Coop's suggester: its panel's state, and the way a picked move is staged.
  suggestion: ReturnType<typeof useSuggestMove>
}) {
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  /** A player's cell in the strip: their score, live — every word was played on
   *  the open board; "out" once they have ended; and their verdict beside it
   *  once the game has ended, the one thing telling a player who conceded from
   *  one who played on and lost. */
  function getScoreOrOut(player: GPlayer) {
    if (gd.ended) {
      const verdict =
        player.outcome === 'won'
          ? 'won'
          : player.conceded
            ? 'conceded'
            : 'lost'
      return `${player.score} (${verdict})`
    }
    if (player.ending !== null) return 'out'
    return `${player.score}`
  }

  // Help on how to lay a move out, while I still may.
  const isHelpShown = gd.me.stillPlaying && !gd.ended

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        <p className={shared.infoState}>
          <StateLine gd={gd}/>
        </p>

        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={gd.me.id}
            metricLabel="Score"
            metricFor={getScoreOrOut}
          />
        )}

        {/* Coop's turn order, when it has one; compete names the turn in its
            state line above. */}
        {gd.coop && gd.turns !== null && (
          <TurnStatusLine
            turnHolder={gd.turns.holder}
            isMyTurn={gd.me.onTurn}
            isGameEnded={gd.ended}
          />
        )}

        {/* One row, one order, every action listed once (docs/playarea.md).
            Each action answers whether it shows. The line is the ending that
            applies to me. ICON-ONLY; the menu is the glyphs' legend. */}
        <InfoActionsRow message={actionRowMessage}>
          <ActionButton action={actions.actSuggestMove} show="icon"/>
          <ActionButton action={actions.actConcede} show="icon"/>
          <ActionButton action={actions.actStopGame} show="icon"/>
          <span className={shared.actionsDivider}/>
          <ActionButton action={actions.actRestart} show="icon"/>
          <ActionButton action={actions.actNewGame} show="icon"/>
          <ActionButton
            action={actions.actBackToClub}
            show="icon"
            weight={gd.ended ? 'primary' : 'secondary'}
          />
        </InfoActionsRow>

        {isHelpShown && (
          <p className={shared.infoHelp}>
            Drag tiles onto the board, or tap a square and type. Arrows move the
            cursor (a sideways
            arrow turns it ↓). Enter plays.
          </p>
        )}

        <SuggestPanel suggestion={suggestion}/>

        {/* Setup — LAST before the log, behind a disclosure. */}
        <SetupDisclosure rows={gd.setupRows}/>
      </div>

      {/* The log scrolls inside its own box, so a growing log never moves
          anything above it. */}
      <GameEventLog
        events={gd.events}
        players={gd.players}
        myId={gd.me.id}
        mode={gd.mode}
        historyView={historyView}
      />
    </div>
  )
}
