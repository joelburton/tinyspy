// cs-unmet

import { terminalOutcomeVerb } from '@/common/terminal/terminalOutcomeVerb'
import { type Member, type GamePlayer } from '@/common/members/member'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import { TurnStatusLine } from '@/common/info-sheet/TurnStatusLine'
import { InfoActionsRow } from '@/common/info-sheet/InfoActionsRow'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import type { ScrabbleSetup } from '../lib/setup'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import type { RankedMove } from '../lib/rank'
import type { PlayerRow, EventRow } from '../hooks/useGame'
import { GameEventLog } from './GameEventLog'
import { StateLine } from './StateLine'
import shared from '@/common/game-page/playArea.module.css'
import styles from './InfoCol.module.css'

/** The AI suggest-a-move box's state (owned by PlayArea, rendered here).
 *  `idle` renders NOTHING — the box claims
 *  no space until there's something to show (a deliberate exception to the
 *  pre-claim-space rule; see the render site). `ready` remembers the board
 *  `version` the moves were computed against, so PlayArea can derive
 *  staleness at render (a teammate may have played). */
export type SuggestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; moves: RankedMove[]; version: number }
  | { status: 'error'; message: string }

/** "15" / "-3" / "19.5" — the rating, bare (no "+"; the score beside it keeps
 *  its plus), decimals only when the leave's half-point weights put them there. */
const rating = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1))

