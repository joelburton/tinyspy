// cs-unmet

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { InfoActionsRow } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import { allGreen } from '../lib/colors'
import { makeBoardString, makeColorString, solvedWords } from '../lib/waffle'
import { SolutionReveal } from './SolutionReveal'
import { StateLine } from './StateLine'
import { GameEventLog } from './GameEventLog'
import shared from '@/common/info-sheet/infoCol.module.css'
import type { GActions, GGameData, GHistoryView, GLetterTile, GPlayer } from '../types'

/**
 * waffle's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/playarea.md → Info-column readouts): swap-state
 * readout → progressive answer reveal → OpponentStrip → action row → help → setup
 * disclosure → swap log. Every command is an ACTION the PlayArea handed down,
 * so this column places buttons and decides nothing about them.
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
  // The six words: all of them while the solution is revealed, else each word
  // I have turned fully green on my own board — already on my screen, so
  // showing it leaks nothing. The rest read as em dashes.
  const answerWords = solution !== null
    ? solvedWords(makeBoardString(solution), allGreen(makeBoardString(solution)))
    : solvedWords(makeBoardString(gd.me.board.tiles), makeColorString(gd.me.board.tiles))

  // The action row's line: set whenever the game has ended or I have.
  const endingLine = endingMessage === null
    ? undefined
    : { text: endingMessage.infoColText, outcome: endingMessage.outcome }

  // A racer who dropped out reads "out"; everyone else shows their swaps, with
  // ✓ for a solve and ✗ for a spent budget.
  function getSwapsOrOut(player: GPlayer) {
    if (player.conceded) return 'out'
    const isOutOfSwaps = player.ending?.reason === 'resource_exhausted'
    return (
      <>
        {player.nSwapsUsed}
        {player.solved ? ' ✓' : isOutOfSwaps ? ' ✗' : ''}
      </>
    )
  }

  // The Stop / Concede button — error-toned (red), shared by the "playing" and
  // the "out of the race" action rows. Each hides itself in the mode that isn't
  // its own, so both are placed and the row asks nothing; once you are out of
  // the race, Concede hides and Stop comes out in its place
  // (useStandardGameActions). Icon-only (the waffle experiment): the styled
  // tooltip carries the label.
  const exits = (
    <>
      <ActionButton action={actions.actConcede} show="icon" />
      <ActionButton action={actions.actStopGame} show="icon" />
    </>
  )

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* State — shown in both play and the end. The SAME <StateLine> the
            mobile status bar renders above the board (they must never drift). */}
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

        {/* The answer, revealed progressively: a word shows once you've turned it
            fully green; the rest read as em dashes. Shown throughout the game. */}
        <SolutionReveal words={answerWords} />

        {/* Opponent strip (compete) — each racer's swaps used + a ✓/✗ done mark. */}
        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={gd.me.id}
            metricLabel="Swaps"
            metricFor={getSwapsOrOut}
          />
        )}

        {/* Action row — three states, all ICON-ONLY (the waffle experiment;
            tooltips carry the labels). ENDED: the bold outcome line + Restart /
            Reveal / New game / back-to-club (primary). OUT OF THE RACE (compete:
            solved / out of swaps / conceded, the rest race on): my ending's line
            + Reveal + Stop. PLAYING: Stop/Concede + back-to-club. */}
        {gd.ended ? (
          <InfoActionsRow message={endingLine}>
            {/* Stay-here options left of the leave option (Club): restart this
                board, see the answer, or spin up the next game. */}
            <ActionButton action={actions.actRestart} show="icon" />
            <ActionButton action={actions.actReveal} show="icon" />
            <ActionButton action={actions.actNewGame} show="icon" />
            <ActionButton action={actions.actBackToClub} show="icon" weight="primary" />
          </InfoActionsRow>
        ) : !gd.me.stillPlaying ? (
          <InfoActionsRow message={endingLine}>
            {/* Reveal keeps its slot while the others race, but inert: the
                solution opens only when the game is over for EVERYONE, so a
                player who dropped out can't spoil a live race. Present rather
                than absent so the row doesn't change shape when the last racer
                finishes — the button is simply enabled then. */}
            <ActionButton action={actions.actReveal} show="icon" />
            {exits}
          </InfoActionsRow>
        ) : (
          <InfoActionsRow>
            {exits}
            <ActionButton action={actions.actBackToClub} show="icon" />
          </InfoActionsRow>
        )}

        {/* Help — shown ONLY while you can actually act on it (being out of
            the race is carried loudly by the action row above). */}
        {!gd.ended && gd.me.stillPlaying && (
          <p className={shared.infoHelp}>Tap two tiles to swap them.</p>
        )}

        {/* Setup — LAST before the log, behind a disclosure (closed by default). */}
        <SetupDisclosure rows={gd.setupRows} />
      </div>

      {/* The swap log — both modes. Rows are clickable to replay that swap. */}
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
