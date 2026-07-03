import { useCallback } from 'react'
import type { GenericFeedbackMsg, GamePageCtx, Member } from '../../common/lib/games'
import { cls } from '../../common/lib/cls'
import { TerminalModal } from '../../common/components/TerminalModal'
import { useLocalFeedback } from '../../common/hooks/useLocalFeedback'
import { useHistoryViewer } from '../../common/hooks/useHistoryViewer'
import { colorVarFor } from '../../common/lib/memberColor'
import { db } from '../db'
import type { ScrabbleSetup } from '../lib/setup'
import { useGame } from '../hooks/useGame'
import { useSharedMove, type SharedMovePayload } from '../hooks/useSharedMove'
import { BoardCol, type LocalFeedbackMsg, type ViewTarget } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '../../common/components/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'

/**
 * scrabble's play surface (coop + compete). PlayArea is the **coordinator**: it holds
 * the game data (`useGame`), the board-viewer coordination (`useHistoryViewer`, whose
 * `ViewTarget` here carries BOTH a past turn AND a coop teammate's shared move), the
 * coop "show a move" Broadcast transport (`useSharedMove`), the below-board feedback
 * channel (`useLocalFeedback` — lifted here because InfoCol's End/Concede write to it
 * too), and the terminal copy; it wires two columns:
 *
 *   - **`<BoardCol>`** — the 15×15 board + the rack + the whole turn machine
 *     (staging via drag/keyboard, the blank picker, the optimistic hold, and the
 *     play_word/exchange/pass RPCs, which are inseparable from that state). Takes the
 *     game data + gameId + the feedback channel + the history-view inputs down.
 *   - **`<InfoCol>`** — the turn/score readout, OpponentStrip, action row, help,
 *     setup disclosure, and the Moves log. Named callbacks up.
 *
 * "Play word" evaluates the staged tiles with `lib/play.ts` (in BoardCol) and sends
 * words + score to `scrabble.play_word`, which trusts them and checks only the
 * dictionary. See docs/playarea-decomposition-plan.md.
 */
