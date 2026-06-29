import { useCallback, useEffect, useRef } from 'react'
import type { GamePageCtx, TimerMode } from '../../common/lib/games'
import { cls } from '../../common/lib/cls'
import { DIFFICULTY_LABELS } from '../../common/lib/difficulty'
import { colorVarFor } from '../../common/lib/memberColor'
import { IconEnd } from '../../common/components/icons'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { ResultFlash } from '../../common/components/ResultFlash'
import { useResultFlash } from '../../common/hooks/useResultFlash'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import type { WaffleSetup } from '../lib/setup'
import { SolutionReveal } from './SolutionReveal'
import { GameTurnLog } from './GameTurnLog'
import { WaffleGrid } from './WaffleGrid'
import shared from '../../common/components/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * waffle's play surface, shared by the coop and compete manifests, on the shared
 * two-column scaffold (board column + fixed info column — see docs/ui.md →
 * "PlayArea layout"):
 *
 *   - **Board column** — the square WaffleGrid (the caller's own board + live
 *     colors, top-aligned), with a below-board local-feedback slot under it (a
 *     rejected-swap error flash during play; the SolutionReveal answer at
 *     terminal).
 *   - **Info column** — the shared readouts (setup disclosure / live swap state /
 *     help) + an action row (just **End** during play; the outcome line + a
 *     compact back-to-club button at terminal), over the coop swap log.
 *
 * Mode is read from `game.mode`. Moves go through `waffle.submit_swap`;
 * board/colors update via the realtime refetch in `useGame` (Pattern A) — a swap
 * needs no optimistic local state (the FE can't compute colors; it doesn't hold
 * the solution).
 *
 * **Feedback split** (docs/deferred.md → Feedback channels): the player's OWN
 * errors (a rejected swap, a failed End) flash LOCALLY in the below-board slot;
 * the header pill carries PEER/group news — in compete, when an opponent solves
 * or runs out of swaps (coop needs none: the swap log already shows every move).
 */
