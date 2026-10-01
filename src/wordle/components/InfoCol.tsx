// cs-blessed-wordle

import { cls } from '@/common/utils/cls'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import type { GameData, WordlePlayer } from '../hooks/useGame'
import type { HistoryView } from '../hooks/useHistoryView'
import type { WordleActions } from '../hooks/useActionsAndMenu'
import { GameEventLog } from './GameEventLog'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import shared from '@/common/info-sheet/infoCol.module.css'
import styles from './InfoCol.module.css'

/**
 * wordle's info column: the shared readouts in the fixed order
 * (docs/playarea.md → Info-column readouts) — the guess count, the whose-turn
 * line, the opponent strip, the action row, help, the answer once revealed,
 * setup, then the event log. Every command is an action PlayArea hands
 * down; an action that does not apply draws nothing, which is how one row
 * serves coop and compete.
 */
export function InfoCol({
  gd,
  selfId,
  endingMessage,
  actions,
  historyView,
  solution,
}: {
  gd: GameData
  selfId: string
  // The ending that applies to me — the game's once it has ended, else mine
  // while the others play on — for the action row's line; null while I play.
  endingMessage: TerminalMessage | null
  actions: WordleActions
  historyView: HistoryView
  // The answer to DISPLAY, or null while it stays hidden — which is the default
  // once a game ends that this viewer did not solve.
  solution: string | null
}) {
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  // A player who dropped out or ran out of guesses reads "out"; everyone else,
  // a solver waiting on the rest included, shows their guesses.
  function getGuessesOrOut(player: WordlePlayer) {
    const endedReason = player.playerEnding?.reason
    if (endedReason === 'conceded' || endedReason === 'resource_exhausted') return 'out'
    return player.guessesUsed
  }

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* SPECTATING: a guess until the design settles what a watcher
            sees. */}
        {!gd.standing.isPlayer && (
          <p className={shared.infoHelp}>Watching — you&rsquo;re not in this game.</p>
        )}

        <p className={shared.infoState}>
          <strong>{gd.readout.guessesUsed}/{gd.readout.maxGuesses}</strong> guesses
        </p>
        {gd.isTurnBased && (
          <TurnStatusLine
            turnHolderId={gd.turnHolderId}
            players={gd.players}
            selfId={selfId}
            isTerminal={gd.isGameEnded}
          />
        )}

        {/* Each player's guess COUNT, not their letters, which RLS hides until
            the game ends. */}
        {gd.isCompete && (
          <OpponentStrip
            players={gd.players}
            selfId={selfId}
            metricLabel="Guesses"
            metricFor={getGuessesOrOut}
          />
        )}

        {/* One row, one order, every action listed once, in the game menu's
            order (docs/playarea.md). Each action answers whether it shows. */}
        <InfoActionsRow message={actionRowMessage}>
          <ActionButton action={actions.actReveal} show="icon" />
          <ActionButton action={actions.actRestart} show="icon" />
          <ActionButton action={actions.actNewGame} show="icon" />
          <ActionButton action={actions.actConcede} show="icon" />
          <ActionButton action={actions.actStopGame} show="icon" />
          <ActionButton
            action={actions.actBackToClub}
            show="icon"
            weight={gd.isGameEnded ? 'primary' : 'secondary'}
          />
        </InfoActionsRow>

        {/* Only on my move: while I wait the board is inert, and the prompt
            would misdirect. */}
        {gd.standing.isMyTurn && (
          <p className={shared.infoHelp}>Type a 5-letter word, then Enter.</p>
        )}

        {/* The word shows here and nowhere else — the below-board pill is a
            one-line ellipsizing row with the verdict in it, and this has the
            room to be a sentence and a click-to-define target. The region grows
            when the viewer opens it and gives the space back when they close it,
            a blessed exception to docs/ui.md → Layout stability. */}
        {solution !== null && (
          <div className={shared.terminalExtra}>
            <p className={cls(shared.infoState, styles.answerLine)}>
              The answer was <DefinableWord word={solution} className={styles.answerReveal} />
            </p>
          </div>
        )}

        <SetupDisclosure rows={gd.setupRows} />
      </div>

      <GameEventLog
        guesses={gd.events}
        players={gd.players}
        selfId={selfId}
        mode={gd.mode}
        isGameEnded={gd.isGameEnded}
        historyView={historyView}
      />
    </div>
  )
}
