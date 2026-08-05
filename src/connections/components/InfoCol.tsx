import { timerLabel } from '../../common/lib/game/timerLabel'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { RestartButton } from '../../common/components/buttons/RestartButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { HintButton } from '../../common/components/buttons/HintButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import type { ConnectionsSetup } from '../lib/setup'
import type { Board, CategoryRank } from '../lib/board'
import type { GuessRow, Player } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import { HintList } from './HintList'
import { TurnStatusLine } from '../../common/components/game/TurnStatusLine'
import shared from '../../common/components/game/PlayArea.module.css'

/** Format a puzzle's NYT date (`YYYY-MM-DD`) for the setup disclosure. Parsed as
 *  UTC so a calendar date never shifts by a local-tz offset (matches Calendar). */
function formatPuzzleDate(d: string | null): string {
  if (!d) return 'custom puzzle'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * connections's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/playarea.md → Info-column readouts): state readout →
 * OpponentStrip (compete) → action row → help → setup disclosure → turn log. Shared
 * between coop and compete: `isCompete` picks the OpponentStrip + Concede (vs End).
 * Every mutation is a named callback up (`onHints`/`onEndGame`/`onConcede`/
 * `onSelectTurn`); PlayArea owns the RPCs + coordination. Prop names match the other
 * games' columns for the same idea (docs/playarea-decomposition-plan.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea-decomposition-plan.md.
  isCompete,
  over,
  showInput,
  myConceded,
  currentTurnUserId,
  found,
  categoryCount,
  mistakeCount,
  mistakeBudget,
  players,
  selfId,
  metricByUser,
  concededIds,
  categories,
  hintsOpen,
  revealedHints,
  onRevealHint,
  onHints,
  onEndGame,
  onConcede,
  onRestart,
  onNewGame,
  startingNewGame,
  onBackToClub,
  setup,
  puzzleDate,
  tileCount,
  guesses,
  viewingIndex,
  onSelectTurn,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  /** Terminal copy when the game is over (drives the action row), else null. */
  over: TerminalCopy | null
  /** May I still submit? Gates the play action row + help (vs the locally-done look). */
  showInput: boolean
  /** I conceded / was eliminated in a compete race — picks the locally-done wording. */
  myConceded: boolean
  /** Whose turn it is under turn-order, or null for a free-for-all game.
   *  Non-null ⇒ render the shared TurnStatusLine (a turn game). */
  currentTurnUserId: string | null

  // ── State readout (categories found + mistakes) ──
  found: number
  categoryCount: number
  mistakeCount: number
  mistakeBudget: number

  // ── Players (the OpponentStrip — compete) ──
  /** The roster (identity + per-player concede flags). */
  players: Player[]
  selfId: string
  /** Opponents' public categories-found counts (`connections.players.matched_count`). */
  metricByUser: ReadonlyMap<string, number>
  /** Who has conceded (drives the OpponentStrip "out" mid-game). */
  concededIds: Set<string>

  // ── Action row (Hints + End/Concede, back-to-club at terminal) ──
  /** The board's 4 categories — feeds the inline HintList (first-tile reveals). */
  categories: Board['categories']
  /** Is the inline hint list unfolded? The Hints button toggles this (PlayArea owns it). */
  hintsOpen: boolean
  /** Revealed hint categories + the reveal callback — owned by PlayArea so a
   *  Restart can clear them (see <HintList>'s `revealed` prop). */
  revealedHints: ReadonlySet<CategoryRank>
  onRevealHint: (rank: CategoryRank) => void
  onHints: () => void
  onEndGame: () => void
  onConcede: () => void
  /** Solve THIS puzzle again from scratch — same sixteen tiles, same shuffle
   *  (the menu's replay-board; unconfirmed at terminal, nothing left to lose). */
  onRestart: () => void
  /** Start the NEXT unplayed daily puzzle — connections' archive is dated, so
   *  this walks forward rather than re-rolling a board. */
  onNewGame: () => void
  /** New game is mid-flight — disables the button so a slow network reads as
   *  "working", not "nothing happened". Paired with the menu item's own
   *  `disabled`; see useSingleFlight in this game's PlayArea. */
  startingNewGame?: boolean
  onBackToClub: () => void

  // ── Setup disclosure ──
  setup: ConnectionsSetup
  /** The puzzle's NYT date (setup echo), or null for a custom puzzle. */
  puzzleDate: string | null
  /** The number of board tiles (setup echo). */
  tileCount: number

  // ── Turn-history log (GameTurnLog) ──
  guesses: GuessRow[]
  /** The turn currently open in the board viewer (by log position), or null. */
  viewingIndex: number | null
  onSelectTurn: (index: number) => void
}) {
  // The End / Concede button — error-toned (red). Compete uses CONCEDE (drop out of
  // the race → connections.concede); coop uses the neutral "End" (a mutual "we're
  // done" → end_game). Shared by the playing and the locally-terminal action rows.
  // Icon-only (the canonical action-row treatment): the styled tooltip carries
  // the label.
  const endButton = isCompete ? (
    <ConcedeGameButton iconOnly onClick={onConcede} className={shared.helperButton} disabled={myConceded} />
  ) : (
    <EndGameButton iconOnly onClick={onEndGame} className={shared.helperButton} />
  )

  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        {/* State — categories found + mistakes (the mistakes dots live below the
            board; this is the at-a-glance textual count, kept here too). */}
        <p className={shared.infoState}>
          <strong>
            {found}/{categoryCount}
          </strong>{' '}
          categories found ·{' '}
          <strong>
            {mistakeCount}/{mistakeBudget}
          </strong>{' '}
          mistakes
        </p>
        {/* Whose-turn line — only for a turn-order game (pointer non-null). A
            separate line below the state readout; never replaces it. */}
        {currentTurnUserId !== null && (
          <TurnStatusLine
            currentTurnUserId={currentTurnUserId}
            players={players}
            selfId={selfId}
            isTerminal={over !== null}
          />
        )}

        {/* Opponent strip (compete) — the race comparison: each player's categories
            FOUND (public via players.matched_count). */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Found"
            metricFor={(p, isSelf) =>
              // A dropped-out racer reads 'out' mid-game (their found-count is frozen
              // and no longer part of the race); everyone else shows their live
              // categories-found.
              concededIds.has(p.user_id)
                ? 'out'
                : isSelf
                  ? found
                  : (metricByUser.get(p.user_id) ?? 0)
            }
          />
        )}

        {/* Action row — three states. Playing: Hints + End/Concede. Locally terminal
            (out of mistakes OR conceded, the rest race on): the terminal LOOK, a bold
            status ("You're out" / "You conceded") + Concede. Terminal: the outcome
            line + a compact back-to-club button. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} iconOnly>
            {/* Stay-here options left of the leave option (Club): run this
                puzzle back, or move on to the next unplayed date. */}
            <RestartButton iconOnly onClick={onRestart} />
            <NewGameButton iconOnly onClick={onNewGame} disabled={startingNewGame} />
          </TerminalActionRow>
        ) : !showInput ? (
          <LocalTerminalRow label={myConceded ? 'You conceded' : 'You’re out'}>
            {endButton}
          </LocalTerminalRow>
        ) : (
          <>
            <div className={shared.infoActions}>
              {/* Hints toggles the inline HintList below (warning-toned, amber);
                  aria-pressed reflects whether the list is currently unfolded. */}
              <HintButton
                iconOnly
                label="Hints"
                onClick={onHints}
                aria-pressed={hintsOpen}
                className={shared.helperButton}
              />
              {endButton}
            </div>
            {/* The per-player hint reveals — unfolds right under the action row when
                Hints is on; stays mounted (so revealed tiles persist across toggles). */}
            <HintList
              categories={categories}
              open={hintsOpen}
              revealed={revealedHints}
              onReveal={onRevealHint}
            />
          </>
        )}

        {/* Help — shown only while you can act on it (never silently swaps); the
            eliminated state is carried loudly by the action row above. */}
        {showInput && (
          <p className={shared.infoHelp}>Pick 4 tiles that share a connection, then Submit.</p>
        )}

        {/* Setup — last, behind a disclosure (closed by default so it doesn't claim
            space). */}
        <SetupDisclosure>
          <li>Puzzle: {formatPuzzleDate(puzzleDate)}</li>
          <li>Words: {tileCount}</li>
          <li>Categories: {categoryCount}</li>
          <li>Mistakes allowed: {mistakeBudget}</li>
          <li>Timer: {timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      {/* Turn log. Coop shows the whole shared game; compete gets the shared
          "whose guesses?" picker — an opponent's rows are RLS-hidden during play
          and open at terminal, so the picker is how you compare lines afterwards. */}
      <GameTurnLog
        guesses={guesses}
        categories={categories}
        players={players}
        selfId={selfId}
        mode={isCompete ? 'compete' : 'coop'}
        isTerminal={over !== null}
        viewingIndex={viewingIndex}
        onSelectTurn={onSelectTurn}
      />
    </div>
  )
}
