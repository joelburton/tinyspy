// cs-blessed-psychicnum

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import type { Member } from '@/common/members/member'
import type { GameData } from '../hooks/useGame'
import type { HistoryView } from '../hooks/useHistoryView'
import type { PsychicnumActions } from '../hooks/useBindActionsAndPublishMenu'
import { GameEventLog } from './GameEventLog'
import { StateLine } from './StateLine'
import shared from '@/common/info-sheet/infoCol.module.css'

/**
 * psychicnum's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/playarea.md → Info-column readouts): state readout →
 * whose-turn line (turn-order) → OpponentStrip (compete) → action row → help →
 * setup disclosure → event log. Every
 * command is a BOUND ACTION the PlayArea handed down (`actions.actHint`, `actions.actStopGame`, …),
 * so this column places buttons and decides nothing about them — an action that
 * does not apply here draws nothing, which is how one row serves coop and compete.
 * What is a callback is what isn't a command: the history-viewer selection.
 * Prop names match the other games' columns for the same idea (docs/playarea.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea.md.
  gd,
  roster,
  selfId,
  gameEndingMessage,
  playerEndingMessage,
  actions,
  historyView,
}: {
  // ── The game ──
  // The game data: the readouts, where I stand, the turn, the players' counts
  // for the strip, and the log.
  gd: GameData
  // The page's players, in the shape the shared pieces below take (the
  // whose-turn line, the strip, the event log).
  roster: Member[]
  selfId: string
  // The endings' messages, each null while it does not apply: the game's once
  // it has ended, mine while I have ended and the others play on. The action
  // row shows whichever there is.
  gameEndingMessage: TerminalMessage | null
  playerEndingMessage: TerminalMessage | null

  // ── Action row ──
  // Every command, bound; the row places them in the order the game menu lists
  // them too (docs/playarea.md).
  actions: PsychicnumActions

  // ── Turn-history log (GameEventLog) ──
  // The past turn open on the board, if any: the log marks its row, and a
  // `#N` click opens another through `show`.
  historyView: HistoryView
}) {

  // The row's line: the game's ending, else mine, else nothing while I can
  // still play.
  const endingMessage = gameEndingMessage ?? playerEndingMessage
  const rowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  return (
    <div className={shared.infoCol}>
      {/* The non-log info column — the shared named readouts, in the canonical order
          (docs/playarea.md → Info-column readouts): STATE → whose-turn line
          (turn-order) → OpponentStrip (compete) → ACTIONS → HELP → SETUP
          disclosure, then the event log below. */}
      <div className={shared.noShrinkRow}>
        {/* State — shown during play and after the game ends. The same `<StateLine>` the
            mobile status bar renders above the board (BoardCol), so the two
            copies can't drift. */}
        <p className={shared.infoState}>
          <StateLine
            found={gd.foundSecretsCount}
            secretCount={gd.requiredSecretsCount}
            guessesUsed={gd.guessesUsed}
            maxGuesses={gd.maxGuesses}
          />
        </p>
        {/* Whose-turn line — ONLY for a turn-order game. A separate line below
            the state readout, never replacing it. Its presence is fixed at
            create-time, so it can't reflow. */}
        {gd.isTurnBased && (
          <TurnStatusLine
            turnHolderId={gd.turnHolderId}
            players={roster}
            selfId={selfId}
            isTerminal={gd.isGameEnded}
          />
        )}
        {gd.isCompete && (
          <OpponentStrip
            players={roster}
            selfId={selfId}
            metricLabel="Found"
            metricFor={(p) => {
              const player = gd.players[p.user_id]
              // A player who's conceded reads as "out" mid-game (they're done,
              // whatever their found count was); everyone else shows progress.
              return player?.playerEnding?.reason === 'conceded'
                ? 'out'
                : (player?.foundSecretsCount ?? 0)
            }}
          />
        )}

        {/* ONE row, one order, every action listed once. Which of them is on
            screen right now is each action's own answer — `<ActionButton>` draws
            nothing for an action that says it is hidden — so no branch here can
            disagree with what the menu shows. The game menu lists the same
            bindings in this same order (docs/playarea.md). */}
        <InfoActionsRow message={rowMessage}>
          {/* Hint = a clue (common.words.hint); Spoiler = the answer word
              itself. Both log to the event log, cost nothing — and both wear the
              registry's caution tone (amber); the lightbulb-vs-bare-eye glyph is
              what separates them. The boxed-eye Reveal below is a different
              thing: the whole solution, and only once nobody can still play. */}
          <ActionButton action={actions.actHint} show="icon" />
          <ActionButton action={actions.actSpoiler} show="icon" />
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
          {/* Leaving, last. Filled once the game has ended, outline while it runs:
              `weight` is the placement's to choose rather than the action's,
              which is why it is a condition here (docs/ui.md → What a `<button>` is). */}
          <ActionButton
            action={actions.actBackToClub}
            show="icon"
            weight={gameEndingMessage ? 'primary' : 'secondary'}
          />
        </InfoActionsRow>

        {/* Help — shown ONLY while you can actually act on it: it is my move
            (the board is inert while I wait, so the prompt would misdirect;
            Hint / Reveal / Stop stay available). It never silently swaps text:
            the "out of guesses, waiting" state is carried loudly by the action
            row above (the player-ended look), not by a quietly-changed help
            line. Below the action row, per the InfoCol order. */}
        {gd.standing.isMyTurn && <p className={shared.infoHelp}>Click on or type a word and hit submit.</p>}

        {/* Setup — shown in BOTH states, behind a disclosure, LAST before the event log
            (docs/playarea.md → Info-column readouts). Open, it grows (which we
            normally avoid), but it's closable so it reclaims the space. */}
        <SetupDisclosure rows={gd.setupRows} />
      </div>

      <GameEventLog
        guesses={gd.events}
        players={roster}
        selfId={selfId}
        mode={gd.mode}
        isGameEnded={gd.isGameEnded}
        historyId={historyView.viewedEventId}
        onShowHistory={historyView.show}
      />
    </div>
  )
}
