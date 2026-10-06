// cs-unmet

import { cls } from '@/common/utils/cls'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import type { GActions, GGameData, GHistoryView, GPlayer } from '../types'
import { GameEventLog } from './GameEventLog'
import { StateLine } from './StateLine'
import shared from '@/common/info-sheet/infoCol.module.css'
import styles from './InfoCol.module.css'

/**
 * stackdown's info column — near-zero state, just an arrangement of the shared
 * scaffold pieces in the fixed order (docs/playarea.md → Info-column readouts):
 * state readout → OpponentStrip → action row → help → the six words' reveal →
 * setup disclosure → GameEventLog log. Every command arrives as an action this
 * column places, and the log opens a past turn through `historyView`; PlayArea
 * owns the coordination. See docs/playarea.md.
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
  // The six words while I have them revealed, else null.
  solution: string[] | null
}) {
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  /** A racer's cell in the strip: the one number a race publishes, a ✓ once
   *  they have cleared the stack — or "out", once they have ended on their
   *  own (in this game, only by conceding). */
  function getFoundOrOut(player: GPlayer) {
    if (player.ending !== null) return 'out'
    return (
      <>
        {player.nFoundWords}
        {player.solved ? ' ✓' : ''}
      </>
    )
  }

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* InfoCol order is FIXED (docs/playarea.md → Info-column readouts):
            state → opponent strip → action row → help → setup disclosure → log. */}

        <p className={shared.infoState}>
          <StateLine facts={gd.me} puzzle={gd.puzzle} />
        </p>

        {/* Opponent strip (compete) — each player's found-word count, identity
            on a leading disc; a ✓ marks a player who's cleared the board. */}
        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={gd.me.id}
            metricLabel="Found"
            metricFor={getFoundOrOut}
          />
        )}

        {/* One row, one order, every action listed once, in the game menu's
            order (docs/playarea.md). Each action answers whether it shows. The
            line is the ending that applies to me — the game's, or mine while
            the others race on. ICON-ONLY; the menu is the glyphs' legend. */}
        <InfoActionsRow message={actionRowMessage}>
          {/* The cheats, in the roster's `caution` tone (amber). The bare eye,
              not the boxed one: the spoiler hands over ONE word of a live
              game; the boxed-eye Reveal is the whole solution at the end. */}
          <ActionButton action={actions.actHint} show="icon" />
          <ActionButton action={actions.actSpoiler} show="icon" />
          {/* Right of the bar is about the END of the game rather than
              playing it; the bar hides itself when nothing is left of it. */}
          <span className={shared.actionsDivider} />
          <ActionButton action={actions.actReveal} show="icon" />
          <ActionButton action={actions.actRestart} show="icon" />
          <ActionButton action={actions.actNewGame} show="icon" />
          {/* Both exits are placed; each hides itself in the mode that isn't
              its own, and out of the race Stop takes Concede's place. */}
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

        {/* Only on my move: once I can't pick, the "click tiles" prompt would
            contradict the inert board. */}
        {gd.me.onTurn && (
          <p className={shared.infoHelp}>
            Click exposed tiles — or type a letter — to spell a word.{' '}
            <kbd>Enter</kbd> submits; <kbd>Backspace</kbd> takes one back.
          </p>
        )}
        {/* The six solution words — an info-column region allowed to grow when
            the viewer opens it and to give the space back when they close it
            again (a blessed exception to docs/ui.md → Layout stability: the
            reflow IS the reveal, and only ever fires on the viewer's own
            click). ABOVE the setup disclosure per the canonical order (the
            reveal is the payoff; the Setup options list is bookkeeping). */}
        {gd.ended && solution && (
          <div className={cls(shared.terminalExtra, styles.reveal)}>
            <span className="muted">The words were</span>{' '}
            <strong className={styles.revealWords}>{solution.join(' · ')}</strong>
          </div>
        )}

        {/* Setup — LAST before the log, behind a disclosure (closed by default). */}
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
