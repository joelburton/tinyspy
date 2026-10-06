// cs-unmet

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import {
  InfoActionsRow,
  type InfoActionsMessage,
} from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import { boardWords, solvedWords } from '../lib/waffle'
import { SolutionReveal } from './SolutionReveal'
import { StateLine } from './StateLine'
import { GameEventLog } from './GameEventLog'
import shared from '@/common/info-sheet/infoCol.module.css'
import type {
  GActions,
  GGameData,
  GHistoryView,
  GLetterTile,
  GPlayer,
} from '../types'

/**
 * waffle's info column: the shared readouts in the fixed order
 * (docs/playarea.md → Info-column readouts) — the swap count, the whose-turn
 * line, the progressive answer, the opponent strip, the action row, help,
 * setup, then the swap log. Every command is an action PlayArea hands down; an
 * action that does not apply draws nothing, which is how one row serves coop
 * and compete, and play and the end.
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
  // while the others race on — for the action row's line; null while I play.
  endingMessage: TerminalMessage | null
  actions: GActions
  historyView: GHistoryView
  // The solution while I have it revealed; null while it stays hidden.
  solution: GLetterTile[] | null
}) {
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  // The six words: all of them while the solution is revealed, else each word
  // I have turned fully green on my own board — already on my screen, so
  // showing it leaks nothing. The rest read as em dashes.
  const answerWords = solution !== null
    ? boardWords(solution)
    : solvedWords(gd.me.board.tiles)

  // A racer who dropped out or ran out of swaps reads "out"; everyone else
  // shows their swaps, a solver waiting on the rest with a ✓.
  function getSwapsOrOut(player: GPlayer) {
    const endedReason = player.ending?.reason
    if (endedReason === 'conceded' || endedReason ===
      'resource_exhausted') return 'out'
    return (
      <>
        {player.nSwapsUsed}
        {player.solved && ' ✓'}
      </>
    )
  }

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* The SAME <StateLine> the mobile status bar renders above the board
            (they must never drift). */}
        <p className={shared.infoState}>
          <StateLine facts={gd.me} puzzle={gd.puzzle}/>
        </p>
        {gd.turns !== null && (
          <TurnStatusLine
            turnHolder={gd.turns.holder}
            isMyTurn={gd.me.onTurn}
            isGameEnded={gd.ended}
          />
        )}

        {/* The answer, revealed progressively: a word shows once you've turned it
            fully green; the rest read as em dashes. Shown throughout the game. */}
        <SolutionReveal words={answerWords}/>

        {/* Each racer's swap COUNT, not their board, which is withheld until the
            game ends. */}
        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={gd.me.id}
            metricLabel="Swaps"
            metricFor={getSwapsOrOut}
          />
        )}

        {/* One row, one order, every action listed once, in the game menu's
            order (docs/playarea.md). Each action answers whether it shows.
            ICON-ONLY — waffle's experiment; the tooltips carry the labels. */}
        <InfoActionsRow message={actionRowMessage}>
          <ActionButton action={actions.actReveal} show="icon"/>
          <ActionButton action={actions.actRestart} show="icon"/>
          <ActionButton action={actions.actNewGame} show="icon"/>
          <ActionButton action={actions.actConcede} show="icon"/>
          <ActionButton action={actions.actStopGame} show="icon"/>
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
          <p className={shared.infoHelp}>Tap two tiles to swap them.</p>
        )}

        <SetupDisclosure rows={gd.setupRows}/>
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
