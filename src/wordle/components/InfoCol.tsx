// cs-blessed-wordle

import { cls } from '@/common/utils/cls'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import type { GameData } from '../hooks/useGame'
import type { HistoryView } from '../hooks/useHistoryView'
import type { WordleActions } from '../hooks/useBindActionsAndPublishMenu'
import { GameEventLog } from './GameEventLog'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import shared from '@/common/info-sheet/infoCol.module.css'
import styles from './InfoCol.module.css'

/**
 * wordle's info column — near-zero state, an arrangement of the shared scaffold pieces
 * in the fixed order (docs/playarea.md → Info-column readouts): state (guess count) →
 * whose-turn line (turn-order) → OpponentStrip (compete) → action row → help →
 * terminal answer reveal → setup disclosure → the event log. Every command is a
 * BOUND ACTION the PlayArea handed down (`actions`), so this column places
 * buttons and decides nothing about them — an action that does not apply here
 * draws nothing, which is how one row serves coop and compete.
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
  // The row's line, and the only thing that varies between states: the ending
  // that applies to me, and nothing at all while I can still play.
  const rowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {!gd.standing.isPlayer && (
          <p className={shared.infoHelp}>Watching — you&rsquo;re not in this game.</p>
        )}

        {/* State — the live guess count (the viewer's own; coop shares it). */}
        <p className={shared.infoState}>
          <strong>{gd.readout.guessesUsed}/{gd.readout.maxGuesses}</strong> guesses
        </p>
        {/* Whose-turn line — only for a turn-order game. A separate line below
            the state readout; never replaces it. */}
        {gd.isTurnBased && (
          <TurnStatusLine
            turnHolderId={gd.turnHolderId}
            players={gd.players}
            selfId={selfId}
            isTerminal={gd.isGameEnded}
          />
        )}

        {/* Opponent strip (compete) — each racer's guess COUNT (not their letters,
            which RLS hides until terminal). */}
        {gd.isCompete && (
          <OpponentStrip
            players={gd.players}
            selfId={selfId}
            metricLabel="Guesses"
            metricFor={(p) => (p.playerEnding?.reason === 'conceded' ? 'out' : p.guessesUsed)}
          />
        )}

        {/* ONE row, one order, every action listed once: which of them is on
            screen is each action's own answer, since `<ActionButton>` draws
            nothing for one that says it is hidden. The game menu lists the same
            bindings in the same order (docs/playarea.md). wordle has nothing to
            the left of the divider — no hint, no spoiler — so it draws none. */}
        <InfoActionsRow message={rowMessage}>
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

        {/* Help — only while you can act; the action row above carries the
            out-of-the-race state. */}
        {gd.standing.isStillPlaying && (
          <p className={shared.infoHelp}>Type a 5-letter word, then Enter.</p>
        )}

        {/* The word shows here and nowhere else — the below-board pill is a
            one-line ellipsizing row with the verdict in it, and this has the
            room to be a sentence and a click-to-define target. The region grows
            when the viewer opens it and gives the space back when they close it,
            a blessed exception to docs/ui.md → Layout stability. */}
        {gd.isGameEnded && solution && (
          <div className={shared.terminalExtra}>
            <p className={cls(shared.infoState, styles.answerLine)}>
              The answer was <DefinableWord word={solution} className={styles.answerReveal} />
            </p>
          </div>
        )}

        {/* Setup — last, behind a disclosure (closed by default). */}
        <SetupDisclosure rows={gd.setupRows} />
      </div>

      {/* Bottom region: the event log. It takes the RAW `guesses` (not the viewer's own)
          so its header dropdown can switch whose guesses show — coop is one shared
          "Team"; compete defaults to You and lists opponents (their rows fill in once
          the game ends and RLS reveals them). */}
      <GameEventLog
        guesses={gd.events}
        players={gd.players}
        selfId={selfId}
        mode={gd.mode}
        isTerminal={gd.isGameEnded}
        historyView={historyView}
      />
    </div>
  )
}