/**
 * scrabble's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/playarea.md → Info-column readouts): turn/score
 * readout → OpponentStrip → action row → help → setup disclosure → Moves log. Every
 * command arrives as a bound action this column places; the one callback up is
 * `onShowHistory`. PlayArea owns the RPCs + coordination. Prop names match the other games' columns for the
 * same idea (docs/playarea.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea.md.
  isCompete,
  myTurn,
  over,
  myConceded,
  isTerminal,
  currentTurnUserId,
  currentMember,
  teamScore,
  bagCount,
  players,
  selfId,
  playerStates,
  concededIds,
  actEndGame,
  actConcede,
  actRestart,
  actNewGame,
  actBackToClub,
  suggest,
  actSuggestMove,
  onApplySuggestion,
  setupRows,
  plays,
  historyId,
  onShowHistory,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  /** Whose turn it is is mine (compete); always true in coop. */
  myTurn: boolean
  /** The terminal message when the game is over (drives the action row), else null. */
  over: TerminalMessage | null
  /** I conceded (compete) — drives the "You conceded" terminal look. */
  myConceded: boolean
  isTerminal: boolean
  /** COOP turn-order pointer, or null for a free-for-all coop game. Non-null ⇒
   *  render the shared TurnStatusLine below the team-score line (compete uses its
   *  OWN seat-based turn line above, which also names AI seats). */
  currentTurnUserId: string | null

  // ── State readout (turn / team score + the bag) ──
  /** The player whose turn it is (compete) — its color + name drive the "Turn: ● name"
   *  line; undefined in coop / when unknown. */
  currentMember: Member | undefined
  /** The coop team score (null in compete). */
  teamScore: number | null
  bagCount: number

  // ── Players (the OpponentStrip) ──
  /** The roster (GamePlayer — carries the concede/result bits terminalOutcomeVerb reads). */
  players: GamePlayer[]
  selfId: string
  playerStates: PlayerRow[]
  concededIds: Set<string>

  // ── Action row (End/Concede, back-to-club at terminal) ──
  /** End the game for the whole table — coop's exit; it hides itself in a race. */
  actEndGame: BoundAction
  /** Drop out of a race while the others play on — hidden outside compete. */
  actConcede: BoundAction
  /** Deal this game again from scratch — same setup, roster and seats, fresh bag
   *  and racks. scrabble's grid is the standard layout, so a replay is a re-deal
   *  rather than a puzzle reset. */
  actRestart: BoundAction
  /** Start a fresh follow-up game — same setup + roster, a NEW game id. Disables
   *  itself while the create is in flight. */
  actNewGame: BoundAction
  /** Leave for the club — the shell's own action, off `ctx.menu`. */
  actBackToClub: BoundAction

  // ── Suggest-a-move (docs/scrabble-ai.md S5) ──
  /** The suggest box's state, or null to not render it at all (compete — the
   *  mode never changes mid-game, so its absence is not a reflow). */
  suggest: SuggestState | null
  /** Ask the AI for a move — it grays itself while a request is out and where
   *  the ask isn't available; the box below collapses entirely when idle. */
  actSuggestMove: BoundAction
  /** Stage a suggested move's tiles on the board (BoardCol applies it). */
  onApplySuggestion: (move: RankedMove) => void

  // ── Setup disclosure ──
  setup: ScrabbleSetup
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]

  // ── Turn-history log (Moves) ──
  plays: EventRow[]
  /** The play currently open in the board viewer (by seq), or null. */
  historyId: number | null
  onShowHistory: (seq: number) => void
}) {
  // ── The score strip's roster: every seat, in seat order ──
  // A bot is a player like anyone, so `players` already holds it; what the
  // common roster has no notion of is SEAT ORDER, which is this game's and
  // lives on `playerStates`. Ordering by it keeps the strip reading left to
  // right the way the table is dealt.
  const scoreRoster: Member[] = [...playerStates]
    .sort((a, b) => a.seat - b.seat)
    .flatMap((p) => players.find((m) => m.user_id === p.user_id) ?? [])
  const scoreOf = (player: Member): number =>
    playerStates.find((p) => p.user_id === player.user_id)?.score ?? 0
  const outcomeOf = (player: Member): string =>
    terminalOutcomeVerb(players.find((m) => m.user_id === player.user_id))

  return (
    <div className={shared.infoCol}>
      <div className={shared.noShrinkRow}>
        {/* InfoCol order is FIXED (docs/playarea.md → Info-column readouts):
            state → opponent strip → action row → help → setup disclosure → log. */}

        {/* State — whose turn (compete) / team score (coop) + the bag count. The
            SAME <StateLine> the mobile status bar renders above the board (they
            must never drift). */}
        <p className={shared.infoState}>
          <StateLine
            isCompete={isCompete}
            isTerminal={isTerminal}
            myTurn={myTurn}
            currentMember={currentMember}
            teamScore={teamScore}
            bagCount={bagCount}
          />
        </p>
        {/* Coop turn-order: whose turn it is, as a separate line below the team
            score (compete's own seat turn line is inline above). Only for a
            turn-order coop game (pointer non-null); fixed at create-time, so no
            reflow. */}
        {!isCompete && currentTurnUserId !== null && (
          <TurnStatusLine
            currentTurnUserId={currentTurnUserId}
            players={players}
            selfId={selfId}
            isTerminal={isTerminal}
          />
        )}

        {/* Opponent strip (compete) — every SEAT's score on one line, identity on a
            leading disc. Scores aren't hidden (the board reveals them).

            AI seats ride the same strip as synthetic Members, though bots aren't
            in the common roster: a second line of their own drifts (two "Score:"
            labels, disagreeing about which of the label / name / number is
            bold). One roster, one label, one typography.
            Seat order, so the strip reads in turn order (orderSelfFirst still
            hoists the viewer). */}
        {isCompete && (
          <OpponentStrip
            players={scoreRoster}
            selfId={selfId}
            metricLabel="Score"
            metricFor={(player) => {
              // Mid-game a conceder reads as "out".
              if (!isTerminal) return concededIds.has(player.user_id) ? 'out' : scoreOf(player)
              // At terminal the per-seat OUTCOME rides along, and it earns its
              // place: the action row beneath names only the winner, so
              // this is the only thing distinguishing a player who QUIT from one
              // who played to the end and lost — which matters the moment there
              // are three seats rather than two.
              //
              // Parenthesized, not `·`-joined. `·` is the strip's PLAYER
              // separator, so the old "Lost · 260" made
              // "You: Lost · 260 · AI 1: 333" run three separators doing two
              // different jobs. Score first, because the number is what the eye
              // is scanning for; the verb is an annotation on it.
              return `${scoreOf(player)} (${outcomeOf(player).toLowerCase()})`
            }}
          />
        )}

        {/* Action row — End (coop) / Concede (compete) during play; the "You
            conceded" terminal look once I've dropped out (others race on); at
            terminal the bold outcome line + a compact back-to-club button. */}
        {over ? (
          <InfoActionsRow message={{ text: over.infoColText, outcome: over.outcome }}>
            {/* Stay-here options left of the leave option (Club): deal this table
                again, or spin up the next game. */}
            <ActionButton action={actRestart} show="icon" />
            <ActionButton action={actNewGame} show="icon" />
            <ActionButton action={actBackToClub} show="icon" weight="primary" />
          </InfoActionsRow>
        ) : isCompete && myConceded ? (
          <InfoActionsRow message={{ text: 'You conceded', outcome: 'neutral' }}>
            {/* Concede disables itself once conceded — the row keeps its shape
                and the button says why it can't be pressed again. */}
            <ActionButton action={actConcede} show="icon" />
          </InfoActionsRow>
        ) : (
          <InfoActionsRow>
            {/* Both exits are placed; each hides itself in the mode that isn't
                its own, so this row asks nothing about coop vs compete. */}
            <ActionButton action={actConcede} show="icon" />
            <ActionButton action={actEndGame} show="icon" />
            {/* Suggest-a-move (coop) — the AI hint lives with the other action
                buttons; its results render in the reserved box below the help
                text. It hides itself in a race. */}
            <ActionButton action={actSuggestMove} show="icon" />
          </InfoActionsRow>
        )}

        {/* Help — only while the player can act on it (never silently swapped). */}
        {!over && (
          <p className={shared.infoHelp}>
            Drag tiles onto the board, or tap a square and type. Arrows move the cursor (a sideways
            arrow turns it ↓). Enter plays.
          </p>
        )}

        {/* Suggest-a-move results (coop; the button is up in the action row).
            When idle the box renders NOTHING and claims no space — a deliberate
            exception to the pre-claim-space rule (Joel's call): an empty
            reserved gap below the help text read as clutter. Once it holds
            content (loading / results / error) it snaps to a FIXED height so a
            suggestion arriving never shifts the sections BELOW it relative to
            "Thinking…" — see the module css. The one accepted shift is
            idle→shown, which the player triggers by clicking Suggest. Clicking
            a row stages that move's tiles on the board; the suggester never
            submits. */}
        {suggest && suggest.status !== 'idle' && (
          <div className={styles.suggestBox} data-zone="suggest">
            {suggest.status === 'loading' && <p>Thinking…</p>}
            {suggest.status === 'error' && <p className={styles.suggestError}>{suggest.message}</p>}
            {suggest.status === 'ready' && suggest.moves.length === 0 && (
              <p>No legal moves — swap tiles?</p>
            )}
            {suggest.status === 'ready' &&
              suggest.moves.map((move, i) => (
                <button
                  key={i}
                  type="button"
                  className={styles.suggestRow}
                  onClick={() => onApplySuggestion(move)}
                  title="Stage these tiles on the board"
                >
                  <span className={styles.suggestWords}>
                    {move.words.map((w) => w.word).join(', ')}
                  </span>
                  <span className={styles.suggestScore}>+{move.score}</span>
                  {/* The overall rating — equity = score + the leave heuristic
                      (how good the kept rack is), the value the list is
                      actually sorted by. Muted on purpose (Joel's spec): the
                      score is the headline, this is the "but really" number. */}
                  <span className={styles.suggestRating}>({rating(move.equity)})</span>
                </button>
              ))}
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

      <GameEventLog
        plays={plays}
        players={players}
        selfId={selfId}
        mode={isCompete ? 'compete' : 'coop'}
        historyId={historyId}
        onShowHistory={onShowHistory}
      />
    </div>
  )
}
