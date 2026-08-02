import { useCallback, useEffect, useRef } from 'react'
import type { GamePageCtx, GenericFeedbackMsg } from '../../common/lib/games'
import { timerLabel } from '../../common/lib/game/timerLabel'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { EndGameButton } from '../../common/components/buttons/EndGameButton'
import { CONCEDE_CONFIRM } from '../../common/hooks/game/useStandardGameActions'
import { TerminalActionRow } from '../../common/components/game/terminal/TerminalActionRow'
import { LocalTerminalRow } from '../../common/components/game/terminal/LocalTerminalRow'
import { DeviceBlockNotice } from '../../common/components/game/DeviceBlockNotice'
import { useCoarsePointer } from '../../common/hooks/ui/useCoarsePointer'
import { GenericFeedbackPill } from '../../common/components/feedback/GenericFeedbackPill'
import { ConcedeGameButton } from '../../common/components/buttons/ConcedeGameButton'
import { NewGameButton } from '../../common/components/buttons/NewGameButton'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useDismissLocalFeedbackOnKey } from '../../common/hooks/feedback/useDismissLocalFeedbackOnKey'
import { difficultyValue } from '../../common/lib/game/difficulty'
import { IconExchange } from '../../common/components/icons'
import type { TerminalCopy } from '../../common/lib/game/terminalCopy'
import { outOfRacePill, terminalPill } from '../../common/lib/game/localPills'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
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
import { useSwallowTab } from '../../common/hooks/input/useSwallowTab'
import { useConfirmDialog, NEW_GAME_CONFIRM, END_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'

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
 * The `is_terminal` flip arrives over `useCommonGame`'s realtime; the winner gets
 * a `<CelebrationDialog>`, everyone else the below-board verdict pill.
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
  // Tab does nothing while the board has the keyboard — this play surface is
  // not a form, so native Tab would walk out to the header buttons and on into
  // the browser's URL bar, stranding the player. (The capture-entry games get
  // this from useCaptureKeys; see useSwallowTab.)
  useSwallowTab()
  const { initialBoard, tiles, loading } = useGame(ctx.gameId)
  const progress = useProgress(ctx.gameId)

  // bananagrams is DESKTOP-ONLY (docs/mobile.md → "Where each game plays"): the
  // board is a drag-heavy 25×25 arena that's unpleasant even on a keyboard
  // tablet, so it's hard-blocked on *all* touch — a phone or tablet gets the
  // block screen instead of a broken two-column layout to limp through. The gate
  // keys off the pointer (not width): a touch tablet is desktop-width but still
  // has no mouse to drag with. (scrabble/crossplay are keyboard-required, NOT
  // desktop-only, and are deliberately left un-gated — see docs/mobile.md.)
  const isTouch = useCoarsePointer()

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
    // flips is_terminal (the verdict pill + the winner's celebration react).
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
    if (!window.confirm(CONCEDE_CONFIRM)) return
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

  // ─── New game ───────────────────────────────────────────────────────────
  // A FRESH game (new id, a newly dealt bunch) with THIS game's setup + roster,
  // in the same club — the "same again!" action after someone goes out. A direct
  // create_game RPC (bananagrams deals inline, no edge function) and no `mode`
  // argument: the game is compete-only, one gametype. Non-destructive
  // (common.create_game un-currents this game into the club's list), so no
  // confirm; the creator jumps in via ctx.goToGame, peers arrive via the
  // game-invitation toast.
  //
  // NOTE there is deliberately no "Restart" twin (Joel's call). The other
  // games' replay re-runs the SAME puzzle; bananagrams has no puzzle to re-run —
  // the bunch is dealt at random and the whole game is the race to consume it, so
  // "again" can only mean a fresh deal, which is what New game already is.
  // Shared confirm modal — bananagrams' only use is the new-game question
  // below (its End/Concede go through useStandardGameActions, which owns its
  // own). Render {confirmDialog} in the tree, as the other games do.
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

  // ─── End game — the whole table stops, with no result for anyone ────────
  // The twin of Concede, and deliberately not the same thing: conceding is a
  // loss on your record and it takes EVERY player doing it to close a game the
  // group has just lost interest in. Confirmed through the styled modal (it's
  // irreversible) using the shared END_GAME_CONFIRM copy, and held in a ref for
  // the menu effect exactly like Concede above.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!(await confirmAction(END_GAME_CONFIRM))) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) {
      showLocalFeedback({ tone: 'error', text: error.message, variant: 'outline', dismiss: { kind: 'sticky' } })
    }
  }, [gameId, isTerminal, showLocalFeedback, confirmAction])
  const endGameRef = useRef<() => void>(() => {})
  useEffect(() => {
    endGameRef.current = () => void handleEndGame()
  }, [handleEndGame])

  const newGameRef = useRef<() => void>(() => {})
  const createNewGame = useCallback(async () => {
    // Starting a new game mid-play SHELVES this one (create_game clears the
    // club's current-view flag; it stays resumable from the club page). Confirm
    // anyway so an accidental `+` doesn't read as "I just lost my game" — the
    // copy says shelved, not ended. At terminal there's nothing to interrupt.
    if (!ctx.isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))) return
    const { data, error } = await db
      .rpc('create_game', {
        target_club: ctx.clubHandle,
        setup: ctx.setup as unknown as BananagramsSetup,
        player_user_ids: ctx.players.map((p) => p.user_id),
      })
      .single()
    if (error || !data) {
      showLocalFeedback({
        tone: 'error',
        text: `New game failed: ${error?.message ?? 'unknown'}`,
        variant: 'outline',
        dismiss: { kind: 'sticky' },
      })
      return
    }
    ctx.goToGame('bananagrams', (data as { id: string }).id)
  }, [ctx, showLocalFeedback, confirmAction])

  // Single-flight guard. New game has THREE triggers (the terminal button, the
  // game-menu item, and the global `+` shortcut), and `common.create_game` is
  // NOT idempotent — every call shelves the club's current game and starts
  // another, orphaning the last in the club list and toasting every peer.
  // Guarding the HANDLER covers all three triggers at once, which a `disabled`
  // button could never do. `startingNewGame` then greys the button so a slow
  // network reads as "working" rather than "nothing happened".
  //
  // The MENU ITEM deliberately takes no `disabled`: its effect is built above
  // this line and is kept independent of handler identity on purpose (the
  // actionsRef indirection). It doesn't need one — `+` and the menu both route
  // through this same guarded handler.
  const [handleNewGame, startingNewGame] = useSingleFlight(createNewGame)
  useEffect(() => {
    newGameRef.current = () => void handleNewGame()
  }, [handleNewGame])

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
    // bananagrams is compete-only, so the tail leads with Concede — but it
    // ALSO passes onEndGame, so the menu offers the whole-table stop beneath
    // it (see buildGameMenu). Both thunks dispatch through stable refs so this
    // effect needn't depend on their identities.
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: 'compete',
        isTerminal,
        conceded: myConceded,
        onConcede: () => concedeRef.current(),
        onEndGame: () => endGameRef.current(),
        offerEndInCompete: true,
        extra: [
          { items: [{ id: 'print', label: 'Print board (PDF)', onClick: doPrint }] },
          // The same action the terminal row offers, reachable mid-game too.
          { items: [{ id: 'new-game', label: 'New game', shortcut: '+', onClick: () => newGameRef.current() }] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, brand, title, ctx.setup, loading, initialBoard, isTerminal, myConceded])

  // ─── Did I win? ────────────────────────────────────────────────────────
  // Derived UP HERE (not beside the terminal verdict below) because the
  // celebration hook needs it and every early return past this point would
  // otherwise make that hook conditional. Reads ONLY ctx — the common.games row
  // + the roster, both of which GamePage has already awaited (it renders
  // "Loading game…" until then) — so it's correct on the very FIRST render.
  // That's what makes a per-player gate safe here: nothing arrives late to flip
  // it false→true and pop confetti at someone merely reviewing a finished game.
  //
  // bananagrams' status carries only `winner_username` (no winner uuid — see
  // the peel-win block in the migration), so the test is a name comparison.
  const selfId = ctx.session.user.id
  const selfUsername = ctx.players.find((p) => p.user_id === selfId)?.username
  // Gate on the winner EXISTING, not on the display fallback: 'someone' is a
  // legal username (^[a-z][a-z0-9-]{2,14}$), so comparing against it would pop
  // confetti for a player actually called "someone" on a no-winner terminal
  // (timeout / all-conceded, where status carries no winner_username).
  const winnerUsername = ctx.status?.winner_username as string | undefined
  const winnerName = winnerUsername ?? 'someone'
  const selfWon = !!selfUsername && winnerUsername === selfUsername

  // ─── Win celebration ───────────────────────────────────────────────────
  // Confetti at the MOMENT I go out — my winning peel ends the game on every
  // client via the common realtime refetch. bananagrams is compete-only (a race
  // to clear), so unlike the coop games it's the WINNER who celebrates, and only
  // them; everyone else gets the verdict pill. `useCelebration` never pops on
  // mount, so re-opening a won game stays quiet.
  const celebration = useCelebration(isTerminal && selfWon)

  // Desktop-only block (see `isTouch` above). Rendered AFTER every hook so the
  // Rules of Hooks hold, and in place of the whole play surface so the drag
  // arena never mounts on touch. GamePage's chrome (header menu, Back to club)
  // still wraps this, and the notice carries its own exit.
  if (isTouch) {
    return (
      <DeviceBlockNotice title="Bananagrams needs a desktop" onBackToClub={ctx.goToClub}>
        You play by dragging tiles around a big board — that wants a mouse and a
        full-size screen, so it&rsquo;s not available on phones or tablets. Open
        this game on a computer to play.
      </DeviceBlockNotice>
    )
  }

  if (loading || initialBoard === null) return <p className="muted">Dealing tiles…</p>

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
  // (`winnerName` / `selfWon` are derived above the early returns, for the
  // celebration hook.)
  const over: TerminalCopy | null = !isTerminal
    ? null
    : ctx.status?.outcome === 'timeout'
      ? { verdict: "⏰ Time's up — no winner", message: 'Out of time', tone: 'lost' }
      : ctx.status?.outcome === 'conceded'
        ? { verdict: '🏳️ All conceded — no winner', message: 'All conceded', tone: 'lost' }
        : selfWon
          ? { verdict: '🍌 Bananas! You went out first', message: 'You won!', tone: 'won' }
          : { verdict: `${winnerName} went out — Bananas!`, message: `${winnerName} won`, tone: 'lost' }

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
      ? outOfRacePill(true)
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
  // Icon-only throughout (the canonical action-row treatment — the styled
  // tooltip carries each label). At terminal the stay-here option (New game)
  // sits left of the leave option (Club), matching every other game's terminal
  // row; there's no Restart twin (see handleNewGame). The locally-terminal
  // "you're out" row keeps Club alone — the race is still running, so offering
  // to start a different game there would be a distraction.
  const infoActions = over ? (
    <TerminalActionRow over={over} onBackToClub={ctx.goToClub} iconOnly>
      <NewGameButton iconOnly onClick={handleNewGame} disabled={startingNewGame} />
    </TerminalActionRow>
  ) : isConceded ? (
    // No Concede button to carry: bananagrams' conceded row is the status line
    // plus the way out, since the race running on is the whole point.
    <LocalTerminalRow label="You conceded" />
  ) : (
    // Both exits, side by side: End stops the table (no result for anyone),
    // Concede drops just you (a loss, and the others race on). End sits first
    // because it's the gentler of the two.
    <>
      <EndGameButton iconOnly onClick={() => void handleEndGame()} className={shared.helperButton} />
      <ConcedeGameButton iconOnly onClick={() => void handleConcede()} className={shared.helperButton} />
    </>
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
      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board pill + the info-column outcome line. The WINNER gets
          the celebration instead — bananagrams is compete-only, so there's no
          coop win to pop it for (see useCelebration above). */}
      {celebration.show && (
        <CelebrationDialog title="Bananas! 🍌" body="You went out first." onClose={celebration.close} />
      )}
      {confirmDialog}
    </>
  )
}
