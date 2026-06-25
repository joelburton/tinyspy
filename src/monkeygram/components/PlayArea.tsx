import { useCallback, useEffect, useRef } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { GameOverModal } from '../../common/components/GameOverModal'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { useEndGameMenu } from '../../common/hooks/useEndGameMenu'
import { db } from '../db'
import { useGame, useProgress } from '../hooks/useGame'
import { PlayerBoard } from './PlayerBoard'
import { PeersStrip } from './PeersStrip'
import '../theme.css' // monkeygram tokens + the global drag-cursor rule

/**
 * MonkeyGram play surface.
 *
 * Load gate: `useGame` fetches the caller's own player board (`board` seeded
 * once, `tiles` kept live), `useProgress` subscribes to every player's public
 * count. We mount `<PlayerBoard>` — the fixed 25×25 arena + derived hand — and
 * hand it the `<PeersStrip>` (opponents' tiles-left) to slot above the hand.
 *
 * Win flow: the **Peel** button (enabled only when the hand is empty) calls
 * `peel`. If the bunch can't refill the table the peeler goes out and the game
 * ends for everyone; the `is_terminal` flip arrives over `useCommonGame`'s
 * realtime and drives `useTerminalModal` → the GameOverModal. Winner and losers
 * all show the same modal from the same signal — never popped imperatively on
 * the click. Both "did *I* win?" and the winner's name come from
 * `status.winner_username`, which rides the SAME `common.games` update as the
 * flip (no cross-channel flash of the wrong verdict).
 *
 * Peel announcement: a peel grows EVERY player's `tiles` at once. Each FE picks
 * up its own growth via the live `tiles` subscription, so watching `tiles`
 * length increase is the universal "a peel just happened — here's your new
 * tile" signal (the peeler and every drawer see the same pill).
 */
export function PlayArea(ctx: GamePageCtx) {
  const { initialBoard, tiles, loading } = useGame(ctx.gameId)
  const progress = useProgress(ctx.gameId)
  const { showModal, closeModal } = useTerminalModal(ctx.isTerminal)

  const { gameId, feedback, menu, isTerminal } = ctx
  const peel = useCallback(async () => {
    const { error } = await db.rpc('peel', { target_game: gameId })
    // On success there's nothing to do — a continuing peel grows `tiles` (the
    // announcement effect below reacts) and a winning peel flips is_terminal
    // (the modal reacts). Only a failure is worth surfacing.
    if (error) {
      feedback.show({ tone: 'error', text: error.message, dismiss: { kind: 'closeable' } })
    }
  }, [gameId, feedback])

  // A dump also grows MY `tiles` (−1 dumped + dump_count drawn). We flag it so
  // the announcement below reads the next growth as a dump rather than a peel.
  // This is best-effort, NOT race-free: a peel deals a tile to *every* player,
  // so if a peer peels in the window between this RPC firing and its `tiles`
  // echo landing, the peel's growth trips the flag first and the dump/peel
  // toasts get swapped. Accepted as cosmetic — a wrong 2.5s toast, never a
  // state effect (the tile multiset is always correct) — under the friends-only
  // trust model. A truly race-free version would need dump/peel (both `returns
  // void` today) to return their draw counts so the FE announces from the RPC
  // response instead of inferring from realtime `tiles` growth.
  const dumpPending = useRef(false)
  const dump = useCallback(
    async (tile: string) => {
      dumpPending.current = true
      const { error } = await db.rpc('dump', { target_game: gameId, tile })
      if (error) {
        dumpPending.current = false // no tiles change is coming
        feedback.show({ tone: 'error', text: error.message, dismiss: { kind: 'closeable' } })
      }
    },
    [gameId, feedback],
  )

  // Announce a draw: my own `tiles` growing means a peel dealt me a tile (or my
  // dump just resolved). Seed the baseline after load so the initial deal
  // doesn't read as a draw.
  const seenTilesLen = useRef<number | null>(null)
  useEffect(() => {
    if (loading) return
    if (seenTilesLen.current === null) {
      seenTilesLen.current = tiles.length
      return
    }
    if (tiles.length > seenTilesLen.current) {
      const grew = tiles.length - seenTilesLen.current
      if (dumpPending.current) {
        dumpPending.current = false
        // dump drew `grew + 1` (it also removed the one dumped tile).
        feedback.show({
          tone: 'neutral',
          text: `♻️ Dumped 1, drew ${grew + 1}.`,
          dismiss: { kind: 'timed', ms: 2500 },
        })
      } else {
        feedback.show({
          tone: 'neutral',
          text: `🍌 Peel! You drew ${grew} tile${grew === 1 ? '' : 's'}.`,
          dismiss: { kind: 'timed', ms: 2500 },
        })
      }
    }
    seenTilesLen.current = tiles.length
  }, [tiles, loading, feedback])

  // ─── End-game action (per-game menu item) ──────────────
  // MonkeyGram's only intrinsic terminal is a peel-win; if the friends
  // want to quit before anyone goes out, this is the explicit stop. It
  // ends the game for EVERYONE with nobody as the winner (status.outcome
  // 'manual') — agreeing to stop is a valid outcome, not a loss. Mirrors
  // freebee's PlayArea: confirm, fire the RPC, surface only failures.
  useEndGameMenu({
    isTerminal,
    menu,
    feedback,
    endGame: () => db.rpc('end_game', { target_game: gameId }),
  })

  if (loading || initialBoard === null) return <p className="muted">Dealing tiles…</p>

  // Terminal verdict. Three terminal shapes reach here:
  //   - a peel-win → status.winner_username is set; "did I win?" comes
  //     from comparing it to my username (winner green, others red)
  //   - a manual end (end_game) → status.outcome 'manual', NO winner.
  //   - a countdown timeout (submit_timeout) → status.outcome 'timeout',
  //     NO winner; everyone lost (red "Time's up").
  // The no-winner cases MUST be checked first: with no winner_username,
  // the win path below would fall through to `winnerName = 'someone'`
  // and show everyone the red "someone went out — Bananas!" verdict —
  // wrong for those. Manual ends show a neutral green "Game ended."
  // (GameOverModal renders outcome:'won' as green).
  const selfUsername = ctx.players.find((p) => p.user_id === ctx.session.user.id)?.username
  const winnerName = (ctx.status?.winner_username as string | undefined) ?? 'someone'
  const selfWon = !!selfUsername && winnerName === selfUsername
  const over = !ctx.isTerminal
    ? null
    : ctx.status?.outcome === 'manual'
      ? { outcome: 'won' as const, verdict: '🍌 Game ended.' }
      : ctx.status?.outcome === 'timeout'
        ? { outcome: 'lost' as const, verdict: "⏰ Time's up — nobody went out." }
        : {
            outcome: (selfWon ? 'won' : 'lost') as 'won' | 'lost',
            verdict: selfWon
              ? '🍌 Bananas! You went out first.'
              : `${winnerName} went out — Bananas!`,
          }

  const bunchCount = ctx.status?.pool_remaining as number | undefined

  return (
    <>
      <PlayerBoard
        gameId={gameId}
        initialBoard={initialBoard}
        tiles={tiles}
        isTerminal={ctx.isTerminal}
        onPeel={peel}
        onDump={dump}
        bunchCount={bunchCount}
        peers={
          <PeersStrip players={ctx.players} progress={progress} selfUserId={ctx.session.user.id} />
        }
      />
      {showModal && over && (
        <GameOverModal
          outcome={over.outcome}
          verdict={over.verdict}
          onClose={closeModal}
          onBackToClub={ctx.goToClub}
        />
      )}
    </>
  )
}