export function PlayArea({
  session,
  gameId,
  players: members,
  playState,
  isTerminal,
  status,
  setup,
  goToClub,
}: GamePageCtx) {
  const { game, players: playerStates, plays, loading } = useGame(gameId)

  // The player's own-move result — a sticky pill in the commit slot (the local
  // feedback area; docs/design-decisions.md → Feedback). Lifted to the coordinator
  // because BOTH columns write it: BoardCol's turn machine (played/rejected/…) AND
  // InfoCol's End/Concede failures. The thin builder keeps the terse `{ tone, text }`
  // call sites (own-move results are outline + sticky — the next move dismisses them).
  const { localFeedback, showLocalFeedback: showMsg, clearLocalFeedback } = useLocalFeedback({ locked: isTerminal })
  const showLocalFeedback = useCallback(
    (m: LocalFeedbackMsg) => showMsg({ ...m, variant: 'outline', dismiss: { kind: 'sticky' } }),
    [showMsg],
  )

  // Board-viewer coordination (shared hook): which read-only overlay is open — a
  // past turn OR a teammate's shared move (the `ViewTarget` union). Cross-column:
  // BoardCol renders it, InfoCol's Moves log selects a turn, a broadcast opens a
  // shared move. A new committed move (the version effect in BoardCol) exits either.
  const { viewingId: viewTarget, viewingIdRef: viewTargetRef, viewing, select, exitViewing } =
    useHistoryViewer<ViewTarget>()
  // Only a TURN is highlighted in the Moves log (`#N`) — a shared move has no row.
  const viewingSeq = viewTarget?.kind === 'turn' ? viewTarget.seq : null

  // Show-a-move transport (coop only): a teammate's broadcast opens a read-only
  // preview of their staged tiles. Ignore a stale one (their board version no
  // longer matches ours — a real move landed in between), so we never overlay a
  // move that no longer fits. `select` opens it on the same viewer as history.
  const { shareMove } = useSharedMove({
    gameId,
    mode: game?.mode,
    onReceive: useCallback(
      (p: SharedMovePayload) => {
        if (!game || p.baseVersion !== game.version) return
        select({ kind: 'shared', placements: p.placements, sharerId: p.sharerId, words: p.words, score: p.score })
      },
      [game, select],
    ),
  })

  // ─── Derived (null-safe until the loading guard) ──────────────
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isCompete = game?.mode === 'compete'
  // Concede lives on the common roster (ctx.players → `members`).
  const myConceded = members.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(members.filter((m) => m.conceded).map((m) => m.user_id))
  const myTurn = !isCompete || game?.currentUserId === session.user.id
  const nameOf = useCallback(
    (userId: string | null) => members.find((m: Member) => m.user_id === userId)?.username ?? 'someone',
    [members],
  )
  // Identity-disc color for the share banner's ● (the shared member-color scheme).
  const memberColorOf = useCallback(
    (userId: string) => colorVarFor(members.find((m: Member) => m.user_id === userId)?.color),
    [members],
  )
  // Show-a-move is a coop, ≥2-player affordance — there's a teammate to show.
  const canShare = game?.mode === 'coop' && members.length >= 2

  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm("End the game now? You can't undo this.")) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback({ tone: 'error', text: `End game failed: ${error.message}` })
  }, [gameId, isTerminal, showLocalFeedback])

  // Concede (compete) — drop out of the race. Turn-based, so the server hands off the
  // turn / ends the game (scrabble.concede); the conceder forfeits any win. Distinct
  // from End, which is coop's neutral mutual stop.
  const handleConcede = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm('Concede the game? You drop out and the others keep playing.')) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) showLocalFeedback({ tone: 'error', text: `Concede failed: ${error.message}` })
  }, [gameId, isTerminal, showLocalFeedback])

  if (loading) return <p className={styles.loading}>Loading game…</p>
  if (!game) return <p className={styles.loading}>Game not found.</p>

  const scrabbleSetup = setup as unknown as ScrabbleSetup
  const over = isTerminal ? buildOver({ game, playState, status, selfId: session.user.id, nameOf }) : null
  // The player whose turn it is (compete) — for the "Turn: ● name" state line.
  const currentMember = members.find((m: Member) => m.user_id === game.currentUserId)

  // The commit-slot pill: the terminal verdict (permanent fill) takes precedence,
  // else the sticky own-move result (transient outline), else nothing (the commit
  // buttons show). Passed down to BoardCol, which renders it in the Controls.
  const localPill: GenericFeedbackMsg | null = over
    ? {
        tone: over.tone === 'won' ? 'success' : over.tone === 'lost' ? 'error' : 'neutral',
        text: over.message,
        variant: 'fill',
        dismiss: { kind: 'sticky' },
      }
    : localFeedback

  return (
    <div className={cls(shared.layout, styles.layout)}>
      <BoardCol
        game={game}
        gameId={gameId}
        self={self}
        myTurn={myTurn}
        isTerminal={isTerminal}
        myConceded={myConceded}
        showLocalFeedback={showLocalFeedback}
        clearLocalFeedback={clearLocalFeedback}
        localPill={localPill}
        plays={plays}
        viewTarget={viewTarget}
        viewing={viewing}
        viewTargetRef={viewTargetRef}
        onExitViewing={exitViewing}
        nameOf={nameOf}
        memberColorOf={memberColorOf}
        canShare={canShare}
        shareMove={shareMove}
        selfId={session.user.id}
      />

      <InfoCol
        isCompete={isCompete}
        myTurn={myTurn}
        over={over}
        myConceded={myConceded}
        isTerminal={isTerminal}
        currentMember={currentMember}
        teamScore={game.teamScore}
        bagCount={game.bagCount}
        members={members}
        selfId={session.user.id}
        playerStates={playerStates}
        concededIds={concededIds}
        onEndGame={() => void handleEndGame()}
        onConcede={() => void handleConcede()}
        onBackToClub={goToClub}
        setup={scrabbleSetup}
        plays={plays}
        viewingSeq={viewingSeq}
        onSelectTurn={(seq: number) => select({ kind: 'turn', seq })}
      />

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
    </div>
  )
}

/**
 * Terminal copy, mode- and self-aware. Returns `{ outcome, verdict, message,
 * tone }`: `outcome` + `verdict` drive the GameOverModal; `message` (terse) +
 * `tone` drive BOTH the info-column outcome line AND the permanent below-board
 * pill (so the narrow commit slot stays one line).
 */
function buildOver({
  game,
  playState,
  status,
  selfId,
  nameOf,
}: {
  game: { mode: 'coop' | 'compete'; teamScore: number | null }
  playState: string
  status: Record<string, unknown> | null
  selfId: string
  nameOf: (id: string | null) => string
}): { outcome: 'won' | 'lost'; verdict: string; message: string; tone: 'won' | 'lost' | 'neutral' } {
  const outcome = (status?.outcome as string | undefined) ?? ''
  if (game.mode === 'coop') {
    const score = game.teamScore ?? 0
    if (outcome === 'manual') return { outcome: 'won', verdict: `Game ended — ${score} points.`, message: `${score} pts`, tone: 'neutral' }
    if (outcome === 'timeout') return { outcome: 'won', verdict: `Time's up — ${score} points.`, message: `${score} pts`, tone: 'neutral' }
    return { outcome: 'won', verdict: `Board cleared — ${score} points! 🎉`, message: `${score} pts`, tone: 'won' }
  }
  if (playState === 'ended') return { outcome: 'won', verdict: 'Game ended — no winner.', message: 'Ended', tone: 'neutral' }
  const winner = status?.winner as string | null | undefined
  if (winner === selfId) return { outcome: 'won', verdict: 'You won the game! 🎉', message: 'You won!', tone: 'won' }
  if (winner) return { outcome: 'lost', verdict: `${nameOf(winner)} won.`, message: `${nameOf(winner)} won`, tone: 'lost' }
  return { outcome: 'won', verdict: "It's a tie — co-winners!", message: 'Tie', tone: 'neutral' }
}
