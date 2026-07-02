import { useCallback, useEffect, useRef } from 'react'
import type { GamePageCtx, GenericFeedbackMsg, GenericFeedbackTone, TimerMode } from '../../common/lib/games'
import { cls } from '../../common/lib/cls'
import { DIFFICULTY_LABELS } from '../../common/lib/difficulty'
import { colorVarFor } from '../../common/lib/memberColor'
import { GameOverModal } from '../../common/components/GameOverModal'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { OpponentStrip } from '../../common/components/OpponentStrip'
import { GenericFeedbackPill } from '../../common/components/GenericFeedbackPill'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { useLocalFeedback } from '../../common/hooks/useLocalFeedback'
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

/** Local feedback pills are never closeable here, so the × is never rendered and
 *  this is never called — but `<GenericFeedbackPill>` requires the prop. */
const noop = () => {}

/** Build waffle's own-action local pill: outline + TIMED (auto-clears after a
 *  beat — waffle's only own-move feedback is a rejected swap / failed End, a
 *  transient nudge). A pure msg-builder over the shared `useLocalFeedback`. */
const ownAction = (tone: GenericFeedbackTone, text: string): GenericFeedbackMsg => ({
  tone,
  text,
  variant: 'outline',
  dismiss: { kind: 'timed' },
})

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
  globalFeedback,
  goToClub,
}: GamePageCtx) {
  const { game, players: playerStates, swaps, loading } = useGame(gameId)
  const { showModal, closeModal } = useTerminalModal(isTerminal)

  // Own-action feedback (LOCAL): a rejected swap or a failed End flashes in the
  // below-board slot — never the header pill (that's the peer/group channel).
  const { localFeedback, showLocalFeedback } = useLocalFeedback()

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
          // A solve is a GOOD outcome → success (green) — the same green a found
          // word reads as in both modes (docs/design-decisions.md → Tone follows
          // the event). Adverse to me in compete, but the tone names the event,
          // not my stake.
          globalFeedback.show({
            tone: 'success',
            variant: 'outline',
            dot,
            text: `${name} solved it`,
            dismiss: { kind: 'timed', ms: 3000 },
          })
        } else if (out && !prev.out) {
          // Out of swaps is a milestone — important, neither clearly good nor bad
          // (they're done; I gain nothing yet) → warning (amber).
          globalFeedback.show({
            tone: 'warning',
            variant: 'outline',
            dot,
            text: `${name} is out of swaps`,
            dismiss: { kind: 'timed', ms: 3000 },
          })
        }
      }
    },
    [playerStates, game, members, session.user.id, globalFeedback],
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
      if (error) showLocalFeedback(ownAction('error', error.message))
    },
    [gameId, showLocalFeedback],
  )

  // Manual end — the friends agreeing they're done (neutral terminal, nobody
  // wins/loses). An action-row button now (like psychicnum / connections /
  // codenamesduet), off the GamePage menu. Confirmed; it's irreversible.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback(ownAction('error', `End game failed: ${error.message}`))
  }, [gameId, isTerminal, showLocalFeedback])

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

  // LOCALLY TERMINAL: the game is still going, but *I* can't act any more —
  // compete-only, because in coop a solve/exhaustion ends the whole game. I've
  // either solved my board (waiting for opponents) or run out of swaps. We show
  // this with the TERMINAL LOOK (a bold status line + my Concede), not a quietly
  // swapped help line — being unable to act is basically terminal for me
  // (docs/design-decisions.md → InfoCol action buttons / Locally terminal).
  const selfDone = isPlayer && (self?.solved === true || remaining === 0)

  const difficultyLabel = DIFFICULTY_LABELS[waffleSetup.difficulty - 1] ?? '—'

  // The End / Concede button — error-toned (red), shared by the "playing" and the
  // "locally terminal" action rows (you can bow out either way). compete CONCEDES
  // ("I give up, you win"); coop ENDS (a neutral mutual "we're done"). Two
  // components for two semantically distinct actions (docs/design-decisions.md →
  // End vs Concede).
  const endButton = isCompete ? (
    <ConcedeGameButton
      onClick={() => void handleEndGame()}
      className={shared.helperButton}
    />
  ) : (
    <EndGameButton
      onClick={() => void handleEndGame()}
      className={shared.helperButton}
    />
  )

  return (
    <div className={cls(shared.layout, styles.layout)}>
      <div className={shared.boardCol}>
        <WaffleGrid
          board={board}
          colors={colors}
          disabled={isTerminal || !isPlayer || selfDone}
          onSwap={handleSwap}
        />
        {/* The below-board slot — waffle's LOCAL feedback area (a centered
            <GenericFeedbackPill>, the same pill the header uses; docs/design-decisions.md
            → Local feedback area). waffle's input is the board itself, so this slot
            is feedback-only. A reserved height (`.belowBoard` min-height) keeps the
            top-anchored board from shifting as the slot's content changes. Four
            states, by precedence:
              - terminal → a PERMANENT (fill, outcome-colored) pill carrying the
                verdict — terminal always lands as permanent local feedback, in
                BOTH the action row AND here (docs/design-decisions.md → Terminal);
              - locally terminal (compete: solved or out of swaps, others race on)
                → a sticky "waiting" pill;
              - an own-action error (rejected swap / failed End) → a transient
                (outline) pill for a beat (the hook's timer clears it);
              - else empty.
            The multi-line answer reveal is NOT here — it would overflow the
            viewport (the page must never scroll); it lives in the info column's
            `.terminalExtra` instead. */}
        <div className={styles.belowBoard}>
          {/* No below-board move controls: waffle's input is swapping tiles on
              the board itself, so `.moveArea` is empty. */}
          <div className={styles.moveArea} />
          <div className={shared.localFeedback}>
            {over ? (
              <GenericFeedbackPill
                msg={{
                  tone:
                    over.tone === 'won'
                      ? 'success'
                      : over.tone === 'lost'
                        ? 'error'
                        : 'neutral',
                  text: over.verdict,
                  variant: 'fill', // permanent → lightened-tone fill
                  dismiss: { kind: 'sticky' }, // never auto- or user-dismissed
                }}
                onClose={noop}
              />
            ) : selfDone ? (
              <GenericFeedbackPill
                msg={{
                  tone: 'neutral',
                  text: self?.solved
                    ? 'Solved — waiting on the rest.'
                    : 'Out of swaps — waiting on the rest.',
                  variant: 'outline',
                  dismiss: { kind: 'sticky' },
                }}
                onClose={noop}
              />
            ) : localFeedback ? (
              <GenericFeedbackPill msg={localFeedback} onClose={noop} />
            ) : null}
          </div>
        </div>
      </div>

      <div className={shared.infoCol}>
        {/* The non-log info column — the shared named readouts (.infoSetup /
            .infoState / .infoHelp / .infoActions) so they read the same across
            games. */}
        <div className={shared.actionSlot}>
          {/* InfoCol order is FIXED (docs/design-decisions.md → InfoCol order):
              state → opponent strip → action row → help → setup disclosure → log.
              Don't eyeball it — a v2 layout's order isn't a reliable guide (this
              was setup-first before the v3 conversion). */}

          {/* State — shown in both play and terminal. */}
          <p className={shared.infoState}>
            Swaps{' '}
            <strong>
              {swapsUsed}/{game.max_swaps}
            </strong>{' '}
            ({remaining} left) · Par <strong>{game.par_swaps}</strong>
          </p>

          {/* Opponent strip (compete) — each player's swaps used + a ✓/✗ done
              mark. The `metricLabel` prefix names the bare number so it isn't
              ambiguous (docs/design-decisions.md → Opponent strip). */}
          {isCompete && (
            <OpponentStrip
              players={members}
              selfId={session.user.id}
              metricLabel="Swaps"
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

          {/* Action row — four states. TERMINAL: the bold outcome line + a compact
              back-to-club button. LOCALLY TERMINAL (compete: solved or out of
              swaps, the rest race on): the terminal LOOK — a bold status + Concede
              — so being unable to act reads loudly, not as a swapped help line.
              PLAYING (a player who can act): just End/Concede. WATCHING (not in the
              game): a bold note, no button. */}
          {over ? (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared[`outcome_${over.tone}`])}>
                {over.message}
              </span>
              <BackToClubButton onClick={goToClub} compact />
            </div>
          ) : selfDone ? (
            <div className={cls(shared.infoActions, shared.terminalActions)}>
              <span className={cls(shared.outcome, shared.outcome_neutral)}>
                {self?.solved ? 'Solved — waiting' : 'Out of swaps'}
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

          {/* Help — shown ONLY while you can actually act on it (a player who's
              not over and not locally terminal). It never silently swaps text: the
              locally-terminal / watching states are carried loudly by the action
              row above (docs/design-decisions.md → InfoCol help). */}
          {isPlayer && !over && !selfDone && (
            <p className={shared.infoHelp}>Tap two tiles to swap them.</p>
          )}

          {/* Setup — LAST before the log, behind a disclosure (closed by default
              so it doesn't claim space). */}
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
