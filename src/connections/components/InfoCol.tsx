// cs-unmet

import type { TerminalCopy } from '@/common/terminal/terminalCopy'
import { TerminalActionRow } from '@/common/terminal/TerminalActionRow'
import { ActionButton } from '@/common/actions/ActionButton'
import type { BoundAction } from '@/common/actions/useBoundAction'
import { LocalTerminalRow } from '@/common/terminal/LocalTerminalRow'
import { OpponentStrip } from '@/common/info-sheet/OpponentStrip'
import type { SetupRow } from '@/common/setup-form/setupRows'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import type { ConnectionsSetup } from '../lib/setup'
import type { Board, CategoryRank } from '../lib/board'
import type { GuessRow, Player } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import { HintList } from './HintList'
import { TurnStatusLine } from '@/common/turn-log/TurnStatusLine'
import shared from '@/common/game-page/PlayArea.module.css'


/**
 * connections's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/playarea.md → Info-column readouts): state readout →
 * OpponentStrip (compete) → action row → help → setup disclosure → turn log. Shared
 * between coop and compete: `isCompete` picks the OpponentStrip, and the two exits
 * hide themselves. Every command arrives as a bound action this column simply
 * places — what it does, whether it applies right now and which key also fires it
 * are the action's own business; the plain callbacks left (`onSelectTurn`,
 * `onRevealHint`) are coordination rather than commands. Prop names match the
 * other games' columns for the same idea (docs/playarea.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea.md.
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
  actHint,
  actEndGame,
  actConcede,
  actRestart,
  actReveal,
  actNewGame,
  actBackToClub,
  setupRows,
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
  /** Unfold / fold the inline hint list. Carries its own two faces. */
  actHint: BoundAction
  /** End the game for the whole table — coop's exit; it hides itself in a race. */
  actEndGame: BoundAction
  /** Drop out of a race while the others play on — hidden outside compete. */
  actConcede: BoundAction
  /** Solve THIS puzzle again from scratch — same sixteen tiles, same shuffle. */
  actRestart: BoundAction
  /** Show the categories nobody solved — or put them away, bringing back the
   *  board as the game ended. A local display toggle; nothing is written, and it
   *  carries its own two faces (see PlayArea's useSolutionReveal). */
  actReveal: BoundAction
  /** Start the NEXT unplayed daily puzzle — connections' archive is dated, so
   *  this walks forward rather than re-rolling a board. Disables itself while
   *  the create is in flight, so a slow network reads as "working". */
  actNewGame: BoundAction
  /** Leave for the club — the shell's own action, off `ctx.menu`. */
  actBackToClub: BoundAction

  // ── Setup disclosure ──
  setup: ConnectionsSetup
  /** The setup recap — the SAME array the PDF prints (lib/setupSummary.ts). */
  setupRows: SetupRow[]
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
  // Both exits are placed and each hides itself in the mode that isn't its own
  // (compete CONCEDES — drop out of the race; coop ENDS — a mutual "we're done"),
  // so this row asks nothing. Shared by the playing and locally-terminal rows.
  // Icon-only (the canonical action-row treatment): the tooltip carries the label.
  const endButton = (
    <>
      <ActionButton action={actConcede} show="icon" />
      <ActionButton action={actEndGame} show="icon" />
    </>
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
            line + Reveal / Restart / New game / Club. */}
        {over ? (
          <TerminalActionRow over={over}>
            {/* Stay-here options left of the leave option (Club): see the
                categories you didn't get, run this puzzle back, or move on to
                the next unplayed date. */}
            <ActionButton action={actReveal} show="icon" />
            <ActionButton action={actRestart} show="icon" />
            <ActionButton action={actNewGame} show="icon" />
            <ActionButton action={actBackToClub} show="icon" weight="primary" />
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
              <ActionButton
                action={actHint}
                show="icon"
                aria-pressed={hintsOpen}
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
          {setupRows.map((r) => (
            <li key={r.key}>
              {r.label}: {r.value}
            </li>
          ))}
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
