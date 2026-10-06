// cs-unmet

import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { InfoActionsRow, type InfoActionsMessage } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { useAction } from '@/common/actions/actionsStore'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import type { GActions, GGameData, GHistoryView, GPlayer } from '../types'
import { GameEventLog } from './GameEventLog'
import { LastSet } from './LastSet'
import { StateLine } from './StateLine'
import shared from '@/common/info-sheet/infoCol.module.css'

/**
 * setgame's info column, in the canonical order (docs/playarea.md → Info-column
 * readouts): **state → last set → opponents (compete) → turn line → action row
 * → setup disclosure → event log**. Every command arrives as an action this
 * column places, and the log opens a past turn through `historyView`;
 * PlayArea owns the coordination.
 *
 * **Coop never shows a per-player breakdown** — not mid-game, where individual
 * counts would quietly turn a cooperative game into a visible contest, and not
 * at the end either, where a breakdown is PUSHED at the table whether or not
 * anyone wanted the comparison. The log's player filter answers the same
 * question, PULLED by whoever went looking for it.
 */
export function InfoCol({
  gd,
  endingMessage,
  actions,
  historyView,
}: {
  gd: GGameData
  // The ending that applies to me — the game's once it has ended, else mine
  // while the others race on — or null while I play.
  endingMessage: TerminalMessage | null
  actions: GActions
  historyView: GHistoryView
}) {
  // The Hint the board column binds: one action, placed on two surfaces.
  const actHint = useAction('act-hint')

  const actionRowMessage: InfoActionsMessage | undefined = endingMessage
    ? { text: endingMessage.infoColText, outcome: endingMessage.outcome }
    : undefined

  /** A racer's cell in the strip: their sets, live — the claims all happened
   *  face-up, so the number is one a player could have counted themselves;
   *  "out" once they have conceded; and their verdict once the game has
   *  ended. */
  function getSetsOrOut(player: GPlayer) {
    if (gd.ended) {
      const verdict = player.outcome === 'won' ? 'Won' : player.conceded ? 'Conceded' : 'Lost'
      return `${verdict} · ${player.nSetsFound}`
    }
    if (player.ending !== null) return 'out'
    return `${player.nSetsFound}`
  }

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        <div className={shared.infoState}>
          <StateLine data={gd.stateLineData} withTilesInDeck />
        </div>

        <LastSet claim={gd.events.findLast((e) => e.kind === 'claim') ?? null} />

        {gd.compete && (
          <OpponentStrip
            players={gd.players}
            myId={gd.me.id}
            metricLabel="Sets"
            metricFor={getSetsOrOut}
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

        {/* One row, one order, every action listed once (docs/playarea.md).
            Each action answers whether it shows. The line is the ending that
            applies to me. ICON-ONLY; the menu is the glyphs' legend. */}
        <InfoActionsRow message={actionRowMessage}>
          {/* Hint — on the row in compete too, disabled and saying why: hiding
              it would leave a player hunting for a button they know this game
              has. */}
          {actHint !== null && <ActionButton action={actHint} show="icon" />}
          {/* Both exits are placed; each hides itself in the mode that isn't
              its own, and out of the race Stop takes Concede's place. */}
          <ActionButton action={actions.actConcede} show="icon" />
          <ActionButton action={actions.actStopGame} show="icon" />
          {/* Right of the bar is about the END of the game rather than
              playing it; the bar hides itself when nothing is left of it. */}
          <span className={shared.actionsDivider} />
          <ActionButton action={actions.actRestart} show="icon" />
          <ActionButton action={actions.actNewGame} show="icon" />
          {/* Filled once the game has ended: the weight is the placement's
              choice, not the action's (docs/ui.md → What a `<button>` is). */}
          <ActionButton
            action={actions.actBackToClub}
            show="icon"
            weight={gd.ended ? 'primary' : 'secondary'}
          />
        </InfoActionsRow>

        {/* Setup — LAST before the log, behind a disclosure. */}
        <SetupDisclosure rows={gd.setupRows} />
      </div>

      {/* The log scrolls inside its own box, so a growing log never moves
          anything above it. */}
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
