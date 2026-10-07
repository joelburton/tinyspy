// cs-unmet

import type { EndingMessage } from '@/common/ending/endingMessage'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { ActionButton } from '@/common/actions/ActionButton'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { WordList } from '@/common/word-list/WordList'
import { makeWordRows } from '../lib/wordRows'
import { StateLine } from './StateLine'
import shared from '@/common/info-sheet/infoCol.module.css'
import type { GActions } from '../reactTypes'
import type { GGameData, GPlayer } from '../types'

/**
 * boggle's info column: the shared readouts in the fixed order
 * (docs/playarea.md → Info-column readouts) — the state line, the opponent
 * strip, the action row, help, setup, then the word list. Every command is an
 * action PlayArea hands down; an action that does not apply draws nothing,
 * which is how one row serves coop and compete.
 */
export function InfoCol({
  gd,
  endingMessage,
  actions,
}: {
  gd: GGameData
  // The ending that applies to me — the game's once it has ended, else mine —
  // or null while I can still play.
  endingMessage: EndingMessage | null
  actions: GActions
}) {
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  // A player's cell in the strip: their score, bonus included; once they are
  // out of play — on their own or with the game — how they came out after it:
  // "40 (won)", "31 (2nd)", "12 (conceded)".
  function getScoreAndResult(player: GPlayer) {
    if (player.endingLabel === null) return player.foundWordsScore
    return `${player.foundWordsScore} (${player.endingLabel.word.toLowerCase()})`
  }

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        <StateLine facts={gd.me} puzzle={gd.puzzle} />

        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={gd.me.id}
            metricLabel="Score"
            metricFor={getScoreAndResult}
          />
        )}

        {/* One row, one order, every action listed once, in the game menu's
            order (docs/playarea.md). Each action answers whether it shows. */}
        <InfoActionsRow message={actionRowMessage}>
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

        {/* Only on my move: once the game is over or I conceded, the entry is
            off and the prompt would misdirect. */}
        {gd.me.onTurn && (
          <p className={shared.infoHelp}>
            Type a word, then Enter, or tap a path of tiles.{' '}
            <kbd>↑</kbd> recalls your last word.
          </p>
        )}

        <SetupDisclosure rows={gd.setupRows} />
      </div>

      <WordList
        rows={makeWordRows(gd)}
        players={gd.players}
        myId={gd.me.id}
        isCompete={gd.compete}
        isGameEnded={gd.ended}
      />
    </div>
  )
}
