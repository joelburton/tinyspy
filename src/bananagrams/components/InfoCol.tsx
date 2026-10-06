// cs-unmet

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { ActionButton } from '@/common/actions/ActionButton'
import {
  InfoActionsRow,
  type InfoActionsMessage,
} from '@/common/info-sheet/InfoActionsRow'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import type { GActions, GEditingBoard } from '../reactTypes'
import type { GGameData } from '../types'
import { HandBox } from './HandBox'
import { PeersStrip } from './PeersStrip'
import { StateLine } from './StateLine'
import shared from '@/common/info-sheet/infoCol.module.css'

/**
 * bananagrams' info column. Its order is a documented exception to the
 * canonical one (docs/playarea.md → Info-column readouts): **state →
 * opponents → help → setup disclosure → the HAND box → the action row**,
 * because the hand and Peel live here rather than in the board column
 * (docs/games/bananagrams.md), so the actions sit below them. It arranges the
 * pieces and owns no input: the hand box's drags and the Peel are the editing
 * board's, which `EditingBoard` holds.
 */
export function InfoCol({
  gd,
  editing,
  actions,
  endingMessage,
}: {
  gd: GGameData
  // My board as I edit it, with the hand derived from it and the actions on
  // both; the hand box and the Peel button draw from it.
  editing: GEditingBoard
  actions: GActions
  // The ending that applies to me — the game's once it has ended, else mine
  // while the others race on — or null while I play.
  endingMessage: TerminalMessage | null
}) {
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        <p className={shared.infoState}>
          <StateLine facts={gd.me} />
        </p>

        {/* Opponents — bananagrams keeps its own vertical, closest-to-done
            strip (a race affordance the horizontal OpponentStrip can't
            express). Renders nothing in solo. */}
        <PeersStrip players={gd.players} myId={gd.me.id} />

        {/* Only on my move: once I am out or the game is over the board is
            inert, and the prompt would misdirect. */}
        {gd.me.onTurn && (
          <p className={shared.infoHelp}>
            Drag tiles or click a cell and type. Peel when your hand is empty.
          </p>
        )}

        <SetupDisclosure rows={gd.setupRows} />
      </div>

      <HandBox editing={editing} showDumpZone={gd.me.stillPlaying} />

      {/* One row, one order, every action listed once. Each action answers
          whether it shows. Check words sits left of Peel: it is the question
          you ask before the move on its right. */}
      <InfoActionsRow message={actionRowMessage}>
        <ActionButton action={editing.actCheckBoard} show="icon" />
        <ActionButton action={editing.actPeel} show="both" />
        {/* Right of the bar is about the END of the game rather than
            playing it; the bar hides itself when nothing is left of it. */}
        <span className={shared.actionsDivider} />
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
    </div>
  )
}
