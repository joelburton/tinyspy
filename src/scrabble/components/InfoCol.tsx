import { outcomeVerb, type Member, type GamePlayer } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { TurnStatusLine } from '../../common/components/game/TurnStatusLine'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { RestartButton } from '../../common/components/buttons/RestartButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { AIButton } from '../../common/components/buttons/AIButton'
import type { ScrabbleSetup } from '../lib/setup'
import type { SetupRow } from '../../common/lib/game/setupRows'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import type { RankedMove } from '../lib/rank'
import type { PlayerRow, PlayRow } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import { StateLine } from './StateLine'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './InfoCol.module.css'

/** The AI suggest-a-move box's state (owned by PlayArea, rendered here —
 *  the LocalFeedbackMsg convention). `idle` renders NOTHING — the box claims
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
 * mutation is a named callback up (`onEndGame`/`onConcede`/`onSelectTurn`); PlayArea
 * owns the RPCs + coordination. Prop names match the other games' columns for the
 * same idea (docs/playarea-decomposition-plan.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea-decomposition-plan.md.
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
  onEndGame,
  onConcede,
  onRestart,
  onNewGame,
  startingNewGame,
  onBackToClub,
  suggest,
  canSuggest,
  onSuggest,
  onApplySuggestion,
  setupRows,
  aiSeats,
  winnerSeat,
  aiMemberOfSeat,
  plays,
  viewingSeq,
  onSelectTurn,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  /** Whose turn it is is mine (compete); always true in coop. */
  myTurn: boolean
  /** Terminal copy when the game is over (drives the action row + modal), else null. */
  over: TerminalCopy | null
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
  /** The roster (GamePlayer — carries the concede/result bits playerOutcome reads). */
  players: GamePlayer[]
  selfId: string
  playerStates: PlayerRow[]
  concededIds: Set<string>

  // ── Action row (End/Concede, back-to-club at terminal) ──
  onEndGame: () => void
  onConcede: () => void
  /** Deal this game again from scratch — same setup, roster and seats, fresh bag
   *  and racks (the menu's replay-board; unconfirmed at terminal since there's no
   *  progress left to lose). scrabble's grid is the standard layout, so a replay
   *  is a re-deal rather than a puzzle reset. */
  onRestart: () => void
  /** Start a fresh follow-up game — same setup + roster, a NEW game id. */
  onNewGame: () => void
  /** New game is mid-flight — disables the button so a slow network reads as
   *  "working", not "nothing happened". Paired with the menu item's own
   *  `disabled`; see useSingleFlight in this game's PlayArea. */
  startingNewGame?: boolean
  onBackToClub: () => void

  // ── Suggest-a-move (docs/scrabble-ai.md S5) ──
  /** The suggest box's state, or null to not render it at all (compete — the
   *  mode never changes mid-game, so its absence is not a reflow). */
  suggest: SuggestState | null
  /** May ask right now (playing, seated, not over) — gates the button only;
   *  the box collapses entirely when idle (nothing to show). */
  canSuggest: boolean
  onSuggest: () => void
  /** Stage a suggested move's tiles on the board (BoardCol applies it). */
  onApplySuggestion: (move: RankedMove) => void

  // ── Setup disclosure ──
  setup: ScrabbleSetup
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]

  // ── AI opponents (compete; docs/scrabble-ai-strength.md) ──
  /** The AI seats' display rows (name + disc color + live score), or empty. */
  aiSeats: { seat: number; name: string; color: string; score: number }[]
  /** The winning seat at terminal (`status.winner_seat`), or null. Only an AI
   *  needs it — a human's result rides their `common.game_players` row, but a
   *  bot has no such row, so the seat is the only thing that names it a winner. */
  winnerSeat: number | null
  /** Resolve an AI seat to a synthetic Member (for the Moves log actor tag). */
  aiMemberOfSeat: (seat: number | null) => Member | undefined

  // ── Turn-history log (Moves) ──
  plays: PlayRow[]
  /** The play currently open in the board viewer (by seq), or null. */
  viewingSeq: number | null
  onSelectTurn: (seq: number) => void
}) {
  // ── The score strip's roster: every SEAT, human and AI, in seat order ──
  // AI seats aren't in `common.game_players`, so they're synthesized as Members
  // — the same shape (and the same `ai:<seat>` id space) the turn log already
  // uses for a bot's actor cell, so the two surfaces name a bot identically.
  const aiAsMembers: Member[] = aiSeats.map((ai) => ({
    user_id: `ai:${ai.seat}`,
    username: ai.name,
    color: ai.color,
  }))
  const scoreRoster: Member[] = [...players, ...aiAsMembers]
  // One lookup for both kinds: a bot's score rides its seat row, a human's its
  // player row.
  const aiOfMember = (player: Member) => aiSeats.find((a) => `ai:${a.seat}` === player.user_id)
  const scoreOf = (player: Member): number =>
    aiOfMember(player)?.score
    ?? playerStates.find((p) => p.user_id === player.user_id)?.score
    ?? 0
  // A bot has no common.game_players row, so `outcomeVerb` can't reach it — its
  // result comes off the winning SEAT instead. A bot can't concede, so Won/Lost
  // is the whole space for it.
  const outcomeOf = (player: Member): string => {
    const ai = aiOfMember(player)
    if (ai) return ai.seat === winnerSeat ? 'Won' : 'Lost'
    return outcomeVerb(players.find((m) => m.user_id === player.user_id))
  }

  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
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

            AI seats ride the same strip as synthetic Members. They used to get
            their own second line, because bots aren't in the common roster — and
            that line drifted: two "Score:" labels, disagreeing about which of the
            label / name / number was bold. One roster, one label, one typography.
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
              // place: the TerminalActionRow beneath names only the winner, so
              // this is the only thing distinguishing a player who QUIT from one
              // who played to the end and lost — which matters the moment there
              // are three seats rather than two.
              //
              // Parenthesised, not `·`-joined. `·` is the strip's PLAYER
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
          <TerminalActionRow over={over} onBackToClub={onBackToClub} iconOnly>
            {/* Stay-here options left of the leave option (Club): deal this table
                again, or spin up the next game. */}
            <RestartButton iconOnly onClick={onRestart} />
            <NewGameButton iconOnly onClick={onNewGame} disabled={startingNewGame} />
          </TerminalActionRow>
        ) : isCompete && myConceded ? (
          <LocalTerminalRow label="You conceded">
            <ConcedeGameButton iconOnly className={shared.helperButton} disabled />
          </LocalTerminalRow>
        ) : (
          <div className={shared.infoActions}>
            {isCompete ? (
              <ConcedeGameButton iconOnly className={shared.helperButton} onClick={onConcede} />
            ) : (
              <>
                <EndGameButton iconOnly className={shared.helperButton} onClick={onEndGame} />
                {/* Suggest-a-move (coop) — the AI hint lives with the other
                    action buttons; its results render in the reserved box
                    below the help text. */}
                {suggest && (
                  <AIButton
                    iconOnly
                    label="Suggest"
                    className={shared.helperButton}
                    disabled={!canSuggest || suggest.status === 'loading'}
                    onClick={onSuggest}
                  />
                )}
              </>
            )}
          </div>
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

      <GameTurnLog
        plays={plays}
        players={players}
        // The bots as pickable actors — the same synthetic Members the log's
        // rows resolve to, so "AI 1" filters like any other player.
        aiMembers={aiSeats.flatMap((a) => aiMemberOfSeat(a.seat) ?? [])}
        aiMemberOfSeat={aiMemberOfSeat}
        selfId={selfId}
        mode={isCompete ? 'compete' : 'coop'}
        viewingSeq={viewingSeq}
        onSelectTurn={onSelectTurn}
      />
    </div>
  )
}