export function PlayArea({
  session,
  gameId,
  players: members,
  playState,
  isTerminal,
  timer,
  setup,
  status,
  feedback,
  goToClub,
}: GamePageCtx) {
  const { game, players: playerStates, swaps, loading } = useGame(gameId)
  const { showModal, closeModal } = useTerminalModal(isTerminal)

  // Own-action feedback (LOCAL): a rejected swap or a failed End flashes in the
  // below-board slot — never the header pill (that's the peer/group channel).
  const { flash: actionFlash, show: flashAction } = useResultFlash()

  // ─── Compete peer news (header pill) ───────────────────
  // When an opponent's public state ticks — they solved the puzzle, or they ran
  // out of swaps — narrate it in the header (tension; compete has no swap log to
  // show it). The count/word stays hidden; we only surface the milestone. The
  // ref seeds silently on first load so history isn't replayed. Coop surfaces
  // nothing here (the swap log already shows every teammate move).
  const seenOpponentRef = useRef<Map<string, { solved: boolean; out: boolean }>>(
    new Map(),
  )
  useEffect(
    function announceOpponentMilestones() {
      if (!game || game.mode !== 'compete') return
      for (const ps of playerStates) {
        if (ps.user_id === session.user.id) continue
        const out = !ps.solved && ps.swaps_used >= game.max_swaps
        const prev = seenOpponentRef.current.get(ps.user_id)
        seenOpponentRef.current.set(ps.user_id, { solved: ps.solved, out })
        if (prev === undefined) continue // first sighting — seed, don't announce
        const member = members.find((m) => m.user_id === ps.user_id)
        const name = member?.username ?? 'Someone'
        const dot = colorVarFor(member?.color)
        if (ps.solved && !prev.solved) {
          feedback.show({
            tone: 'warning',
            variant: 'outline',
            dot,
            text: `${name} solved it`,
            dismiss: { kind: 'timed', ms: 3000 },
          })
        } else if (out && !prev.out) {
          feedback.show({
            tone: 'warning',
            variant: 'outline',
            dot,
            text: `${name} is out of swaps`,
            dismiss: { kind: 'timed', ms: 3000 },
          })
        }
      }
    },
    [playerStates, game, members, session.user.id, feedback],
  )

  const handleSwap = useCallback(
    async (a: number, b: number) => {
      const { error } = await db.rpc('submit_swap', {
        target_game: gameId,
        pos_a: a,
        pos_b: b,
      })
      // Own-action error → the local below-board flash. Success: the swap mutated
      // waffle.players → realtime refetch re-renders the board + colors.
      if (error) flashAction('bad', error.message)
    },
    [gameId, flashAction],
  )

  // Manual end — the friends agreeing they're done (neutral terminal, nobody
  // wins/loses). An action-row button now (like psychicnum / connections /
  // codenamesduet), off the GamePage menu. Confirmed; it's irreversible.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) flashAction('bad', `End game failed: ${error.message}`)
  }, [gameId, isTerminal, flashAction])

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  const waffleSetup = setup as WaffleSetup
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isPlayer = self !== undefined
  const isCompete = game.mode === 'compete'

  // The left grid always shows the caller's own board + live colors — including
  // at game-over (their final state). The solved answer is revealed separately
  // below the board (SolutionReveal).
  const board = self?.board ?? game.scramble
  const colors = self?.colors ?? null

  const swapsUsed = self?.swaps_used ?? 0
  const remaining = Math.max(0, game.max_swaps - swapsUsed)

  // In compete, `status.winner` is the winning player's id (or null).
  const selfWon = (status?.winner as string | undefined) === session.user.id
  const over = isTerminal
    ? buildOver({ mode: game.mode, playState, timerExpired: timer.expired, selfWon })
    : null

  const difficultyLabel = DIFFICULTY_LABELS[waffleSetup.difficulty - 1] ?? '—'

  return (
    <div className={cls(shared.layout, styles.layout)}>
      <div className={shared.boardCol}>
        <WaffleGrid
          board={board}
          colors={colors}
          disabled={isTerminal || !isPlayer}
          onSwap={handleSwap}
        />
        {/* The below-board slot — waffle's local-feedback zone: an own-action
            error flash (a rejected swap / failed End) for a beat, else empty
            (waffle's input is the board itself). A reserved height keeps the
            top-anchored board from shifting when the flash swaps in. The
            end-of-game answer is NOT here — it's several lines and would overflow
            the viewport (the page must never scroll); it lives in the info
            column's .terminalExtra instead. */}
        <div className={styles.inputRow}>
          {actionFlash ? (
            <ResultFlash
              tone={actionFlash.tone}
              label={actionFlash.label}
              className={styles.actionFlash}
            />
          ) : null}
        </div>
      </div>

      <div className={shared.infoCol}>
        {/* The non-log info column — the shared named readouts (.infoSetup /
            .infoState / .infoHelp / .infoActions) so they read the same across
            games. */}
        <div className={shared.actionSlot}>
          <details className={shared.infoSetup}>
            <summary>Setup options</summary>
            <ul>
              <li>{difficultyLabel} difficulty</li>
              <li>
                Par {game.par_swaps} + {waffleSetup.extra_swaps} extra ={' '}
                {game.max_swaps} swaps
              </li>
              <li>{timerLabel(waffleSetup.timer)}</li>
            </ul>
          </details>

          <p className={shared.infoState}>
            Swaps{' '}
            <strong>
              {swapsUsed}/{game.max_swaps}
            </strong>{' '}
            ({remaining} left) · Par <strong>{game.par_swaps}</strong>
          </p>

          {isCompete && (
            <OpponentStrip
              players={members}
              selfId={session.user.id}
              metricFor={(player) => {
                const ps = playerStates.find((p) => p.user_id === player.user_id)
                const used = ps?.swaps_used ?? 0
                const solved = ps?.solved ?? false
                const out = !solved && used >= game.max_swaps
                return (
                  <>
                    {used}
                    {solved ? ' ✓' : out ? ' ✗' : ''}
                  </>
                )
              }}
            />
          )}

          {/* Help — playing only (hidden once over). */}
          {!over && (
            <p className={shared.infoHelp}>
              {isPlayer
                ? 'Tap two tiles to swap them.'
                : "Watching — you're not in this game."}
            </p>
          )}

          {/* Action row. Playing: End (players only). Terminal: the bold,
              outcome-colored result line + a compact back-to-club button. */}
          {over ? (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared[`outcome_${over.tone}`])}>
                {over.message}
              </span>
              <BackToClubButton onClick={goToClub} compact />
            </div>
          ) : (
            isPlayer && (
              <div className={shared.infoActions}>
                <button
                  type="button"
                  className={cls('secondary', 'icon-button', shared.helperButton)}
                  onClick={() => void handleEndGame()}
                >
                  <IconEnd size={15} aria-hidden />
                  End
                </button>
              </div>
            )
          )}
        </div>

        {/* Terminal-only extra: the answer (the six solution words, each
            click-to-define). Lives in the info column — NOT the below-board slot —
            because it's several lines and would overflow the viewport there (the
            page must never scroll). The shared `.terminalExtra` region grows the
            info column at game-over (a deliberate layout-stability exception); the
            swap log below shrinks/scrolls to make room, the board doesn't move. */}
        {over && game.solution && (
          <div className={shared.terminalExtra}>
            <SolutionReveal solution={game.solution} />
          </div>
        )}

        {/* The shared swap log — coop only (compete writes none, and a swap
            sequence would leak an opponent's hidden board). */}
        {!isCompete && <GameTurnLog swaps={swaps} players={members} />}
      </div>

      {showModal && over && (
        <GameOverModal
          outcome={over.outcome}
          verdict={over.verdict}
          onClose={closeModal}
          onBackToClub={goToClub}
        />
      )}
    </div>
  )
}

