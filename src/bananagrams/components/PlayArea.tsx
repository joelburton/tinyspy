import { useCallback, useEffect, useRef } from 'react'
import type { GamePageCtx, GenericFeedbackMsg } from '../../common/lib/games'
import { timerLabel } from '../../common/lib/timerLabel'
import { TerminalModal } from '../../common/components/TerminalModal'
import { GenericFeedbackPill } from '../../common/components/GenericFeedbackPill'
import { BackToClubButton } from '../../common/components/BackToClubButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { useLocalFeedback } from '../../common/hooks/useLocalFeedback'
import { useDismissLocalFeedbackOnKey } from '../../common/hooks/useDismissLocalFeedbackOnKey'
import { DIFFICULTY_LABELS } from '../../common/lib/difficulty'
import { IconExchange } from '../../common/components/icons'
import type { TerminalCopy } from '../../common/lib/terminalCopy'
import { cls } from '../../common/lib/cls'
import { db } from '../db'
import { useGame, useProgress } from '../hooks/useGame'
import type { BananagramsSetup } from '../lib/setup'
import { PlayerBoard } from './PlayerBoard'
import { PeersStrip } from './PeersStrip'
import shared from '../../common/components/PlayArea.module.css'
import '../theme.css' // bananagrams tokens + the global drag-cursor rule

/**
 * bananagrams play surface (v3).
 *
 * bananagrams is the roster's one intentional exception to "everything needed
 * to make a move lives in the board column": the board is a zoom/scroll arena
 * that fills the left column, and the HAND + peel + dump live in the RIGHT
 * (info) column instead. It's a desktop-only game and the hand-on-the-right feel
 * is deliberate (see docs/games/bananagrams.md). So `<PlayerBoard>` owns the
 * whole two-column shell (the shared `.layout` / `.infoCol` / `.actionSlot`
 * scaffold, with a fill — not hug — board column), and THIS component supplies
 * the v3 info-column chrome (`infoTop`) + the below-board feedback pill.
 *
 * Feedback is LOCAL (a `<GenericFeedbackPill>` in the below-board slot), not the global
 * header channel: a peel/dump draw, an RPC error, and the terminal verdict are
 * all about the player's own game, so they belong in the local feedback area.
 *
 * Win flow: `peel` (enabled only when the hand is empty) either deals everyone a
 * tile or — when the bunch can't refill the ACTIVE table — goes out and wins.
 * The `is_terminal` flip arrives over `useCommonGame`'s realtime → `useTerminalModal`.
 *
 * Concede: bananagrams is compete, so conceding is a real loss — but it only
 * drops YOU out (`bananagrams.concede`); the others keep racing. A conceded
 * player sees the terminal LOOK locally (board frozen, "you're out" pill) while
 * the game stays live; the last player to concede ends it as a collective loss.
 */

/** Local feedback pills here are never closeable, so the × never renders and
 *  this is never called — but `<GenericFeedbackPill>` requires the prop. */
const noop = () => {}

