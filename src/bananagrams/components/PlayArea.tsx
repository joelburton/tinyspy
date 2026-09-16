// cs-unmet

import { runRpc } from '@/common/supabase/dbResult'
import { useCallback, useEffect, useRef, useMemo } from 'react'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { InfoActionsRow } from '@/common/info-sheet/InfoActionsRow'
import { DeviceBlockNotice } from '@/common/game-page/DeviceBlockNotice'
import { useIsCoarsePointer } from '@/common/mobile/useIsCoarsePointer'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { IconExchange } from '@/common/icons/icons'
import type { TerminalMessage } from '@/common/terminal/terminalMessage'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { ActionButton } from '@/common/actions/ActionButton'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { db } from '../db'
import { useGame, usePeerBoards, useProgress } from '../hooks/useGame'
import type { BananagramsSetup } from '../lib/setup'
import { boardLetters, boardToGrid } from '../lib/board'
import { boardWords } from '../lib/words'
import { printBananagramsPdf } from '../pdf/printBananagramsPdf'
import { PlayerBoard } from './PlayerBoard'
import type { BananagramsCheckResult } from '../hooks/usePlayerBoard'
import { PeersStrip } from './PeersStrip'
import { setupRows } from '../lib/setupSummary'
import { SetupDisclosure } from '@/common/setup-form/SetupDisclosure'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import '../theme.css' // bananagrams tokens + the global drag-cursor rule
import { useTabRing } from '@/common/keyboard/useTabRing'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * bananagrams play surface (v3).
 *
 * bananagrams is the roster's one intentional exception to "everything needed
 * to make a move lives in the board column": the board is a zoom/scroll arena
 * that fills the left column, and the HAND + peel + dump live in the RIGHT
 * (info) column instead. It's a desktop-only game and the hand-on-the-right feel
 * is deliberate (see docs/games/bananagrams.md). So `<PlayerBoard>` owns the
 * whole two-column shell (the shared `.layout` / `.infoCol` / `.noShrinkRow`
 * scaffold, with a fill — not hug — board column), and THIS component supplies
 * the v3 info-column chrome (`infoTop`) + the below-board feedback slot.
 *
 * Feedback is LOCAL (the slot drawn under the board), not the global header: a
 * peel/dump draw, a not-ok, and the terminal verdict are all about the player's
 * own game, so they belong in the local feedback area.
 *
 * Win flow: `peel` (enabled only when the hand is empty) either deals everyone a
 * tile or — when the bunch can't refill the ACTIVE table — goes out and wins.
 * The `is_terminal` flip arrives over `useCommonGame`'s realtime; the winner gets
 * a `<CelebrationBlockingModal>`, everyone else the below-board verdict.
 *
 * Concede: bananagrams is compete, so conceding is a real loss — but it only
 * drops YOU out (`bananagrams.concede`); the others keep racing. A conceded
 * player sees the terminal LOOK locally (board frozen, "you're out") while the
 * game stays live; the last player to concede ends it as a collective loss.
 */

/** What `bananagrams.peel` puts in `data`. `illegal` is an ok answer on purpose:
 *  a board that isn't win-legal is a state of play — the game keeps going and
 *  the player fixes the cells and peels again. */
type PeelResult =
  | { result: 'dealt'; invalid_cells: number[] }
  | { result: 'won'; invalid_cells: number[] }
  | { result: 'illegal'; invalid_cells: number[] }
  | null

/** What `bananagrams.dump` puts in `data`. One answer: the swap either happens
 *  or is refused, and the new hand arrives over realtime rather than here. */
type DumpResult = { result: 'dumped' } | null