/** One-line timer summary for the setup disclosure (same shape codenamesduet
 *  uses). */
function timerLabel(t: TimerMode): string {
  if (t.kind === 'countup') return 'count-up timer'
  if (t.kind === 'countdown') {
    const m = Math.floor(t.seconds / 60)
    const s = t.seconds % 60
    return `${m}:${String(s).padStart(2, '0')} countdown`
  }
  return 'no timer'
}

/**
 * Per-status terminal copy, mode- and (compete) self-aware. `outcome` + `verdict`
 * drive the GameOverModal; `message` + `tone` drive the short, bold, color-coded
 * line in the info-column action row (won = green, lost = red, manual end =
 * neutral). Same shape as the other converged games' buildOver.
 */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfWon,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfWon: boolean
}): {
  outcome: 'won' | 'lost'
  verdict: string
  message: string
  tone: 'won' | 'lost' | 'neutral'
} {
  // Manual end (waffle.end_game) → 'ended' in either mode. Neutral result:
  // nobody won or lost. GameOverModal's 'won' outcome is reused purely for its
  // non-red styling; tone:'neutral' keeps the info-column line plain. Handled
  // first so an 'ended' game never falls through to a loss verdict.
  if (playState === 'ended') {
    return {
      outcome: 'won',
      verdict: mode === 'coop' ? 'Game ended.' : 'Game ended — no winner.',
      message: 'Game ended',
      tone: 'neutral',
    }
  }
  if (mode === 'coop') {
    if (playState === 'won') {
      return { outcome: 'won', verdict: 'Solved it! 🧇', message: 'Solved!', tone: 'won' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired ? 'Out of time.' : 'Out of swaps.',
      message: timerExpired ? 'Out of time' : 'Out of swaps',
      tone: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { outcome: 'won', verdict: 'You won — fewest swaps!', message: 'You won!', tone: 'won' }
      : { outcome: 'lost', verdict: 'Beaten on swaps.', message: 'Opponent won', tone: 'lost' }
  }
  // lost_compete — nobody solved, or time ran out
  return {
    outcome: 'lost',
    verdict: timerExpired ? 'Out of time — no winner.' : 'Nobody solved it.',
    message: timerExpired ? 'Out of time' : 'No winner',
    tone: 'lost',
  }
}
