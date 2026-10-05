// cs-unmet

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { InfoActionsRow } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { cls } from '@/common/utils/cls'
import type { GActions, GGameData, GHistoryView, GPlayer, GWord } from '../types'
import { GameEventLog } from './GameEventLog'
import shared from '@/common/info-sheet/infoCol.module.css'
import styles from './PlayArea.module.css'

/**
 * strands' info column, in the canonical order (docs/playarea.md → Info-column
 * readouts): **state → opponents (compete) → action row → help → the words'
 * reveal → setup disclosure → event log**. The OpponentStrip is compete-only —
 * coop has no opponents — and shows a rival exactly one number mid-race: hints
 * used.
 *
 * The **theme prompt** leads the state region. It is the puzzle's title, not
 * the answer, so it belongs on screen from the first second; putting it
 * anywhere else would imply it had to be earned.
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
  // while the others race on — or null while I play.
  endingMessage: TerminalMessage | null
  actions: GActions
  historyView: GHistoryView
  // The hidden words, spangram first, while I have them revealed; else null.
  // The board draws paths and never spells anything out, so without this the
  // reveal makes you read the words off the grid letter by letter.
  solution: GWord[] | null
}) {
  const nFoundWords = gd.stateLineData.nFoundWords
  const nHintsUsed = gd.stateLineData.nHintsUsed
  // Out of the race while the others play on: solved, or conceded.
  const isOutOfRace = !gd.me.stillPlaying && !gd.ended

  /** A racer's cell in the strip: hints used, the one number a race
   *  publishes — with a rival who is done shown as done, which is race status
   *  rather than puzzle content, and the verdict once the game has ended. */
  function getHintsOrVerdict(player: GPlayer, isSelf: boolean) {
    if (gd.ended) {
      const verdict = player.outcome === 'won' ? 'Won' : player.conceded ? 'Conceded' : 'Lost'
      return `${verdict} on ${player.nHintsUsed}`
    }
    if (!isSelf && player.solved) return `done on ${player.nHintsUsed}`
    return player.nHintsUsed
  }

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* ── State ── */}
        {/* Quoted: the prompt is the puzzle's own words, not ours, and unquoted
            it reads as a heading the app wrote. */}
        <p className={styles.clue}>“{gd.puzzle.title}”</p>
        {/* Count only, never "of N": the TOTAL is part of the answer. */}
        <p className={shared.infoState}>
          {nFoundWords} {nFoundWords === 1 ? 'word' : 'words'}
          {nHintsUsed > 0 && <span className={styles.hintsUsed}> · {nHintsUsed} hint{nHintsUsed === 1 ? '' : 's'} used</span>}
        </p>

        {/* Opponent strip (compete). The metric is HINTS USED and nothing else:
            it is the ranking, so it makes the race legible, and it says nothing
            about the puzzle. */}
        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={gd.me.id}
            metricLabel="Hints"
            metricFor={getHintsOrVerdict}
          />
        )}

        {/* Whose-turn line — ONLY in a turn-order game. Rendering it in a
            free-for-all game would print "Waiting for someone…" forever. */}
        {gd.turns !== null && (
          <TurnStatusLine
            turnHolder={gd.turns.holder}
            isMyTurn={gd.me.onTurn}
            isGameEnded={gd.ended}
          />
        )}

        {/* ── Action row ── ENDED: the outcome line + Reveal / Restart / New
            game / back-to-club. OUT OF THE RACE: my ending's line + the exits.
            PLAYING: the exits + back-to-club. */}
        {gd.ended ? (
          <InfoActionsRow message={endingMessage ? { text: endingMessage.infoColText, outcome: endingMessage.outcome } : undefined}>
            <ActionButton action={actions.actReveal} show="icon" />
            <ActionButton action={actions.actRestart} show="icon" />
            <ActionButton action={actions.actNewGame} show="icon" />
            <ActionButton action={actions.actBackToClub} show="icon" weight="primary" />
          </InfoActionsRow>
        ) : isOutOfRace ? (
          <InfoActionsRow message={endingMessage ? { text: endingMessage.infoColText, outcome: endingMessage.outcome } : undefined}>
            {/* Both exits are placed and each says whether it applies: out of
                the race, Concede hides and Stop comes out in its place. */}
            <ActionButton action={actions.actConcede} show="icon" />
            <ActionButton action={actions.actStopGame} show="icon" />
          </InfoActionsRow>
        ) : (
          <InfoActionsRow>
            {/* Both exits are placed; each hides itself in the mode that isn't
                its own, so this row asks nothing about coop vs compete. */}
            <ActionButton action={actions.actConcede} show="icon" />
            <ActionButton action={actions.actStopGame} show="icon" />
            <ActionButton action={actions.actBackToClub} show="icon" />
          </InfoActionsRow>
        )}

        {/* ── Help ── only while it's actionable. */}
        {!gd.ended && !isOutOfRace && (
          <p className={shared.infoHelp}>
            Click letters in order — they may touch diagonally. After the first,
            you can type the rest. Press <kbd>Enter</kbd> (or the Submit button)
            to submit; <kbd>⌫</kbd> undoes one.
          </p>
        )}

        {/* ── The words themselves ── the other half of the reveal: a path
            shows you WHERE a word is, never what it says. Spangram first,
            each click-to-define. Comes and goes with the board's gray lines —
            one toggle, one secret (a blessed exception to docs/ui.md →
            Layout stability). */}
        {solution && (
          <p className={cls(shared.terminalExtra, styles.solutionWords)}>
            <span className="muted">Words:</span>{' '}
            {solution.map((w) => (
              <DefinableWord key={w.word} word={w.word} />
            ))}
          </p>
        )}

        {/* ── Setup ── LAST before the log, behind a disclosure. */}
        <SetupDisclosure rows={gd.setupRows} />
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
