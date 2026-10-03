// cs-blessed-connections

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { GameEventLog } from './GameEventLog'
import { HintList } from './HintList'
import { StateLine } from './StateLine'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import shared from '@/common/info-sheet/infoCol.module.css'
import type { GActions, GGameData, GHistoryView } from '../types'

/**
 * connections' info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/playarea.md → Info-column readouts): state readout →
 * whose-turn line (turn-order) → OpponentStrip (compete) → action row → the hint
 * list → help → setup disclosure → event log. Every command is an ACTION the
 * PlayArea handed down (`actHint`, `actStopGame`, …), so this column places buttons
 * and decides nothing about them — an action that does not apply here draws
 * nothing, which is how one row serves coop and compete. What is a callback is
 * what isn't a command: opening a past turn in the history viewer. Prop names match the other
 * games' columns for the same idea (docs/playarea.md).
 */
export function InfoCol({
  gd,
  myId,
  endingMessage,
  actions,
  historyView,
  hintsOpen,
}: {
  gd: GGameData
  myId: string
  // The ending that applies to me — the game's once it has ended, else mine
  // while the others play on — for the action row's line; null while I play.
  endingMessage: TerminalMessage | null
  actions: GActions
  historyView: GHistoryView
  // Is the inline hint list unfolded? The Hints action toggles this.
  hintsOpen: boolean
}) {

  // The row's line, and the only thing that varies between states: the ending
  // that applies to me, and nothing at all while I can still play.
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* State — categories found + mistakes, as text; the marks are the
            board column's, on the commit row. */}
        <p className={shared.infoState}>
          <StateLine data={gd.stateLineData} />
        </p>
        {/* Whose-turn line — only for a turn-order game. A separate line below
            the state readout; never replaces it. */}
        {gd.turns !== null && (
          <TurnStatusLine
            turnHolder={gd.turns.holder}
            isMyTurn={gd.me.onTurn}
            isGameEnded={gd.ended}
          />
        )}

        {/* Opponent strip (compete) — the race comparison: each player's categories
            matched. */}
        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={myId}
            metricLabel="Found"
            // A racer who conceded reads 'out' (their count is frozen and no
            // longer part of the race); everyone else shows their live count.
            metricFor={(p) =>
              p.ending?.reason === 'conceded' ? 'out' : p.nMatchedCats
            }
          />
        )}

        {/* ONE row, one order, every action listed once. Which of them is on
            screen right now is each action's own answer — `<ActionButton>` draws
            nothing for an action that says it is hidden — so no branch here can
            disagree with what the menu shows. The game menu lists the same
            actions in this same order (docs/playarea.md). */}
        <InfoActionsRow message={actionRowMessage}>
          <ActionButton action={actions.actHint} show="icon" aria-pressed={hintsOpen} />
          <span className={shared.actionsDivider} />
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
        {/* The per-player hint reveals — unfolds right under the action row when
            Hints is on; stays mounted (so revealed tiles persist across toggles),
            and folds with the Hints button once you can no longer submit. */}
        <HintList cats={gd.puzzle.cats} open={hintsOpen && gd.me.stillPlaying} />

        {/* Help — shown only while you are in the game (never silently swaps);
            the eliminated state is carried loudly by the action row above. */}
        {gd.me.stillPlaying && (
          <p className={shared.infoHelp}>Pick 4 tiles that share a category, then Submit.</p>
        )}

        {/* Setup — last, behind a disclosure (closed by default so it doesn't claim
            space). */}
        <SetupDisclosure rows={gd.setupRows} />
      </div>

      {/* Event log. Coop shows the whole shared game; compete gets the shared
          "whose guesses?" picker — an opponent's rows are withheld during play
          (`useGame`'s seat rule) and open at the end, so the picker is how you
          compare lines afterwards. */}
      <GameEventLog
        guesses={gd.events}
        cats={gd.puzzle.cats}
        players={gd.players}
        myId={myId}
        mode={gd.mode}
        isGameEnded={gd.ended}
        historyId={historyView.viewedEventId}
        onShowHistory={historyView.show}
      />
    </div>
  )
}
