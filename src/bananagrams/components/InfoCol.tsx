// cs-unmet

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { ActionButton } from '@/common/actions/ActionButton'
import {
  InfoActionsRow,
  type InfoActionsMessage,
} from '@/common/info-sheet/InfoActionsRow'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { cls } from '@/common/utils/cls'
import type { GActions, GBoardEditor } from '../reactTypes'
import type { GGameData } from '../types'
import { HandCard } from './HandCard'
import { PeersStrip } from './PeersStrip'
import shared from '@/common/info-sheet/infoCol.module.css'

/**
 * bananagrams' info column. Its order is a documented exception to the
 * canonical one (docs/playarea.md → Info-column readouts): **state →
 * opponents → help → setup disclosure → the HAND card → the action row**,
 * because the hand and Peel live here rather than in the board column
 * (docs/games/bananagrams.md), so the actions sit below them. It arranges the
 * pieces and owns no input: the hand card's drags and the Peel are the board
 * editor's, which `PlayerBoard` holds.
 */
export function InfoCol({
  gd,
  editor,
  actions,
  endingMessage,
}: {
  gd: GGameData
  // My board as I edit it, with the hand derived from it and the actions on
  // both; the hand card and the Peel button draw from it.
  editor: GBoardEditor
  actions: GActions
  // The ending that applies to me — the game's once it has ended, else mine
  // while the others race on — or null while I play.
  endingMessage: TerminalMessage | null
}) {
  const sld = gd.stateLineData
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  // The board responds to me: not once the game is over or I am out of it.
  const isBoardInteractive = gd.me.stillPlaying

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* State — the shared bunch (the race resource everyone watches) and
            how many tiles I hold; the bag count shows when the game isn't on a
            full bunch (a reduced bunch or dump-to-bag sets tiles aside). */}
        <p className={shared.infoState}>
          <b>Tiles: </b>
          You: <strong>{sld.nTiles}</strong>
          {' · '}
          Bunch: <strong>{sld.nBunchTiles}</strong>
          {sld.nBagTiles > 0 && (
            <>
              {' · '}
              Bag: <strong>{sld.nBagTiles}</strong>
            </>
          )}
        </p>

        {/* Opponents — bananagrams keeps its own vertical, closest-to-done
            strip (a race affordance the horizontal OpponentStrip can't
            express). Renders nothing in solo. */}
        <PeersStrip players={gd.players} myId={gd.me.id} />

        {/* Help — only while I can still act. */}
        {isBoardInteractive && (
          <p className={shared.infoHelp}>
            Drag tiles or click a cell and type. Peel when your hand is empty.
          </p>
        )}

        <SetupDisclosure rows={gd.setupRows} />
      </div>

      <HandCard editor={editor} isBoardInteractive={isBoardInteractive} />

      {/* The bottom action row: natural-width buttons side by side. While
          playing: [Concede / Stop game] [Check words] [Peel], Peel the primary
          move on the right. Check words sits LEFT of Peel: it is the question
          you ask before the move on its right. Each action says whether it
          draws; at the end, or out of the race, the row is the ending's line
          and the exits. */}
      <div className={cls(shared.infoActions, !isBoardInteractive && shared.terminalActions)}>
        {gd.ended ? (
          <InfoActionsRow message={actionRowMessage}>
            <ActionButton action={actions.actNewGame} show="icon" />
            <ActionButton action={actions.actBackToClub} show="icon" weight="primary" />
          </InfoActionsRow>
        ) : !isBoardInteractive ? (
          <InfoActionsRow message={actionRowMessage}>
            {/* Both exits are placed and each says whether it applies: out of
                the race, Concede hides and Stop comes out in its place. */}
            <ActionButton action={actions.actConcede} show="icon" />
            <ActionButton action={actions.actStopGame} show="icon" />
          </InfoActionsRow>
        ) : (
          // Both exits are placed, but only Concede draws while I am racing:
          // its question offers stopping the table as the second answer.
          <>
            <ActionButton action={actions.actStopGame} show="icon" />
            <ActionButton action={actions.actConcede} show="icon" />
          </>
        )}
        <ActionButton action={editor.actCheckBoard} show="icon" />
        <ActionButton action={editor.actPeel} show="both" />
      </div>
    </div>
  )
}
