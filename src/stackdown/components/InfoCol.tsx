// cs-unmet

import { cls } from '@/common/utils/cls'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { InfoActionsRow } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import type { GActions, GGameData, GHistoryView, GPlayer } from '../types'
import { GameEventLog } from './GameEventLog'
import shared from '@/common/info-sheet/infoCol.module.css'
import styles from './InfoCol.module.css'

/**
 * stackdown's info column — near-zero state, just an arrangement of the shared
 * scaffold pieces in the fixed order (docs/playarea.md → Info-column readouts):
 * state readout → OpponentStrip → action row → help → setup disclosure → terminal
 * words reveal → GameEventLog log. Every command arrives as an action this
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
  const sld = gd.stateLineData

  /** A racer's cell in the strip: the one number a race publishes, a ✓ once
   *  they have cleared the stack — or "out" mid-race, once they have conceded.
   *  Once the game has ended the count stays, so the final board shows how far
   *  each racer got. */
  function getFoundOrOut(player: GPlayer) {
    if (!gd.ended && player.conceded) return 'out'
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

        {/* State — words cleared out of six, plus the cheat tallies (hints /
            spoilers used). Always shown (even at 0) so using one doesn't shift
            the rows below. */}
        <p className={shared.infoState}>
          <strong>{sld.nFoundWords}</strong> / {sld.nReqdWords} words cleared
          <br />
          <strong>{sld.nHintsUsed}</strong> hint{sld.nHintsUsed === 1 ? '' : 's'} ·{' '}
          <strong>{sld.nSpoilersUsed}</strong> spoiler{sld.nSpoilersUsed === 1 ? '' : 's'} used
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

        {/* Action row — Reveal hint / Reveal word cheats + Stop/Concede during
            play; at terminal the bold outcome line + a compact back-to-club
            button. */}
        {gd.ended ? (
          <InfoActionsRow message={{ text: endingMessage!.infoColText, outcome: endingMessage!.outcome }}>
            {/* Stay-here options left of the leave option (Club): run this stack
                back, or claim the next one. */}
            {/* Reveal first: it's the one that acts on THIS finished game.
                Restart / New game are both "move on", and they leave. */}
            <ActionButton action={actions.actReveal} show="icon" />
            <ActionButton action={actions.actRestart} show="icon" />
            <ActionButton action={actions.actNewGame} show="icon" />
            <ActionButton action={actions.actBackToClub} show="icon" weight="primary" />
          </InfoActionsRow>
        ) : endingMessage ? (
          // I conceded; the others race on. The ending's LOOK (a status line +
          // the one flag) so the drop-out reads loudly.
          <InfoActionsRow message={{ text: endingMessage.infoColText, outcome: endingMessage.outcome }}>
            {/* Reveal keeps its slot while the others race, but inert: the
                words aren't in the blob until the game is over for EVERYONE,
                so a player who dropped out can't spoil a live race. Present rather
                than absent so the row doesn't change shape when the last racer
                finishes — the button is simply enabled then. */}
            <ActionButton action={actions.actReveal} show="icon" />
            {/* Both exits are placed and each says whether it applies: out of
                the race, Concede hides and Stop comes out in its place — one
                flag, since anyone in a game may stop it for all. */}
            <ActionButton action={actions.actConcede} show="icon" />
            <ActionButton action={actions.actStopGame} show="icon" />
          </InfoActionsRow>
        ) : (
          <InfoActionsRow>
            {/* Cheats: both in the roster's `caution` tone (amber).
                Icon-only like the rest of the row; `tooltip` (the styled hover
                bubble) carries the full "what it does" copy, richer than the
                name the glyph would take from `label` alone. */}
            <ActionButton action={actions.actHint} show="icon" />
            {/* The bare eye, not the boxed one: this hands over ONE word of a
                live game. The boxed-eye Reveal is reserved for the whole
                solution at game-over (see the icon registry). */}
            <ActionButton action={actions.actSpoiler} show="icon" />
            {/* Both exits are placed; each hides itself in the mode that isn't
                its own, so this row asks nothing about coop vs compete. */}
            <ActionButton action={actions.actConcede} show="icon" />
            <ActionButton action={actions.actStopGame} show="icon" />
          </InfoActionsRow>
        )}

        {/* Help — only while the player can act on it (never silently swapped).
            Hidden once conceded: the "click tiles" prompt would contradict the
            now-disabled entry. */}
        {gd.me.stillPlaying && (
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
            <strong>{solution.map((w) => w.toUpperCase()).join(' · ')}</strong>
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