export function PlayArea(ctx: GamePageCtx) {
  const { initialBoard, tiles, loading } = useGame(ctx.gameId)
  const progress = useProgress(ctx.gameId)

  const { gameId, isTerminal } = ctx

  // ─── Local feedback (own-move) ─────────────────────────────────────────
  // The below-board pill: a peel/dump draw announcement (timed — the hook
  // auto-clears it), or an RPC error (sticky). The terminal verdict and the
  // locally-terminal "you're out" message are layered on top of this in
  // `localFeedbackMsg` below.
  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback({ locked: isTerminal })
  // Any key is the player's next move → dismiss the own-move pill. (bananagrams's
  // own board-key handler lives in PlayerBoard; this is the shared clear-on-key,
  // guarded against chat by useGlobalKeyHandler.) No-op at terminal (locked).
  useDismissLocalFeedbackOnKey(clearLocalFeedback)

  const peel = useCallback(async (): Promise<{ illegalCells: number[] } | null> => {
    const { data, error } = await db.rpc('peel', { target_game: gameId })
    if (error) {
      showLocalFeedback({ tone: 'error', text: error.message, variant: 'outline', dismiss: { kind: 'sticky' } })
      return null
    }
    // A blocked winning peel: the board isn't a legal grid (disconnected, or —
    // with check_words on — a non-word), so the game stays in progress and the
    // RPC hands back the offending cells — PlayerBoard paints them red. A
    // 'won'/'dealt' result needs nothing here: a continuing peel grows `tiles`
    // (the announcement effect reacts) and a winning peel flips is_terminal (the
    // modal reacts).
    const res = data as { result: string; invalid_cells: number[] } | null
    if (res?.result === 'illegal') {
      return { illegalCells: res.invalid_cells ?? [] }
    }
    return null
  }, [gameId, showLocalFeedback])

  // A dump also grows MY `tiles` (−1 dumped + dump_count drawn). We flag it so
  // the announcement below reads the next growth as a dump rather than a peel.
  // Best-effort, NOT race-free (a peer's peel in the echo window could trip the
  // flag first) — accepted as cosmetic under the friends-only trust model; the
  // tile multiset is always correct, only a 2.5s toast can be mislabelled.
  const dumpPending = useRef(false)
  const dump = useCallback(
    async (tile: string) => {
      dumpPending.current = true
      const { error } = await db.rpc('dump', { target_game: gameId, tile })
      if (error) {
        dumpPending.current = false // no tiles change is coming
        showLocalFeedback({ tone: 'error', text: error.message, variant: 'outline', dismiss: { kind: 'sticky' } })
      }
    },
    [gameId, showLocalFeedback],
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
        showLocalFeedback({
          tone: 'neutral',
          text: (
            <>
              <IconExchange size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> Dumped 1,
              drew {grew + 1}.
            </>
          ),
          variant: 'outline',
          dismiss: { kind: 'timed', ms: 2500 },
        })
      } else {
        showLocalFeedback({
          tone: 'neutral',
          text: `🍌 Peel! You drew ${grew} tile${grew === 1 ? '' : 's'}.`,
          variant: 'outline',
          dismiss: { kind: 'timed', ms: 2500 },
        })
      }
    }
    seenTilesLen.current = tiles.length
  }, [tiles, loading, showLocalFeedback])

  // ─── Concede — drop out of the race (a real loss, others keep going) ────
  // Confirmed because it's irreversible; an RPC failure surfaces in the local
  // pill. A conceded player is out — the game continues for everyone else.
  const handleConcede = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm("Concede? You'll drop out and take the loss — the others keep racing. You can't undo this.")) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) {
      showLocalFeedback({ tone: 'error', text: error.message, variant: 'outline', dismiss: { kind: 'sticky' } })
    }
  }, [gameId, isTerminal, showLocalFeedback])

  if (loading || initialBoard === null) return <p className="muted">Dealing tiles…</p>

  const selfId = ctx.session.user.id
  // Locally terminal: I've conceded but the game is still live for the others.
  // Shown as the terminal LOOK (frozen board + "you're out"), not a silent swap.
  // Concede lives on the shared roster (ctx.players → common.game_players).
  const isConceded = !!ctx.players.find((p) => p.user_id === selfId)?.conceded && !isTerminal

  // ─── Terminal verdict ──────────────────────────────────────────────────
  // Three terminal shapes: a peel-win (status.winner_username set), a countdown
  // timeout (outcome 'timeout', everyone lost), and an all-conceded collective
  // loss (outcome 'conceded', everyone lost). The no-winner cases are checked
  // FIRST — with no winner_username the peel-win branch would fall through to
  // "someone went out — Bananas!" and show everyone a loss for the wrong reason.
  const selfUsername = ctx.players.find((p) => p.user_id === selfId)?.username
  const winnerName = (ctx.status?.winner_username as string | undefined) ?? 'someone'
  const selfWon = !!selfUsername && winnerName === selfUsername
  const over: TerminalCopy | null = !isTerminal
    ? null
    : ctx.status?.outcome === 'timeout'
      ? { outcome: 'lost', verdict: "⏰ Time's up — nobody went out.", message: 'Out of time', tone: 'lost' }
      : ctx.status?.outcome === 'conceded'
        ? { outcome: 'lost', verdict: '🏳️ Everyone conceded — no winner.', message: 'All conceded', tone: 'lost' }
        : selfWon
          ? { outcome: 'won', verdict: '🍌 Bananas! You went out first.', message: 'You won!', tone: 'won' }
          : { outcome: 'lost', verdict: `${winnerName} went out — Bananas!`, message: `${winnerName} won`, tone: 'lost' }

  const bunchCount = ctx.status?.pool_remaining as number | undefined
  const boxCount = ctx.status?.box_remaining as number | undefined
  const setup = ctx.setup as unknown as BananagramsSetup

  // ─── The below-board pill (terminal / locally-terminal / own-move) ──────
  // Exactly one, by priority: the permanent (fill) terminal verdict; else the
  // sticky "you conceded" when locally terminal; else the own-move draw/error
  // pill (or nothing).
  const localFeedbackMsg: GenericFeedbackMsg | null = over
    ? {
        tone: over.tone === 'won' ? 'success' : over.tone === 'lost' ? 'error' : 'neutral',
        text: over.verdict,
        variant: 'fill',
        dismiss: { kind: 'sticky' },
      }
    : isConceded
      ? {
          tone: 'neutral',
          text: "You conceded — you're out of the race.",
          variant: 'outline',
          dismiss: { kind: 'sticky' },
        }
      : localFeedback

  // ─── Info-column chrome ─────────────────────────────────────────────────
  // bananagrams' info column is a DOCUMENTED EXCEPTION to the canonical v3
  // order: state → opponents → help → setup → the HAND card (with the dump zone
  // + rotate) → the action row (Concede / Dump) at the very bottom. The hand +
  // peel live here, not in the board column (the game's other documented
  // exception), so the actions sit below them rather than in the shared
  // `.actionSlot`. `infoTop` is the readout stack; `infoActions` is the bottom
  // row (PlayerBoard renders it after the hand card).
  const infoTop = (
    <>
      {/* State — the shared bunch (the race resource everyone watches) + how
          many tiles the player holds; the box count shows when the game isn't
          on a full bag (a reduced bag or dump-to-box sets tiles aside). */}
      <p className={shared.infoState}>
        Holding <strong>{tiles.length}</strong> tile{tiles.length === 1 ? '' : 's'} ·{' '}
        <strong>{bunchCount ?? '—'}</strong> in the bunch
        {boxCount !== undefined && boxCount > 0 && (
          <>
            {' '}
            · <strong>{boxCount}</strong> in the box
          </>
        )}
      </p>

      {/* Opponents — bananagrams keeps its own vertical, closest-to-done strip
          (a race affordance the horizontal OpponentStrip can't express), which
          now also marks conceded peers as "out". Renders nothing in solo. */}
      <PeersStrip players={ctx.players} progress={progress} selfUserId={selfId} />

      {/* Help — only while the player can still act. */}
      {!over && !isConceded && (
        <p className={shared.infoHelp}>
          Drag tiles or click a cell and type. Peel when your hand is empty.
        </p>
      )}

      {/* Setup — behind a disclosure (closed by default). */}
      <details className={shared.infoSetup}>
        <summary>Setup options</summary>
        <ul>
          <li>{setup.hand_size}-tile starter hand</li>
          <li>{setup.bag_size}-tile bag</li>
          {setup.check_words ? (
            <li>
              Real words required (2-letter: {DIFFICULTY_LABELS[setup.dict_2 - 1] ?? '—'}, longer:{' '}
              {DIFFICULTY_LABELS[setup.dict_3plus - 1] ?? '—'})
            </li>
          ) : (
            <li>Words not checked (trust the friends)</li>
          )}
          <li>Dumped tiles {setup.dump_to_box ? 'set aside (box)' : 'return to the bunch'}</li>
          <li>{timerLabel(setup.timer)}</li>
        </ul>
      </details>
    </>
  )

  // The bottom action row's CONTENT (PlayerBoard wraps it in the shared
  // `.infoActions` row, adding the Peel button beside it while playing): the
  // terminal outcome line + back-to-club, the locally-terminal "you're out"
  // look, or the Concede button while playing.
  const infoActions = over ? (
    <>
      <span className={cls(shared.outcome, shared[`outcome_${over.tone}`])}>{over.message}</span>
      <BackToClubButton onClick={ctx.goToClub} compact />
    </>
  ) : isConceded ? (
    <>
      <span className={cls(shared.outcome, shared.outcome_neutral)}>You&rsquo;re out</span>
      <BackToClubButton onClick={ctx.goToClub} compact />
    </>
  ) : (
    <ConcedeGameButton onClick={() => void handleConcede()} className={shared.helperButton} />
  )

  return (
    <>
      <PlayerBoard
        gameId={gameId}
        initialBoard={initialBoard}
        tiles={tiles}
        isTerminal={ctx.isTerminal}
        isConceded={isConceded}
        onPeel={peel}
        onDump={dump}
        bunchCount={bunchCount}
        boxCount={boxCount}
        infoTop={infoTop}
        infoActions={infoActions}
        localPill={localFeedbackMsg && <GenericFeedbackPill msg={localFeedbackMsg} onClose={noop} />}
      />
      <TerminalModal isTerminal={ctx.isTerminal} over={over} onBackToClub={ctx.goToClub} />
    </>
  )
}
