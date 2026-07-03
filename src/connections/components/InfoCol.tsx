import { cls } from '../../common/lib/cls'
import { timerLabel } from '../../common/lib/timerLabel'
import type { TerminalCopy } from '../../common/lib/terminalCopy'
import { TerminalActionRow } from '../../common/components/TerminalActionRow'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { HintButton } from '../../common/components/buttons/HintButton'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { SetupDisclosure } from '../../common/components/SetupDisclosure'
import type { ConnectionsSetup } from '../lib/setup'
import type { GuessRow, MatchedCategory, Player } from '../hooks/useGame'
import { GameTurnLog } from './GameTurnLog'
import shared from '../../common/components/PlayArea.module.css'

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
 * pieces in the fixed order (docs/design-decisions.md → Info column): state readout →
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
  found,
  categoryCount,
  mistakeCount,
  mistakeBudget,
  players,
  selfId,
  opponentFound,
  concededIds,
  onHints,
  onEndGame,
  onConcede,
  onBackToClub,
  setup,
  puzzleDate,
  tileCount,
  guesses,
  matchedCategories,
  viewingTurn,
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
  opponentFound: ReadonlyMap<string, number>
  /** Who has conceded (drives the OpponentStrip "out" mid-game). */
  concededIds: Set<string>

  // ── Action row (Hints + End/Concede, back-to-club at terminal) ──
  onHints: () => void
  onEndGame: () => void
  onConcede: () => void
  onBackToClub: () => void

  // ── Setup disclosure ──
  setup: ConnectionsSetup
  /** The puzzle's NYT date (setup echo), or null for a custom puzzle. */
  puzzleDate: string | null
  /** The number of board tiles (setup echo). */
  tileCount: number

  // ── Turn-history log (GameTurnLog) ──
  guesses: GuessRow[]
  matchedCategories: MatchedCategory[]
  /** The turn currently open in the board viewer (by log position), or null. */
  viewingTurn: number | null
  onSelectTurn: (index: number) => void
}) {
  // The End / Concede button — error-toned (red). Compete uses CONCEDE (drop out of
  // the race → connections.concede); coop uses the neutral "End" (a mutual "we're
  // done" → end_game). Shared by the playing and the locally-terminal action rows.
  const endButton = isCompete ? (
    <ConcedeGameButton onClick={onConcede} className={shared.helperButton} disabled={myConceded} />
  ) : (
    <EndGameButton onClick={onEndGame} className={shared.helperButton} />
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
                  : (opponentFound.get(p.user_id) ?? 0)
            }
          />
        )}

        {/* Action row — three states. Playing: Hints + End/Concede. Locally terminal
            (out of mistakes OR conceded, the rest race on): the terminal LOOK, a bold
            status ("You're out" / "You conceded") + Concede. Terminal: the outcome
            line + a compact back-to-club button. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} />
        ) : !showInput ? (
          <div className={cls(shared.infoActions, shared.terminalActions)}>
            <span className={cls(shared.outcome, shared.outcome_neutral)}>
              {myConceded ? 'You conceded' : 'You’re out'}
            </span>
            {endButton}
          </div>
        ) : (
          <div className={shared.infoActions}>
            {/* Hints opens the per-player HintModal (warning-toned, amber). */}
            <HintButton label="Hints" onClick={onHints} className={shared.helperButton} />
            {endButton}
          </div>
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
          <li>{tileCount} words</li>
          <li>{categoryCount} categories to find</li>
          <li>{mistakeBudget} mistakes allowed</li>
          <li>{timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      {/* Turn log: coop shows every player's guesses; in compete RLS already filters
          to the caller's own, so the FE does nothing special. */}
      <GameTurnLog
        guesses={guesses}
        matchedCategories={matchedCategories}
        players={players}
        viewingTurn={viewingTurn}
        onSelectTurn={onSelectTurn}
      />
    </div>
  )
}