export function PlayArea(ctx: GamePageCtx) {
  // The board is worked by clicks and typing, so Tab has nowhere to go here —
  // and an empty ring is what keeps it from walking out to the browser.
  useTabRing([])
  const { initialBoard, tiles, loading, failure } = useGame(ctx.gameId, ctx.session.user.id)
  // Everyone's finished grids, for the printout's per-player columns. Empty
  // until the game ends — see usePeerBoards / the player_boards RLS.
  const peerBoards = usePeerBoards(ctx.gameId, ctx.isTerminal)
  // The setup recap, built ONCE and handed to both consumers — the disclosure
  // below renders it as <li>s, the print model prints the same array object
  // (docs/pdf.md → Setup rows). bananagrams keeps its disclosure in this file
  // rather than an InfoCol, being the v3 layout exception.
  const summaryRows = useMemo(
    () => setupRows(ctx.setup as unknown as BananagramsSetup, 'compete', ctx.players),
    [ctx.setup, ctx.players],
  )
  const progress = useProgress(ctx.gameId)

  // bananagrams is DESKTOP-ONLY (docs/mobile.md → "Where each game plays"): the
  // board is a drag-heavy 25×25 arena that's unpleasant even on a keyboard
  // tablet, so it's hard-blocked on *all* touch — a phone or tablet gets the
  // block screen instead of a broken two-column layout to limp through. The gate
  // keys off the pointer (not width): a touch tablet is desktop-width but still
  // has no mouse to drag with. (scrabble/crossplay are keyboard-required, NOT
  // desktop-only, and are deliberately left un-gated — see docs/mobile.md.)
  const isTouch = useIsCoarsePointer()

  const { gameId, isTerminal, menu, brand, title } = ctx

  // The live board lives in the `usePlayerBoard` engine (inside `<PlayerBoard>`), not
  // here — but the "Print board (PDF)" menu item lives here (this is where `ctx.menu`
  // is). So we hand PlayerBoard a ref it keeps pointed at the current board, and the
  // print's onClick snapshots it at click time.
  const boardRef = useRef<string>('')

  // ─── The local feedback slot (own-move) ─────────────────────────────────
  // The below-board slot: a peel/dump draw acknowledgment, a check result, a
  // not-ok, and the two standing conditions further down (the verdict, "you're
  // out").
  const localFeedbackSlot = useFeedbackSlot('local')
  // Any key is the player's next move → dismiss a gesture-cleared message.
  // (bananagrams's own board keys live in PlayerBoard; this is the shared
  // `act-dismiss-feedback`, which the dispatcher's field gate keeps away from
  // chat.)
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  const peel = useCallback(async (): Promise<{ illegalCells: number[] } | null> => {
    const res = await runRpc<PeelResult>(db.rpc('peel', { target_game: gameId }))
    if (res.type === 'not-ok') {
      // Two races (the game ended, or a second tab conceded) and three faults,
      // and the slot says the server's sentence for all five — orange for the
      // races, red for the faults, which is what the severity already means.
      // `runRpc` has already raised the modal for the faults.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return null
    } else if (res.type === 'ok' && res.data?.result === 'illegal') {
      // The board isn't win-legal (disconnected, or — with word_check
      // 'win'/'strict' — an invalid word), so the game stays in progress and
      // the RPC hands back the offending cells. Show the player the result and
      // let PlayerBoard paint those cells red. In 'strict' this also fires on a
      // CONTINUING peel (you can't peel an invalid board), not only on a
      // winning one.
      localFeedbackSlot.show(
        FeedbackMessage.result(
          'lost',
          'Fix the highlighted tiles before peeling — every word must be real and the grid one connected piece.',
        ),
      )
      return { illegalCells: res.data.invalid_cells }
    } else if (res.type === 'ok' && res.data?.result === 'dealt') {
      // Nothing to say: the draw grows `tiles`, and the announcement effect
      // reacts to that.
      return null
    } else if (res.type === 'ok' && res.data?.result === 'won') {
      // Nothing to say here either: the win flips is_terminal, and the verdict
      // + the winner's celebration react to that.
      return null
    } else {
      reportUnhandled('peel', res)
      return null
    }
  }, [gameId, localFeedbackSlot])

  // Check words → a result in the local slot. Four outcomes, and the wording
  // matters more than usual because the RED CELLS are the real answer — the
  // result only says how to read them. A clean board says so plainly (there's
  // nothing on screen to notice otherwise), and an empty board is called out
  // separately so "all good" can't congratulate someone who hasn't placed a
  // tile.
  const showCheckResult = useCallback(
    (r: BananagramsCheckResult) => {
      const feedbackMsg =
        r.kind === 'clean'
          ? FeedbackMessage.result('won', 'Every word checks out, and the grid is one piece.')
          : r.kind === 'empty'
            ? FeedbackMessage.result('noted', 'Nothing on the board to check yet.')
            : r.kind === 'invalid'
              ? FeedbackMessage.result(
                  'lost',
                  `${r.count} tile${r.count === 1 ? '' : 's'} highlighted — either not a real word, or not joined to the grid.`,
                )
              : FeedbackMessage.result('error', `Check failed: ${r.message}`)
      localFeedbackSlot.show(feedbackMsg)
    },
    [localFeedbackSlot],
  )

  // A dump also grows MY `tiles` (−1 dumped + dump_count drawn). We flag it so
  // the announcement below reads the next growth as a dump rather than a peel.
  // Best-effort, NOT race-free (a peer's peel in the echo window could trip the
  // flag first) — accepted as cosmetic under the friends-only trust model; the
  // tile multiset is always correct, only a 2.5s toast can be mislabeled.
  const dumpPending = useRef(false)
  const dump = useCallback(
    async (tile: string) => {
      dumpPending.current = true
      const res = await runRpc<DumpResult>(db.rpc('dump', { target_game: gameId, tile }))
      if (res.type === 'ok' && res.data?.result === 'dumped') {
        // Nothing to say: the swap grows `tiles`, and the announcement effect
        // reads the flag set above to call it a dump rather than a peel.
      } else if (res.type === 'not-ok') {
        // Four races (the game ended, a second tab conceded, a rival drained
        // the bunch, the server's hand disagrees with the screen) and two
        // faults, and the slot says the server's sentence for all six.
        // `runRpc` has already raised the modal for the faults.
        dumpPending.current = false // no tiles change is coming
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
      } else {
        dumpPending.current = false
        reportUnhandled('dump', res)
      }
    },
    [gameId, localFeedbackSlot],
  )

  // Acknowledge a draw: my own `tiles` growing means a peel dealt me a tile
  // (or my dump just resolved). Seed the baseline after load so the initial
  // deal doesn't read as a draw. An `acknowledgment` held a little longer than
  // its kind's default — a sentence with a number in it, read at a glance
  // between moves — which is bananagrams' own call, made here.
  const seenTilesLen = useRef<number | null>(null)
  useEffect(function acknowledgeDraw() {
    if (loading) return
    if (seenTilesLen.current === null) {
      seenTilesLen.current = tiles.length
      return
    }
    if (tiles.length > seenTilesLen.current) {
      const grew = tiles.length - seenTilesLen.current
      if (dumpPending.current) {
        dumpPending.current = false
        localFeedbackSlot.show(
          FeedbackMessage.acknowledgment(
            'neutral',
            <>
              <IconExchange size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> Dumped 1,
              drew {grew + 1}.
            </>,
            { ms: 2500 },
          ),
        )
      } else {
        localFeedbackSlot.show(
          FeedbackMessage.acknowledgment(
            'neutral',
            `🍌 Peel! You drew ${grew} tile${grew === 1 ? '' : 's'}.`,
            { ms: 2500 },
          ),
        )
      }
    }
    seenTilesLen.current = tiles.length
  }, [tiles, loading, localFeedbackSlot])

  // ─── Concede / Restart — the shared exits ──────────────────────────────
  // bananagrams is compete-only and is the one game that can ALSO stop the
  // whole table, which is what `offersEndForAll` says: conceding is a loss on
  // your record and it takes every player doing it to close a game the group
  // has lost interest in, while ending is the group agreeing there is no
  // result. Both live behind Concede — its question is where the difference is
  // explained, rather than two red buttons on the board naming it and hoping.
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: 'compete',
    // The raw roster flag (common.game_players). The stronger `isConceded`
    // below also ANDs `!isTerminal`, for the frozen-board LOOK; the action wants
    // the plain fact, and grays itself at terminal on its own.
    myConceded: !!ctx.players.find((p) => p.user_id === ctx.session.user.id)?.conceded,
    offersEndForAll: true,
    localFeedbackSlot,
  })

  // The printout's inputs, through a ref for the SAME reason as the thunks
  // above: the menu holds `doPrint` and runs it at click time, so it must read
  // the CURRENT peer boards and roster, not the ones its effect first closed
  // over — otherwise a terminal print still shows one column, the very bug the
  // per-player columns fix.
  //
  // A ref rather than effect deps: `ctx.players` is a fresh array identity most
  // renders, so listing it would rebuild this game's whole menu on every one of
  // them.
  const printDataRef = useRef({ peerBoards, players: ctx.players, selfId: ctx.session.user.id })
  useEffect(() => {
    printDataRef.current = { peerBoards, players: ctx.players, selfId: ctx.session.user.id }
  }, [peerBoards, ctx.players, ctx.session.user.id])

  // ─── New game ───────────────────────────────────────────────────────────
  // A FRESH game (new id, a newly dealt bunch) with THIS game's setup + roster,
  // in the same club — the "same again!" action after someone goes out. A direct
  // create_game RPC (bananagrams deals inline, no edge function) and no `mode`
  // argument: the game is compete-only, one gametype.
  //
  // The registry asks NEW_GAME_CONFIRM mid-play
  // (starting one SHELVES this game: create_game clears the club's current-view
  // flag, so it stays resumable — the copy says shelved, not ended) and goes
  // straight through at terminal. The shared run's single flight is what stops a
  // second press dealing a second game.
  //
  // A plain function, rebuilt every render: the binding reads it at click time,
  // so `ctx` is whatever the last realtime refetch left.
  const createNewGame = async () => {
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: ctx.clubHandle,
        setup: ctx.setup as unknown as BananagramsSetup,
        player_user_ids: ctx.players.map((p) => p.user_id),
      }),
    )
    if (res.type === 'not-ok') {
      // THE SAME ENVELOPE, READ DIFFERENTLY. On the setup form a validation is
      // an answer — fix the field and press Start again. Here there is no field
      // and no form, so whatever came back goes in the slot as it reads, over
      // the verdict, until its × is pressed. Shown even for a fault whose
      // modal has already fired centrally — the modal escalates, it does not
      // replace (docs/envelopes.md), so dismissing it must not leave the board
      // silent about why the game didn't start.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      ctx.goToGame('bananagrams', res.data.id)
      return
    } else {
      reportUnhandled('create_game', res)
      return
    }
  }
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    describe: () => 'active',
    run: createNewGame,
  })

  // ─── "Print board (PDF)" ────────────────────────────────────────────────
  // A COLUMN PER PLAYER (docs/pdf.md → track family), built at CLICK time. The
  // caller's own board is read from `boardRef` then (not baked in here) so it is
  // always current; the others come from `peerBoards`, which only has rows once
  // the game is terminal — `player_boards` is owner-only while the race is on,
  // so mid-game this prints the caller's column alone.
  //
  // Words are extracted with the same rule the server's win check uses
  // (`boardWords`), then de-duped + sorted — unscored and unattributed, it's
  // just that board's vocabulary.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (loading || initialBoard === null ? 'hidden' : 'active'),
    run: () => {
      const { peerBoards: peers, players: roster, selfId } = printDataRef.current
      const nameOf = (userId: string) =>
        roster.find((p) => p.user_id === userId)?.username ?? 'someone'

      /** One column from a raw 625-char board string. */
      const trackOf = (userId: string, raw: string) => {
        const words = Array.from(new Set(boardWords(raw))).sort()
        const placed = boardLetters(raw).length
        return {
          who: userId === selfId ? `${nameOf(userId)} (you)` : nameOf(userId),
          board: boardToGrid(raw),
          words,
          result:
            `${placed} tile${placed === 1 ? '' : 's'} placed · ` +
            `${words.length} word${words.length === 1 ? '' : 's'}`,
        }
      }

      // The caller's own board comes from the LIVE ref, not from `peerBoards`:
      // the FE owns the grid between snapshots, so the server's copy can trail
      // the tile you just dragged. Everyone else's comes from the read.
      const mine = trackOf(selfId, boardRef.current)
      const others = peers
        .filter((r) => r.user_id !== selfId)
        .map((r) => trackOf(r.user_id, r.board))
      // Roster order for the rest, so two printouts of the same game agree.
      others.sort((a, b) => a.who.localeCompare(b.who))

      printBananagramsPdf({
        brand,
        gameTitle: title,
        date: new Date().toLocaleDateString(),
        // The header counts the CALLER's board; each column carries its own
        // tally, since in compete there's no one number for the table.
        summary: mine.result,
        // Relevant setup only — the timer + dump destination don't describe the board.
        mode: 'compete' as const,
        setup: summaryRows,
        tracks: [mine, ...others],
      })
    },
  })

  // The FULL bananagrams menu. `buildGameMenu` supplies the framing (Help + chat
  // above, Back to club below); the middle is this game's own rows, each one a
  // binding it already made. The game is compete-only, so the only exit row is
  // Concede — which here reads "Concede / End game", because this game offers
  // both endings inside its question (useStandardGameActions' offersEndForAll).
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        exits: [actConcede, actEndGame],
        extra: [
          { items: [actPrintBoard] },
          // The same pair the terminal row offers, reachable mid-game too.
          { items: [actRestart, actNewGame] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actRestart, actNewGame, actPrintBoard])

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

  // ─── The two standing conditions of the local slot ───
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — the slot draws whichever ranks highest. Above the early
  // returns because effects must be.

  // The terminal message, memoized on primitives so the verdict effect sees
  // one object per outcome. Three terminal shapes: a peel-win
  // (status.winner_username set), a countdown timeout (outcome 'timeout',
  // everyone lost), and an all-conceded collective loss (outcome 'conceded',
  // everyone lost). The no-winner cases are checked FIRST — with no
  // winner_username the peel-win branch would fall through to "someone went
  // out — Bananas!" and show everyone a loss for the wrong reason.
  const statusOutcome = (ctx.status?.outcome as string | undefined) ?? null
  const over = useMemo((): TerminalMessage | null => {
    if (!isTerminal) return null
    if (statusOutcome === 'timeout') {
      return { pillText: "⏰ Time's up — no winner", infoColText: 'Out of time', outcome: 'lost' }
    }
    if (statusOutcome === 'conceded') {
      return { pillText: '🏳️ All conceded — no winner', infoColText: 'All conceded', outcome: 'lost' }
    }
    if (selfWon) {
      return { pillText: '🍌 Bananas! You went out first', infoColText: 'You won!', outcome: 'won' }
    }
    return { pillText: `${winnerName} went out — Bananas!`, infoColText: `${winnerName} won`, outcome: 'lost' }
  }, [isTerminal, statusOutcome, selfWon, winnerName])
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  // Locally terminal: I've conceded but the game is still live for the others.
  // Shown as the terminal LOOK (frozen board + "you're out"), not a silent
  // swap. Concede lives on the shared roster (ctx.players →
  // common.game_players).
  const isConceded = !!ctx.players.find((p) => p.user_id === selfId)?.conceded && !isTerminal
  useEffect(function showOutOfRace() {
    if (!isConceded) return
    const id = localFeedbackSlot.show(FeedbackMessage.outOfRace(true))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isConceded])

  // Desktop-only block (see `isTouch` above). Rendered AFTER every hook so the
  // Rules of Hooks hold, and in place of the whole play surface so the drag
  // arena never mounts on touch. GamePage's chrome (header menu, Back to club)
  // still wraps this, and the notice repeats that exit where it is obvious.
  //
  // It is the SHELL's action, so a blocked player leaves the way anyone else
  // does: a live game is shelved and every peer is sent back to the club. That
  // is the right answer rather than a heavy one — if one friend cannot play
  // this, the group picks another game, and this one is waiting to resume.
  if (isTouch) {
    return (
      <DeviceBlockNotice title="Bananagrams needs a desktop" actBackToClub={ctx.menu.actBackToClub}>
        You play by dragging tiles around a big board — that wants a mouse and a
        full-size screen, so it&rsquo;s not available on phones or tablets. Open
        this game on a computer to play.
      </DeviceBlockNotice>
    )
  }

  // A failed read is NOT a missing game. Both leave the board unrenderable, and
  // saying "Game not found." about a dead connection is a confident wrong
  // answer — this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // bananagrams has no `game` row of its own — the board IS the state — so there
  // is no "not found" to tell apart. What the failure branch above buys here is
  // the difference between a dead read and a deal that has not landed yet.
  if (loading || initialBoard === null) return <p className="muted">Dealing tiles…</p>

  const bunchCount = ctx.status?.bunch_remaining as number | undefined
  const bagCount = ctx.status?.bag_remaining as number | undefined

  // ─── Info-column chrome ─────────────────────────────────────────────────
  // bananagrams' info column is a DOCUMENTED EXCEPTION to the canonical v3
  // order: state → opponents → help → setup → the HAND card (with the dump zone
  // + rotate) → the action row (Concede / Dump) at the very bottom. The hand +
  // peel live here, not in the board column (the game's other documented
  // exception), so the actions sit below them rather than in the shared
  // `.noShrinkRow`. `infoTop` is the readout stack; `infoActions` is the bottom
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
        {summaryRows.map((r) => (
          <li key={r.key}>
            {r.label}: {r.value}
          </li>
        ))}
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
  // row; Restart is a menu row, not a terminal-row twin. The locally-terminal
  // "you're out" row keeps Club alone — the race is still running, so offering
  // to start a different game there would be a distraction.
  const infoActions = over ? (
    <InfoActionsRow message={{ text: over.infoColText, outcome: over.outcome }}>
      <ActionButton action={actNewGame} show="icon" />
      <ActionButton action={ctx.menu.actBackToClub} show="icon" weight="primary" />
    </InfoActionsRow>
  ) : isConceded ? (
    // No Concede button to carry: bananagrams' conceded row is the status line
    // plus the way out, since the race running on is the whole point.
    <InfoActionsRow message={{ text: 'You conceded', outcome: 'neutral' }} />
  ) : (
    // Both exits are placed, but only Concede draws while you are racing: its
    // question offers ending the table as the second answer (`offersEndForAll`).
    // End comes out on its own only once your Concede is spent.
    <>
      <ActionButton action={actEndGame} show="icon" />
      <ActionButton action={actConcede} show="icon" />
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
        onCheckResult={showCheckResult}
        onDump={dump}
        bunchCount={bunchCount}
        bagCount={bagCount}
        reportBoardRef={boardRef}
        infoTop={infoTop}
        infoActions={infoActions}
        localFeedbackSlot={localFeedbackSlot}
      />
      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board slot + the info-column outcome line. The WINNER gets
          the celebration instead — bananagrams is compete-only, so there's no
          coop win to pop it for (see useCelebration above). */}
      {celebration.show && (
        <CelebrationBlockingModal title="Bananas! 🍌" body="You went out first." onClose={celebration.close} />
      )}
    </>
  )
}
