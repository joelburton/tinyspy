import { useCallback, useEffect, useRef } from 'react'
import type { GamePageCtx, GenericFeedbackMsg } from '../../common/lib/games'
import { timerLabel } from '../../common/lib/game/timerLabel'
import { TerminalModal } from '../../common/components/game/terminal/TerminalModal'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { BackToClubButton } from '../../common/components/buttons/BackToClubButton'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useDismissLocalFeedbackOnKey } from '../../common/hooks/feedback/useDismissLocalFeedbackOnKey'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { IconExchange } from '../../common/components/icons'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { stickyPill, terminalPill } from '../../common/lib/game/localPills'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { cls } from '../../common/lib/util/cls'
import { db } from '../db'
import { useGame, useProgress } from '../hooks/useGame'
import type { BananagramsSetup } from '../lib/setup'
import { boardLetters, boardToGrid } from '../lib/board'
import { boardWords } from '../lib/words'
import { printBananagramsPdf } from '../pdf/printBananagramsPdf'
import { PlayerBoard } from './PlayerBoard'
import { PeersStrip } from './PeersStrip'
import { SetupDisclosure } from '../../common/components/setup/SetupDisclosure'
import shared from '../../common/components/game/PlayArea.module.css'
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

  const { gameId, isTerminal, menu, brand, title } = ctx

  // The live board lives in the `usePlayerBoard` engine (inside `<PlayerBoard>`), not
  // here — but the "Print board (PDF)" menu item lives here (this is where `ctx.menu`
  // is). So we hand PlayerBoard a ref it keeps pointed at the current board, and the
  // print's onClick snapshots it at click time.
  const boardRef = useRef<string>('')

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
    // A blocked peel: the board isn't win-legal (disconnected, or — with
    // word_check 'win'/'strict' — an invalid word), so the game stays in
    // progress and the RPC hands back the offending cells. Show the player an
    // error and let PlayerBoard paint those cells red. In 'strict' this also
    // fires on a CONTINUING peel (you can't peel an invalid board), not only on
    // a winning one. A 'won'/'dealt' result needs nothing here: a continuing
    // peel grows `tiles` (the announcement effect reacts) and a winning peel
    // flips is_terminal (the modal reacts).
    const res = data as { result: string; invalid_cells: number[] } | null
    if (res?.result === 'illegal') {
      showLocalFeedback({
        tone: 'error',
        text: 'Fix the highlighted tiles before peeling — every word must be real and the grid one connected piece.',
        variant: 'outline',
        dismiss: { kind: 'sticky' },
      })
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

  // The concede thunk the game menu fires, held in a stable ref so the menu
  // effect (a `setGameSections` setState) needn't list `handleConcede` in its
  // deps and re-run every time that callback's identity changes. Same pattern
  // as crosswords' `actionsRef`: populated by an effect after render, read at
  // click time.
  const concedeRef = useRef<() => void>(() => {})
  useEffect(() => {
    concedeRef.current = () => void handleConcede()
  }, [handleConcede])

  // My conceded flag off the shared roster (common.game_players), for the menu's
  // greyed-out Concede item. The stronger `isConceded` (below the loading guard)
  // also ANDs `!isTerminal` for the frozen-board LOOK; the menu just needs the
  // raw flag, which `buildGameMenu` already disables at terminal itself.
  const myConceded = !!ctx.players.find((p) => p.user_id === ctx.session.user.id)?.conceded

  // ─── "Print board (PDF)" GamePage menu item ─────────────────────────────
  // A snapshot of the caller's own board — works mid-game or at the end (see
  // docs/pdf.md). The board is read from `boardRef` at CLICK time (not baked into
  // the model here) so it's always current; the words are extracted with the same
  // rule the server's win check uses (`boardWords`), then de-duped + sorted for a
  // tidy reference list — unscored + unattributed, it's just the board's vocabulary.
  useEffect(() => {
    // Wait for the deal — before the board loads there's nothing to print.
    if (loading || initialBoard === null) return
    const setup = ctx.setup as unknown as BananagramsSetup
    const doPrint = () => {
      const board = boardRef.current
      const words = Array.from(new Set(boardWords(board))).sort()
      const placed = boardLetters(board).length
      printBananagramsPdf({
        brand,
        gameTitle: title,
        date: new Date().toLocaleDateString(),
        // Board-centric summary (this print is a record of the board, not the race).
        summary: `${placed} tile${placed === 1 ? '' : 's'} placed · ${words.length} word${words.length === 1 ? '' : 's'}`,
        board: boardToGrid(board),
        // Relevant setup only — the timer + dump destination don't describe the board.
        setup: [
          { label: 'Starter hand', value: `${setup.hand_size} tiles` },
          { label: 'Bunch', value: `${setup.bunch_size} tiles` },
          {
            label: 'Words',
            value: setup.word_check === 'off'
              ? 'Not checked'
              : `Must be real ${setup.word_check === 'strict' ? 'every peel' : 'to win'} (2-letter: ${difficultyValue(setup.dict_2)}, longer: ${difficultyValue(setup.dict_3plus)})`,
          },
        ],
        words,
      })
    }
    // bananagrams is compete-only (no coop, no end_game): the tail item is
    // always Concede. The concede thunk dispatches through the stable ref so
    // this effect needn't depend on `handleConcede`'s identity.
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: 'compete',
        isTerminal,
        conceded: myConceded,
        onConcede: () => concedeRef.current(),
        extra: [{ items: [{ id: 'print', label: 'Print board (PDF)', onClick: doPrint }] }],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, brand, title, ctx.setup, loading, initialBoard, isTerminal, myConceded])

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

  const bunchCount = ctx.status?.bunch_remaining as number | undefined
  const bagCount = ctx.status?.bag_remaining as number | undefined
  const setup = ctx.setup as unknown as BananagramsSetup

  // ─── The below-board pill (terminal / locally-terminal / own-move) ──────
  // Exactly one, by priority: the permanent (fill) terminal verdict; else the
  // sticky "you conceded" when locally terminal; else the own-move draw/error
  // pill (or nothing).
  const localFeedbackMsg: GenericFeedbackMsg | null = over
    ? terminalPill(over.tone, over.verdict)
    : isConceded
      ? stickyPill('neutral', "You conceded — you're out of the race.")
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
          many tiles the player holds; the bag count shows when the game isn't
          on a full bunch (a reduced bunch or dump-to-bag sets tiles aside). */}
      <p className={shared.infoState}>
        <b>Tiles: </b>
        You: <strong>{tiles.length}</strong>
        {' · '}
        Bunch: <strong>{bunchCount ?? '—'}</strong>
        {bagCount !== undefined && bagCount > 0 && (
          <>
            {' · '}
             Bag: <strong>{bagCount}</strong>
          </>
        )}
      </p>

      {/* Opponents — bananagrams keeps its own vertical, closest-to-done strip
          (a race affordance the horizontal OpponentStrip can't express), which
          now also marks conceded peers as "out". Renders nothing in solo. */}
      <PeersStrip players={ctx.players} progress={progress} selfId={selfId} />

      {/* Help — only while the player can still act. */}
      {!over && !isConceded && (
        <p className={shared.infoHelp}>
          Drag tiles or click a cell and type. Peel when your hand is empty.
        </p>
      )}

      {/* Setup — behind a disclosure (closed by default). */}
      <SetupDisclosure>
          <li>Bunch: {setup.bunch_size} tiles</li>
          <li>Starter hand: {setup.hand_size} tiles</li>
          <li>
            Word check:{' '}
            {setup.word_check === 'off'
              ? 'off'
              : setup.word_check === 'strict'
                ? 'every peel'
                : 'at win'}
          </li>
          {setup.word_check !== 'off' && (
            <>
              <li>Dictionary (2-letter): {difficultyValue(setup.dict_2)}</li>
              <li>Dictionary (longer): {difficultyValue(setup.dict_3plus)}</li>
            </>
          )}
          <li>Dumped tiles: {setup.dump_to_bag ? 'set aside (bag)' : 'return to the bunch'}</li>
          <li>Timer: {timerLabel(setup.timer)}</li>
        </SetupDisclosure>
    </>
  )

  // The bottom action row's CONTENT (PlayerBoard wraps it in the shared
  // `.infoActions` row, adding the Peel button beside it while playing): the
  // terminal outcome line + back-to-club, the locally-terminal "you're out"
  // look, or the Concede button while playing.
  const infoActions = over ? (
    <>
      <span className={cls(shared.outcome, shared[`outcome_${over.tone}`])}>{over.message}</span>
      <BackToClubButton onClick={ctx.goToClub} variant="primary" compact />
    </>
  ) : isConceded ? (
    <>
      <span className={cls(shared.outcome, shared.outcome_neutral)}>You&rsquo;re out</span>
      <BackToClubButton onClick={ctx.goToClub} variant="primary" compact />
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
        bagCount={bagCount}
        reportBoardRef={boardRef}
        infoTop={infoTop}
        infoActions={infoActions}
        localPill={localFeedbackMsg && <GenericFeedbackPill msg={localFeedbackMsg} onClose={noop} />}
      />
      <TerminalModal isTerminal={ctx.isTerminal} over={over} onBackToClub={ctx.goToClub} />
    </>
  )
}
