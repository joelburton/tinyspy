// cs-blessed-connections

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import type { GameData } from '../hooks/useGame'
import type { HistoryView } from '../hooks/useHistoryView'
import type { ConnectionsActions } from '../hooks/useActionsAndMenu'
import { GameEventLog } from './GameEventLog'
import { HintList } from './HintList'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import shared from '@/common/info-sheet/infoCol.module.css'

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
  gd: GameData
  myId: string
  // The ending that applies to me — the game's once it has ended, else mine
  // while the others play on — for the action row's line; null while I play.
  endingMessage: TerminalMessage | null
  actions: ConnectionsActions
  historyView: HistoryView
  // Is the inline hint list unfolded? The Hints action toggles this.
  hintsOpen: boolean
}) {
  const { isStillPlaying } = gd.standing
  const { foundCount, requiredCategoriesCount, mistakeCount, maxMistakes } = gd.readout

  // The row's line, and the only thing that varies between states: the ending
  // that applies to me, and nothing at all while I can still play.
  const rowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* State — categories found + mistakes, as text; the marks are the
            board column's, on the commit row. */}
        <p className={shared.infoState}>
          <strong>
            {foundCount}/{requiredCategoriesCount}
          </strong>{' '}
          categories found ·{' '}
          <strong>
            {mistakeCount}/{maxMistakes}
          </strong>{' '}
          mistakes
        </p>
        {/* Whose-turn line — only for a turn-order game. A separate line below
            the state readout; never replaces it. */}
        {gd.turns.isTurnBased && (
          <TurnStatusLine
            turnHolderId={gd.turns.turnHolderId}
            players={gd.players}
            selfId={myId}
            isTerminal={gd.isGameEnded}
          />
        )}

        {/* Opponent strip (compete) — the race comparison: each player's categories
            FOUND (public via players.found_categories_count). */}
        {gd.isCompete && (
          <OpponentStrip
            players={gd.players}
            selfId={myId}
            metricLabel="Found"
            // A racer who conceded reads 'out' (their found-count is frozen
            // and no longer part of the race); everyone else shows their live
            // categories-found.
            metricFor={(p) =>
              p.playerEnding?.reason === 'conceded' ? 'out' : p.foundCategoriesCount
            }
          />
        )}

        {/* ONE row, one order, every action listed once. Which of them is on
            screen right now is each action's own answer — `<ActionButton>` draws
            nothing for an action that says it is hidden — so no branch here can
            disagree with what the menu shows. The game menu lists the same
            actions in this same order (docs/playarea.md). */}
        <InfoActionsRow message={rowMessage}>
          {/* Hints toggles the inline HintList below; aria-pressed says whether
              it is unfolded. */}
          <ActionButton action={actions.actHint} show="icon" aria-pressed={hintsOpen} />
          {/* Everything right of here is about the END of the game rather than
              about playing it. Both sides are pressable mid-game, so the bar is
              what says where the meaning changes; it hides itself when nothing
              is left on its left. */}
          <span className={shared.actionsDivider} />
          <ActionButton action={actions.actReveal} show="icon" />
          {/* Both say `hidden` to a button until the game is over, while their
              menu rows and keys stay live all game — the row's few slots belong
              to playing, and moving on is a thing you go looking for. */}
          <ActionButton action={actions.actRestart} show="icon" />
          <ActionButton action={actions.actNewGame} show="icon" />
          {/* Compete's Concede and coop's Stop are distinct acts, and each hides
              itself in the mode that isn't its own. */}
          <ActionButton action={actions.actConcede} show="icon" />
          <ActionButton action={actions.actStopGame} show="icon" />
          {/* Leaving, last. Filled once the game has ended, outline while it
              runs: `weight` is the placement's to choose rather than the
              action's, which is why it is a condition here (docs/ui.md → What
              a `<button>` is). */}
          <ActionButton
            action={actions.actBackToClub}
            show="icon"
            weight={gd.isGameEnded ? 'primary' : 'secondary'}
          />
        </InfoActionsRow>
        {/* The per-player hint reveals — unfolds right under the action row when
            Hints is on; stays mounted (so revealed tiles persist across toggles),
            and folds with the Hints button once you can no longer submit. */}
        <HintList categories={gd.puzzle.board.categories} open={hintsOpen && isStillPlaying} />

        {/* Help — shown only while you are in the game (never silently swaps);
            the eliminated state is carried loudly by the action row above. */}
        {isStillPlaying && (
          <p className={shared.infoHelp}>Pick 4 tiles that share a category, then Submit.</p>
        )}

        {/* Setup — last, behind a disclosure (closed by default so it doesn't claim
            space). */}
        <SetupDisclosure rows={gd.setupRows} />
      </div>

      {/* Event log. Coop shows the whole shared game; compete gets the shared
          "whose guesses?" picker — an opponent's rows are RLS-hidden during play
          and open at the end, so the picker is how you compare lines afterwards. */}
      <GameEventLog
        guesses={gd.events}
        categories={gd.puzzle.board.categories}
        players={gd.players}
        myId={myId}
        mode={gd.mode}
        isTerminal={gd.isGameEnded}
        historyId={historyView.viewedEventId}
        onShowHistory={historyView.show}
      />
    </div>
  )
}
