// cs-fixed-outcome-fix

import { cls } from '@/common/utils/cls'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { DefinableWord } from '@/common/definitions/DefinableWord'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { BOARD_SIZE } from '../lib/board'
import { GameEventLog } from './GameEventLog'
import { StateLine } from './StateLine'
import shared from '@/common/info-sheet/infoCol.module.css'
import styles from './InfoCol.module.css'
import type { GActions, GGameData, GHistoryView, GPlayer } from '../types'

/**
 * letterboxed's info column. Readouts in the canonical order
 * (docs/playarea.md): state → turn → opponents → actions, then the reveal and
 * the move log below the action slot.
 *
 * The state block is the whole game in two fractions — letters covered out of
 * twelve, words used out of the cap — so a glance answers "how are we doing?".
 *
 * The CHAIN itself is deliberately not here: it sits above the board
 * (`<ChainStrip>`), because it is per-turn state rather than a summary, and on
 * a phone this column is off-canvas behind the info sheet.
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
  // The seeded pair while I have it revealed, else null.
  solution: string[] | null
}) {
  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  /** A racer's cell in the strip: the two numbers a race may publish, never
   *  the words — or "out", once they have ended. */
  function getCoveredOrOut(player: GPlayer) {
    if (player.ending !== null) return 'out'
    return `${player.nCoveredLetters}/${BOARD_SIZE} · ${player.nWordsUsed}w`
  }

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        <StateLine data={gd.stateLineData} />

        {/* Whose-turn line — only in a turn-order game. Rendering it in a
            free-for-all game would print "Waiting for someone…" forever,
            since the pointer is null there. */}
        {gd.turns !== null && (
          <TurnStatusLine
            turnHolder={gd.turns.holder}
            isMyTurn={gd.me.onTurn}
            isGameEnded={gd.ended}
          />
        )}

        {/* Compete: the two numbers a race may publish. Never the words.
            DELIBERATELY unchanged at the end (Joel, 2026-08-05) — wordiply's
            strip switches to a verdict there, but here coverage IS the story:
            "they got 10 of the 12" is what you want to know about a rival
            after a race on coverage. */}
        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={gd.me.id}
            metricLabel="Covered"
            metricFor={getCoveredOrOut}
          />
        )}

        {/* One row, one order, every action listed once, in the game menu's
            order (docs/playarea.md). Each action answers whether it shows.
            ICON-ONLY; the menu is the glyphs' legend. */}
        <InfoActionsRow message={actionRowMessage}>
          <ActionButton action={actions.actHint} show="icon" />
          <ActionButton action={actions.actSpoiler} show="icon" />
          {/* Right of the bar is about the END of the game rather than
              playing it; the bar hides itself when nothing is left of it. */}
          <span className={shared.actionsDivider} />
          <ActionButton action={actions.actReveal} show="icon" />
          <ActionButton action={actions.actRestart} show="icon" />
          <ActionButton action={actions.actNewGame} show="icon" />
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

        {/* Only on my move: while I wait the board is inert, and the prompt
            would misdirect. */}
        {gd.me.onTurn && (
          <p className={shared.infoHelp}>
            Click letters or type; click the last one again (or press{' '}
            <kbd>Enter</kbd>) to submit. Every word starts where the last one
            ended — the × takes it back.
          </p>
        )}

        {/* The seeded pair — GATED behind the Reveal button above, and never
            automatic (a win covers the twelve letters with SOME chain; the pair
            is a different, shorter answer nobody saw), so it waits to be asked
            for, and goes away again when the asker is done. `terminalExtra`: a
            region allowed to grow when the viewer opens it and to give the
            space back when they close it (a blessed exception to docs/ui.md →
            Layout stability), ABOVE the setup disclosure per the canonical
            order (the reveal is the payoff; the Setup options list is
            bookkeeping). */}
        {solution !== null && (
          <div className={cls(shared.terminalExtra, styles.chainBlock)}>
            <div className={styles.blockTitle}>Solvable in two</div>
            <div className={styles.solution}>
              {solution.map((w, i) => (
                <span key={w}>
                  {i > 0 && ' → '}
                  <DefinableWord word={w} />
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Setup options — what was picked at create time, behind the shared
            disclosure. Closed by default so it doesn't crowd the state above.
            Rendered from the shared rows rather than hand-written <li>s: the
            PDF prints this exact array, and when the two were written
            separately they drifted (common/setup-form/doc.md → Setup rows). */}
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
