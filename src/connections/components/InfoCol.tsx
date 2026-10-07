// cs-blessed-connections

import type { EndingMessage } from '@/common/ending/endingMessage'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import { GameEventLog } from './GameEventLog'
import { HintList } from './HintList'
import { StateLine } from './StateLine'
import shared from '@/common/info-sheet/infoCol.module.css'
import type { GActions, GGameData, GHistoryView, GPlayer } from '../types'

/**
 * connections' info column: the shared readouts in the fixed order
 * (docs/playarea.md → Info-column readouts) — the state line, the whose-turn
 * line, the opponent strip, the action row with the hint list under it, help,
 * setup, then the event log. Every command is an action PlayArea hands down;
 * an action that does not apply draws nothing, which is how one row serves
 * coop and compete.
 */
export function InfoCol({
  gd,
  endingMessage,
  actions,
  historyView,
  hintsOpen,
}: {
  gd: GGameData
  // The ending that applies to me — the game's once it has ended, else mine —
  // or null while I can still play.
  endingMessage: EndingMessage | null
  actions: GActions
  historyView: GHistoryView
  // The Hints action has unfolded the hint list.
  hintsOpen: boolean
}) {
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  // A player's cell in the strip: the categories they have found; once they
  // are out of play — on their own or with the game — how they came out after
  // it: "4 (won)", "2 (lost)", "1 (conceded)".
  function getScoreAndResult(player: GPlayer) {
    if (player.endingLabel === null) return player.nMatchedCats
    return `${player.nMatchedCats} (${player.endingLabel.word.toLowerCase()})`
  }

  // The list stays mounted while folded, so a hint taken stays shown across
  // toggles; it folds for good once I can no longer submit.
  const isHintListShown = hintsOpen && gd.me.stillPlaying

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        <p className={shared.infoState}>
          <StateLine facts={gd.me} />
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
            myId={gd.me.id}
            metricLabel="Found"
            metricFor={getScoreAndResult}
          />
        )}

        {/* One row, one order, every action listed once, in the game menu's
            order (docs/playarea.md). Each action answers whether it shows. */}
        <InfoActionsRow message={actionRowMessage}>
          <ActionButton action={actions.actHint} show="icon" aria-pressed={hintsOpen} />
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
        <HintList cats={gd.puzzle.cats} open={isHintListShown} />

        {/* Only on my move: while I wait the board is inert, and the prompt
            would misdirect. */}
        {gd.me.onTurn && (
          <p className={shared.infoHelp}>Pick 4 tiles that share a category, then Submit.</p>
        )}

        <SetupDisclosure rows={gd.setupRows} />
      </div>

      <GameEventLog
        events={gd.events}
        cats={gd.puzzle.cats}
        players={gd.players}
        myId={gd.me.id}
        mode={gd.mode}
        isGameEnded={gd.ended}
        historyView={historyView}
      />
    </div>
  )
}
