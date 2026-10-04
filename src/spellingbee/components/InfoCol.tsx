// cs-blessed-spellingbee

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { ActionButton } from '@/common/actions/ActionButton'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { WordList } from '@/common/word-list/WordList'
import { RANKS } from '@/shared/rank-ladder/rankLadder'
import { RankBar } from '@/shared/rank-ladder/RankBar'
import { Stats } from '@/shared/rank-ladder/Stats'
import { makeWordRows } from '../lib/wordRows'
import shared from '@/common/info-sheet/infoCol.module.css'
import type { GActions, GGameData, GPlayer } from '../types'

/**
 * spellingbee's info column: the shared readouts in the fixed order
 * (docs/playarea.md → Info-column readouts) — the rank ladder and the figures,
 * the opponent strip, the action row, setup, then the word list. There is no
 * help line. Every command is an action PlayArea hands down; an action that
 * does not apply draws nothing, which is how one row serves coop and compete.
 */
export function InfoCol({
  gd,
  myId,
  endingMessage,
  actions,
}: {
  gd: GGameData
  myId: string
  // The ending that applies to me — the game's once it has ended, else mine —
  // or null while I can still play.
  endingMessage: TerminalMessage | null
  actions: GActions
}) {
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  // A racer's cell in the strip: their rank; a conceder reads "out" while the
  // race runs, and once it has ended the outcome verb leads so the two
  // "no longer active" states read differently — "Conceded at Amazing" vs
  // "Lost at Amazing" vs "Won at Genius".
  function getRankOrOut(player: GPlayer) {
    const rank = RANKS[player.rankIdx]
    if (!gd.ended) return player.conceded ? 'out' : rank
    const verb = player.outcome === 'won' ? 'Won' : player.conceded ? 'Conceded' : 'Lost'
    return `${verb} at ${rank}`
  }

  const readout = gd.stateLineData
  const wordRows = makeWordRows(gd)

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        <RankBar score={readout.foundWordsScore} total={readout.reqdWordsScore} targetIdx={readout.targetRankIdx} />
        <Stats
          foundWordsScore={readout.foundWordsScore}
          requiredWordsScore={readout.reqdWordsScore}
          foundWordsCount={readout.nFoundWords}
          requiredWordsCount={readout.nReqdWords}
        />

        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={myId}
            metricLabel="Rank"
            leading={
              <>
                {/* A race always has a target. */}
                target: <strong>{RANKS[gd.me.targetRankIdx!]}</strong>
              </>
            }
            metricFor={getRankOrOut}
          />
        )}

        {/* One row, one order, every action listed once, in the game menu's
            order (docs/playarea.md). Each action answers whether it shows. */}
        <InfoActionsRow message={actionRowMessage}>
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

        <SetupDisclosure rows={gd.setupRows} />
      </div>

      {/* The words ship from game start, so the missed-words reveal is gated on
          the ending: `wordRows` carries them only then. */}
      <WordList
        rows={wordRows}
        players={gd.players}
        myId={myId}
        isCompete={gd.compete}
        isTerminal={gd.ended}
        hasBonus={!gd.puzzle.sameBandsAndHaveNoBonus}
      />
    </div>
  )
}
