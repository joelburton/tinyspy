import { cls } from '../../common/lib/util/cls'
import type { Member } from '../../common/lib/games'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { timerLabel } from '../../common/lib/game/timerLabel'
import { DIFFICULTY_LABELS } from '../../common/lib/game/difficulty'
import { OpponentStrip } from '../../common/components/game/OpponentStrip'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import type { WaffleSetup } from '../lib/setup'
import type { WafflePlayerState, SwapRow } from '../hooks/useGame'
import { SolutionReveal } from './SolutionReveal'
import { GameTurnLog } from './GameTurnLog'
import shared from '../../common/components/game/PlayArea.module.css'

/**
 * waffle's info column — near-zero state, an arrangement of the shared scaffold
 * pieces in the fixed order (docs/design-decisions.md → Info column): swap-state
 * readout → OpponentStrip → action row → help → setup disclosure → terminal answer
 * reveal → swap log. Every mutation is a named callback up
 * (`onEndGame`/`onConcede`/`onSelectTurn`); PlayArea owns the RPCs + coordination.
 * Prop names match the other games' columns for the same idea (see
 * docs/playarea-decomposition-plan.md).
 */
export function InfoCol({
  // Props are grouped by the region they drive (mirroring the render order below), so
  // "what is this prop for?" is answerable by eye; the `// ── … ──` headers on the type
  // block below name each group. Names are shared with the other games' columns for the
  // same idea — see docs/playarea-decomposition-plan.md.
  isCompete,
  over,
  isPlayer,
  selfDone,
  myConceded,
  selfSolved,
  swapsUsed,
  maxSwaps,
  remaining,
  parSwaps,
  players,
  selfId,
  playerStates,
  concededIds,
  onEndGame,
  onConcede,
  onBackToClub,
  setup,
  solution,
  swaps,
  viewingIndex,
  onSelectTurn,
}: {
  // ── Mode + phase ──
  isCompete: boolean
  /** Terminal copy when the game is over (drives the action row + modal), else null. */
  over: TerminalCopy | null
  /** Am I a player in this game (gates the action row + help). */
  isPlayer: boolean
  /** I can't act any more, but the game continues for others (compete: solved / out
   *  of swaps / conceded) — drives the terminal LOOK. The broader analog of the other
   *  games' concede-only `isLocallyDone`: waffle is a per-player-board race, so you can
   *  also be locally done by solving your board or running out of swaps, not just by
   *  conceding — which is why it needs its own name. */
  selfDone: boolean
  /** I conceded (vs solved / out of swaps) — picks the `selfDone` status wording. */
  myConceded: boolean
  /** I solved my board — picks the `selfDone` status wording. */
  selfSolved: boolean

  // ── State readout (the swap count line) ──
  swapsUsed: number
  maxSwaps: number
  remaining: number
  parSwaps: number

  // ── Players (the OpponentStrip) ──
  players: Member[]
  selfId: string
  playerStates: WafflePlayerState[]
  concededIds: Set<string>

  // ── Action row (End/Concede, back-to-club at terminal) ──
  onEndGame: () => void
  onConcede: () => void
  onBackToClub: () => void

  // ── Setup disclosure + terminal answer reveal ──
  setup: WaffleSetup
  /** The 25-char solution board, revealed at game-over (terminal only). */
  solution: string | null

  // ── Turn-history log (GameTurnLog — coop only) ──
  swaps: SwapRow[]
  /** The swap currently open in the board viewer (by log position), or null. */
  viewingIndex: number | null
  onSelectTurn: (index: number) => void
}) {
  const difficultyLabel = DIFFICULTY_LABELS[setup.difficulty - 1] ?? '—'

  // The End / Concede button — error-toned (red), shared by the "playing" and the
  // "locally terminal" action rows (you can bow out either way). compete CONCEDES
  // ("I give up, you keep racing"); coop ENDS (a neutral mutual "we're done"). Two
  // components for two semantically distinct actions (docs/design-decisions.md →
  // End vs Concede).
  const endButton = isCompete ? (
    <ConcedeGameButton onClick={onConcede} className={shared.helperButton} disabled={myConceded} />
  ) : (
    <EndGameButton onClick={onEndGame} className={shared.helperButton} />
  )

  return (
    <div className={shared.infoCol}>
      <div className={shared.actionSlot}>
        {/* InfoCol order is FIXED (docs/design-decisions.md → InfoCol order):
            state → opponent strip → action row → help → setup disclosure → log. */}

        {/* State — shown in both play and terminal. */}
        <p className={shared.infoState}>
          Swaps{' '}
          <strong>
            {swapsUsed}/{maxSwaps}
          </strong>{' '}
          ({remaining} left) · Par <strong>{parSwaps}</strong>
        </p>

        {/* Opponent strip (compete) — each player's swaps used + a ✓/✗ done mark. */}
        {isCompete && (
          <OpponentStrip
            players={players}
            selfId={selfId}
            metricLabel="Swaps"
            metricFor={(player) => {
              // A conceded player is 'out' mid-game — they dropped out, so their
              // swap count is moot (mirrors wordle's strip).
              if (concededIds.has(player.user_id)) return 'out'
              const ps = playerStates.find((p) => p.user_id === player.user_id)
              const used = ps?.swaps_used ?? 0
              const solved = ps?.solved ?? false
              const out = !solved && used >= maxSwaps
              return (
                <>
                  {used}
                  {solved ? ' ✓' : out ? ' ✗' : ''}
                </>
              )
            }}
          />
        )}

        {/* Action row — four states. TERMINAL: the bold outcome line + back-to-club.
            LOCALLY TERMINAL (compete: solved / out of swaps, the rest race on): the
            terminal LOOK — a bold status + Concede. PLAYING: just End/Concede.
            WATCHING (not in the game): a bold note, no button. */}
        {over ? (
          <TerminalActionRow over={over} onBackToClub={onBackToClub} />
        ) : selfDone ? (
          <div className={cls(shared.infoActions, shared.terminalActions)}>
            <span className={cls(shared.outcome, shared.outcome_neutral)}>
              {myConceded ? 'You conceded' : selfSolved ? 'Solved — waiting' : 'Out of swaps'}
            </span>
            {endButton}
          </div>
        ) : isPlayer ? (
          <div className={shared.infoActions}>{endButton}</div>
        ) : (
          <div className={cls(shared.infoActions, shared.terminalActions)}>
            <span className={cls(shared.outcome, shared.outcome_neutral)}>
              Watching — not in this game
            </span>
          </div>
        )}

        {/* Help — shown ONLY while you can actually act on it (the locally-terminal /
            watching states are carried loudly by the action row above). */}
        {isPlayer && !over && !selfDone && (
          <p className={shared.infoHelp}>Tap two tiles to swap them.</p>
        )}

        {/* Setup — LAST before the log, behind a disclosure (closed by default). */}
        <SetupDisclosure>
          <li>{difficultyLabel} difficulty</li>
          <li>
            Par {parSwaps} + {setup.extra_swaps} extra = {maxSwaps} swaps
          </li>
          <li>{timerLabel(setup.timer)}</li>
        </SetupDisclosure>
      </div>

      {/* Terminal-only extra: the answer (the six solution words). In the info column
          — NOT the below-board slot — because it's several lines and would overflow
          the viewport there. The shared `.terminalExtra` grows the info column at
          game-over (a deliberate layout-stability exception). */}
      {over && solution && (
        <div className={shared.terminalExtra}>
          <SolutionReveal solution={solution} />
        </div>
      )}

      {/* The shared swap log — coop only (compete writes none, and a swap sequence
          would leak an opponent's hidden board). Rows are clickable to replay that
          swap on the board. */}
      {!isCompete && (
        <GameTurnLog
          swaps={swaps}
          players={players}
          viewingIndex={viewingIndex}
          onSelectTurn={onSelectTurn}
        />
      )}
    </div>
  )
}
