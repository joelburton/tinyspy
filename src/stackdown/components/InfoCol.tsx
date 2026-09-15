// cs-unmet

import { cls } from '@/common/utils/cls'
import type { Member } from '@/common/members/member'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { InfoActionsRow } from '@/common/game-page/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import type { StackdownSetup } from '../lib/setup'
import type { PlayerRow, SubmissionRow } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import shared from '@/common/game-page/playArea.module.css'
import styles from './InfoCol.module.css'

/**
 * stackdown's info column — near-zero state, just an arrangement of the shared
 * scaffold pieces in the fixed order (docs/playarea.md → Info-column readouts):
 * state readout → OpponentStrip → action row → help → setup disclosure → terminal
 * words reveal → GameTurnLog log. Every mutation is a named callback up
 * (`onSelectTurn`); every COMMAND arrives as a bound action this column places. PlayArea owns the
 * RPCs and the coordination state. See docs/playarea.md.
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below),
  // so "what is this prop for?" is answerable by eye. Names are shared verbatim with
  // the other games' columns for the same idea — see docs/playarea.md.
  isCompete,
  isTerminal,
  over,
  isPlayer,
  isLocallyDone,
  foundCount,
  hintCount,
  spoilerCount,
  players,
  selfId,
  playerStates,
  concededIds,
  actHint,
  actSpoiler,
  actEndGame,
  actConcede,
  actRestart,
  actNewGame,
  actBackToClub,
  setupRows,
  solution,
  actReveal,
  submissions,
  viewingIndex,
  onSelectTurn,
}: {
  // ── Mode + phase (read by several regions below) ──
  /** compete shows the OpponentStrip + Concede; coop shows End. */
  isCompete: boolean
  isTerminal: boolean
  /** The terminal message when the game is over (drives the action row + words reveal), else null. */
  over: TerminalMessage | null
  /** Am I a player in this game (gates the cheats + the "click tiles" help). */
  isPlayer: boolean
  /** I conceded but the others race on — a terminal LOOK without ending the game. */
  isLocallyDone: boolean

  // ── State readout (the count line at the top) ──
  /** Words cleared, out of six. */
  foundCount: number
  /** Cheat tallies shown beneath the count. */
  hintCount: number
  /** How many times a player took the "just tell me the next word" spoiler.
   *  The submission rows still carry `kind='reveal'` server-side (renaming the
   *  stored value would be a migration for a label); only the word the players
   *  read changed, so "reveal" can mean the whole solution at game-over. */
  spoilerCount: number

  // ── Players (the OpponentStrip + the log's identity discs) ──
  /** The roster (identity + per-player concede flags). */
  players: Member[]
  selfId: string
  /** Public per-player tallies (found_count / solved); `self` is derived from these. */
  playerStates: PlayerRow[]
  /** Who has conceded (drives the OpponentStrip "out" mid-game). */
  concededIds: Set<string>

  // ── Action row (cheats + End/Concede, back-to-club at terminal) ──
  /** The two rungs of the help ladder — a hint toward the next word, or the
   *  word itself. Both carry their own "which word" wording. */
  actHint: BoundAction
  /** Mid-game cheat: hand over the next word (the amber bare eye). Named for
   *  what it does to a LIVE game — distinct from `actReveal` below, which opens
   *  the whole solution once the game is over. */
  actSpoiler: BoundAction
  /** End the game for the whole table — coop's exit; it hides itself in a race. */
  actEndGame: BoundAction
  /** Drop out of a race while the others play on — hidden outside compete. */
  actConcede: BoundAction
  /** Restart THIS stack — same tiles, same solution — from scratch. */
  actRestart: BoundAction
  /** Start a fresh follow-up game — same setup + roster, a newly claimed board.
   *  Disables itself while the create is in flight. */
  actNewGame: BoundAction
  /** Leave for the club — the shell's own action, off `ctx.menu`. */
  actBackToClub: BoundAction

  // ── Setup disclosure + terminal words reveal ──
  setup: StackdownSetup
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]
  /** The six solution words — non-null ONLY while THIS viewer is looking at
   *  them. Hidden by default at every terminal, a win included, so Restart
   *  (same stack, same solution) stays a genuine second try. */
  solution: string[] | null
  /** Show the words — or put them away again. A local display toggle shared with
   *  the menu twin; nothing is written and no peer is affected, and it carries
   *  its own faces, the inert "solution already shown" included. */
  actReveal: BoundAction

  // ── Turn-history log (GameTurnLog) ──
  /** The submission log the log renders + the viewer indexes (by position). */
  submissions: SubmissionRow[]
  /** The log row currently open in the board viewer, or null. */
  viewingIndex: number | null
  onSelectTurn: (index: number) => void
}) {
  const self = playerStates.find((p) => p.user_id === selfId)

  return (
    <div className={shared.infoCol}>
      <div className={shared.steadyRows}>
        {/* InfoCol order is FIXED (docs/playarea.md → Info-column readouts):
            state → opponent strip → action row → help → setup disclosure → log. */}

        {/* State — words cleared out of six, plus the cheat tallies (hints /
            spoilers used). Always shown (even at 0) so using one doesn't shift
            the rows below. */}
        <p className={shared.infoState}>
          <strong>{foundCount}</strong> / 6 words cleared
          <br />
          <strong>{hintCount}</strong> hint{hintCount === 1 ? '' : 's'} ·{' '}
          <strong>{spoilerCount}</strong> spoiler{spoilerCount === 1 ? '' : 's'} used
        </p>

        {/* Opponent strip (compete) — each player's found-word count, identity
            on a leading disc; a ✓ marks a player who's cleared the board. */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Found"
            metricFor={(player, isSelf) => {
              // Mid-game a conceder reads as "out" (dropped from the race). At
              // terminal we keep the found/✓ tally so the final board still
              // shows how far each player got before it ended.
              if (!isTerminal && concededIds.has(player.user_id)) return 'out'
              const ps = playerStates.find((p) => p.user_id === player.user_id)
              const found = isSelf ? self?.found_count ?? 0 : ps?.found_count ?? 0
              return (
                <>
                  {found}
                  {ps?.solved ? ' ✓' : ''}
                </>
              )
            }}
          />
        )}

        {/* Action row — Reveal hint / Reveal word cheats + End/Concede during
            play; at terminal the bold outcome line + a compact back-to-club
            button. */}
        {over ? (
          <InfoActionsRow message={{ text: over.infoColText, outcome: over.outcome }}>
            {/* Stay-here options left of the leave option (Club): run this stack
                back, or claim the next one. */}
            {/* Reveal first: it's the one that acts on THIS finished game.
                Restart / New game are both "move on", and they leave. */}
            <ActionButton action={actReveal} show="icon" />
            <ActionButton action={actRestart} show="icon" />
            <ActionButton action={actNewGame} show="icon" />
            <ActionButton action={actBackToClub} show="icon" weight="primary" />
          </InfoActionsRow>
        ) : isLocallyDone ? (
          // I conceded; the others race on. Terminal LOOK (a status line + the
          // now-disabled Concede) so the drop-out reads loudly.
          <InfoActionsRow message={{ text: 'You conceded', outcome: 'neutral' }}>
            {/* Reveal keeps its slot while the others race, but inert: the
                words don't even reach this client until the game is over for
                EVERYONE (stackdown._solution_for gates on is_terminal), so a
                player who dropped out can't spoil a live race. Present rather
                than absent so the row doesn't change shape when the last racer
                finishes — the button is simply enabled then. */}
            <ActionButton action={actReveal} show="icon" />
            <ActionButton action={actConcede} show="icon" />
          </InfoActionsRow>
        ) : isPlayer ? (
          <InfoActionsRow>
            {/* Cheats: both warning-toned (amber) — "help, not good-or-bad".
                Icon-only like the rest of the row; `tooltip` (the styled hover
                bubble) carries the full "what it does" copy, richer than the
                name the glyph would take from `label` alone. */}
            <ActionButton action={actHint} show="icon" />
            {/* The bare eye, not the boxed one: this hands over ONE word of a
                live game. The boxed-eye Reveal is reserved for the whole
                solution at game-over (see the icon registry). */}
            <ActionButton action={actSpoiler} show="icon" />
            {/* Both exits are placed; each hides itself in the mode that isn't
                its own, so this row asks nothing about coop vs compete. */}
            <ActionButton action={actConcede} show="icon" />
            <ActionButton action={actEndGame} show="icon" />
          </InfoActionsRow>
        ) : null}

        {/* Help — only while the player can act on it (never silently swapped).
            Hidden once conceded: the "click tiles" prompt would contradict the
            now-disabled entry. */}
        {!over && isPlayer && !isLocallyDone && (
          <p className={shared.infoHelp}>
            Click exposed tiles — or type a letter — to spell a word.{' '}
            <kbd>Enter</kbd> submits; <kbd>Backspace</kbd> takes one back.
          </p>
        )}
        {/* Watching someone else's game (rare by design — "no spectators", see
            CLAUDE.md). Given the terminal LOOK rather than a muted help line:
            being unable to act is terminal for you, so it reads as a state, not
            as advice. Matches waffle. */}
        {!over && !isPlayer && <InfoActionsRow message={{ text: 'Watching — not in this game', outcome: 'neutral' }} />}

        {/* The six solution words — an info-column region allowed to grow when
            the viewer opens it and to give the space back when they close it
            again (a blessed exception to docs/ui.md → Layout stability: the
            reflow IS the reveal, and only ever fires on the viewer's own
            click). ABOVE the setup disclosure per the canonical order (the
            reveal is the payoff; the recap is bookkeeping). */}
        {over && solution && (
          <div className={cls(shared.terminalExtra, styles.reveal)}>
            <span className="muted">The words were</span>{' '}
            <strong>{solution.map((w) => w.toUpperCase()).join(' · ')}</strong>
          </div>
        )}

        {/* Setup — LAST before the log, behind a disclosure (closed by default). */}
        <SetupDisclosure>
          {setupRows.map((r) => (
            <li key={r.key}>
              {r.label}: {r.value}
            </li>
          ))}
        </SetupDisclosure>
      </div>

      <GameTurnLog
        submissions={submissions}
        players={players}
        selfId={selfId}
        mode={isCompete ? 'compete' : 'coop'}
        isTerminal={isTerminal}
        viewingIndex={viewingIndex}
        onSelectTurn={onSelectTurn}
      />
    </div>
  )
}
