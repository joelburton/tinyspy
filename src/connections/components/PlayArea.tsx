// cs-blessed-connections

import { runRpc } from '@/common/supabase/dbResult'
import { useEffect, useMemo, useState } from 'react'
import { cls } from '@/common/utils/cls'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import { Loading } from '@/common/loading/Loading'
import { NoSuchGamePage } from '@/common/game-page/NoSuchGamePage'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { colorByUserIdMap } from '@/common/members/memberColor'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { useAcknowledge } from '@/common/floating-panels/useAcknowledge'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { memberById } from '@/common/members/memberList'
import { buildConnectionsPrintModel } from '../pdf/model'
import { printConnectionsPdf } from '../pdf/printConnectionsPdf'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { setupRows } from '../lib/setupSummary'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { describeReveal } from '@/common/reveal/describeReveal'
import { solvedByMe, useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { db } from '../db'
import { peerAnswerMessage } from '../lib/answer'
import { CATEGORY_COUNT, MISTAKE_BUDGET } from '../lib/board'
import { useGame, type ConnectionsGame, type EventRow, type MatchedCategory } from '../hooks/useGame'
import type { SelectionMap } from '../lib/selection'
import type { ConnectionsSetup, PuzzleAnswer } from '../lib/setup'
import { historySnapshot } from '../lib/history'
import { buildTerminalMessage } from '../lib/terminal'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // connections-specific color tokens (lazy with this chunk)
import { useTabRing } from '@/common/keyboard/useTabRing'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * The three gates in front of connections' play surface: the read is out, the
 * read failed, or there is no such game. Everything below starts with a game
 * in hand, which is why the surface never writes `game?.`.
 *
 * The game's menu rows and its `+` arrive WITH the game, because the surface
 * that binds them mounts with it — a row for a game not yet read could only
 * gray itself or lie.
 */
export function PlayAreaLoader(ctx: GamePageCtx) {
  const {
    game,
    guesses,
    matchedCategories,
    mistakeCount,
    opponentFound,
    isEliminated,
    selections,
    unionTiles,
    toggleTile,
    sendClear,
    loading,
    failure,
  } = useGame(ctx.session, ctx.gameId)

  if (loading) return <Loading />
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "there's no game here" about a dead connection is a confident wrong answer
  // — this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // Reaching this means the COMMON row exists — `GamePageGate` and
  // `GamePageLoader` each checked — and the connections one does not: a torn
  // write, or a game deleted while somebody had the board open. `detail` goes
  // to the console, never to the page.
  if (!game) return <NoSuchGamePage detail={`rows=0 table=connections.games game=${ctx.gameId}`} />

  return (
    <PlayArea
      {...ctx}
      game={game}
      guesses={guesses}
      matchedCategories={matchedCategories}
      mistakeCount={mistakeCount}
      opponentFound={opponentFound}
      isEliminated={isEliminated}
      selections={selections}
      unionTiles={unionTiles}
      toggleTile={toggleTile}
      sendClear={sendClear}
      // The one place the setup blob is narrowed. `GamePageCtx` types it
      // `Record<string, unknown>` for every game; below, it is this game's.
      setup={ctx.setup as unknown as ConnectionsSetup}
    />
  )
}

type PlayAreaProps = Omit<GamePageCtx, 'setup'> & {
  // The loaded game row. Non-null by construction — the loader holds the gates.
  game: ConnectionsGame
  // This player's guess log (`connections.events`); RLS scopes it in compete.
  guesses: EventRow[]
  // The categories solved so far — a projection of `guesses`, in solve order.
  matchedCategories: MatchedCategory[]
  // My mistakes so far, and whether they used up the budget.
  mistakeCount: number
  isEliminated: boolean
  // Compete: each opponent's categories-found, from the public players rows.
  opponentFound: ReadonlyMap<string, number>
  // The shared selection state `useGame` keeps (Broadcast in coop, local in
  // compete): who has which tiles picked, their union, and the two senders.
  selections: SelectionMap
  unionTiles: string[]
  toggleTile: (tile: string) => void
  sendClear: () => void
  // This game's setup blob, narrowed once by the loader.
  setup: ConnectionsSetup
}

/**
 * connections' play surface — the coordinator. It holds no board and draws no
 * control of its own: `<BoardCol>` takes the grid and the commit row,
 * `<InfoCol>` the readouts and the action row, and this component decides what
 * each of them is handed.
 *
 * Both manifests mount it, and `mode` (`game.mode`, fixed at create-game time)
 * is what differs: whose picks the board shows (coop shares them over
 * Broadcast, compete keeps them local), whose progress a readout counts, and
 * which verdict `lib/terminal.ts` builds. What a guess is worth is decided in
 * `lib/answer.ts` and nowhere here.
 *
 * Above it, `<GamePage>` owns members, the timer, play_state, pause and chat,
 * and unmounts this surface on pause — every piece of state below goes with it,
 * the shared selections in `useGame` included.
 */
function PlayArea({
  game,
  guesses,
  matchedCategories,
  mistakeCount,
  opponentFound,
  isEliminated,
  selections,
  unionTiles,
  toggleTile,
  sendClear,
  session,
  gameId,
  players,
  playState,
  isTerminal,
  isConceded,
  isLocallyTerminal,
  isStillPlaying,
  status,
  isTurnBased,
  turnHolderId,
  isMyTurn,
  isWaitingForTurn,
  isBoardInteractive,
  setup,
  globalFeedbackSlot,
  clubHandle,
  goToGame,
  menu,
  brand,
  title,
}: PlayAreaProps) {
  const mode = game.mode
  const puzzleDate = game.puzzleDate

  // ─── Page hooks ────────────────────────────────────────
  // What this surface IS, before anything this game knows: where Tab may go,
  // where the info column sits on a phone, the notice a spent archive is
  // shown in, and the two things that fire at a moment rather than
  // describing a state — the win's confetti and the frame's flash when the
  // turn becomes mine.

  // The board is worked by clicks and typing, so Tab has nowhere to go here —
  // and an empty ring is what keeps it from walking out to the browser.
  useTabRing([])

  // Mobile (docs/mobile.md → The info-sheet recipe): below the breakpoint the board
  // fills the screen and the info column moves into an off-canvas <InfoSheet>,
  // reached by the header's InfoSwitchButton. Desktop is unchanged.
  const infoSheet = useInfoSheet()

  // The inline hint list, open or closed — the Hints binding toggles it, and
  // InfoCol draws the list under its action row.
  const [hintsOpen, setHintsOpen] = useState(false)

  // The notice New game shows when the archive is spent.
  const { acknowledge, acknowledgeModal } = useAcknowledge()

  // Did I match all four? MY four, not the game's verdict — compete ends the
  // race for everyone the moment one player finishes.
  const iMatchedThemAll = matchedCategories.length >= CATEGORY_COUNT

  // Confetti the moment the win is MINE — the coop team's fourth category, or
  // my own fourth in a race — and never on mount: opening an already-won game
  // stays quiet (`useCelebration` states its three rules). It is the ONLY
  // modal at terminal — the verdict itself rides the below-board pill
  // (docs/ui.md → Terminal results), and a racer who lost gets that and
  // nothing more.
  //
  // Both gates are correct on the first render, which is what `useCelebration`
  // requires: `playState` comes with the page, and the matched categories come
  // with the game — the loader holds this surface back until both are in hand.
  const celebration = useCelebration(
    playState === 'won' || (playState === 'won_compete' && iMatchedThemAll),
  )

  // The board frame flashes the moment the move becomes mine: the dim is what
  // says "not yours", its lifting is a removal, and you are by definition
  // looking elsewhere when it happens. Never fires in a free-for-all game.
  const turnFlash = useTurnStartFlash(isMyTurn)

  // ─── Derived ───────────────────────────────────────────
  // Who I am in this game and what I may still do. Where I stand — conceded,
  // out of the race, still playing, whose move it is — comes from the page,
  // already computed (docs/win-lose.md → Where a player stands); an elimination
  // on the fourth mistake is one way out, and the server marks it so.
  // `isStillPlaying` gates the tiles, the hint list and the help line, and the
  // Hint and Reveal bindings read it, so their buttons and menu rows agree.

  // The terminal reveal — derived state, because the Reveal binding below reads
  // it. The categories nobody got are shown only when this viewer asks: an
  // ended board is what the players left, their bands plus the tiles they never
  // cracked, and Reveal swaps the four bands in for the tiles (local and
  // reversible; common/reveal/doc.md). `impliedBy` is the exception: matching
  // all four IS the win, and a solver's board already carries every band.
  const {
    revealed: solutionShown,
    toggle: toggleSolution,
    impliedBySolve,
  } = useSolutionReveal({
    impliedBy: solvedByMe({
      isCompete: mode === 'compete',
      playState,
      mine: iMatchedThemAll,
    }),
  })

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (common/setup-form/doc.md → Setup rows).
  const summaryRows = useMemo(
    () => setupRows(setup, mode, players, puzzleDate),
    [setup, mode, players, puzzleDate],
  )

  // Board derivations the print model and the render both read — the same
  // values, rather than a second copy that could drift.
  const boardView = useMemo(() => {
    const matchedTiles = new Set<string>()
    for (const mc of matchedCategories) for (const t of mc.tiles) matchedTiles.add(t)
    const matchedRanks = new Set(matchedCategories.map((m) => m.rank))
    return {
      matchedTiles,
      remainingTiles: game.board.tileOrder.filter((t) => !matchedTiles.has(t)),
      // The categories nobody got — only while this viewer is asking for them.
      unmatched: solutionShown
        ? game.board.categories.filter((c) => !matchedRanks.has(c.rank))
        : [],
    }
  }, [game, solutionShown, matchedCategories])

  // ─── The local slot, and its three standing conditions ─
  // Each condition is an effect on a primitive edge that shows on true and
  // retracts in its cleanup — the slot draws whichever ranks highest. The
  // local slot is the one for messages about ME; a peer's go in the header's.

  // Drawn in the commit row's reserved height below the board (docs/ui.md →
  // Feedback pill): my own guess's answer, a not-ok, and the standing
  // conditions below. BoardCol shows the answers into it; a tile click
  // dismisses one, and so does any key.
  const localFeedbackSlot = useFeedbackSlot('local')
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // The terminal message, memoized on primitives so the verdict effect sees
  // one object per outcome; what it says per state is `lib/terminal.ts`'s.
  //
  // WHY it ended is the server's word (`status.reason`), never the browser
  // clock's: the RPC that ended the game wrote the reason, and the club-list
  // label reads the same column.
  const reason = status?.reason as string | undefined
  const selfWon = iMatchedThemAll
  const terminalMessage = useMemo(
    () =>
      isTerminal
        ? buildTerminalMessage({ mode, playState, reason, selfWon, selfEliminated: isEliminated })
        : null,
    [isTerminal, mode, playState, reason, selfWon, isEliminated],
  )
  useEffect(function showTerminalVerdict() {
    if (!terminalMessage) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(terminalMessage))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, terminalMessage])

  // Out of the race while the others play on: eliminated, or conceded. A
  // standing state with the fill; the verdict outranks it when the game ends.
  // It freezes this player's input and does not open the answer, which waits
  // for the game to be over for everyone.
  useEffect(function showOutOfRace() {
    if (!isLocallyTerminal || isTerminal) return
    const id = localFeedbackSlot.show(FeedbackMessage.outOfRace(isConceded))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isLocallyTerminal, isTerminal, isConceded])

  // A teammate holds the move (turn-order coop; never in a free-for-all). It
  // carries the whose-turn answer on MOBILE, where the InfoCol's
  // TurnStatusLine is off-canvas; without it a frozen board just ignored taps.
  // The holder is read as two primitives so the effect settles in one pass.
  const turnHolder = players.find((p) => p.user_id === turnHolderId)
  const holderName = turnHolder?.username
  const holderColor = turnHolder?.color
  useEffect(function showWaiting() {
    if (!isWaitingForTurn) return
    const id = localFeedbackSlot.show(
      FeedbackMessage.waiting(
        holderName === undefined ? undefined : { username: holderName, color: holderColor ?? '' },
      ),
    )
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isWaitingForTurn, holderName, holderColor])

  // ─── Narration — what a PEER did, in the header slot ───
  // About somebody else, which is what puts it in the global slot rather than
  // the local one (docs/ui.md → Where a message goes). Only coop has one.

  // A teammate's guess is narrated in the header, with the words and the color
  // `lib/answer.ts` gives its `_peer` twin. My own rows are excluded — my
  // answer is the local slot's. Compete never reaches here: RLS scopes the
  // guess log to the caller, so no foreign rows arrive, and we gate on coop.
  usePeerFeedback({
    enabled: mode === 'coop',
    items: guesses,
    keyOf: (g) => String(g.id),
    messageFor: (g) => {
      if (g.user_id === session.user.id) return null // mine → the local slot
      const member = memberById(players, g.user_id)
      // The row is somebody else's — the line above returned for my own — so
      // its answer is the `_peer` one.
      const { outcome, text } = peerAnswerMessage(g)
      return FeedbackMessage.peer(member, outcome, text)
    },
    globalFeedbackSlot,
  })

  // ─── The turn-history viewer ───────────────────────────
  // Click an event-log #N to replay that turn's board (the bands matched before
  // it + its four guessed tiles lit in their outcome color). Keyed by the row's
  // own id, resolved against the rows the board replays (`lib/history.ts`).
  // Exit is intrinsic to the hook: a click anywhere, the banner ✕, or any key —
  // the viewer binds an any-key action that consumes the press.
  const { historyId, showHistory, exitHistory } = useHistoryViewer<number>()

  // ─── The commands, bound ───────────────────────────────
  // Every command this game offers, in one order that three readers keep: this
  // block, the info column's prop list, and the menu's rows. A binding is what
  // the button, the menu row and the key all read, so none of them can drift
  // from another — and `pending` grays every surface of one for the length of
  // its run, which is why no handler here carries an in-flight flag of its own.
  // None of them is a `useCallback`: `useBoundAction` reads its live half
  // through a ref it refreshes every render, and the bound value's identity
  // turns on `pending` alone.

  // The shared trio — End / Concede / Restart. connections' own bit is which
  // `db` they call: a restart needs nothing else from this game, since the page
  // unmounts the whole play surface when the run changes and the shared
  // selections in `useGame` go with it, on every client.
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
      db,
      gameId,
      isTerminal,
      mode,
      isLocallyTerminal,
      localFeedbackSlot,
    })

  // Hints — the inline per-player reveal list, unfolded under the action row.
  // A toggle, so its words move with it; the list itself is InfoCol's. Gone,
  // row and button, once you can no longer submit.
  const actHint = useBoundAction('act-hint', {
    describe: () =>
      isStillPlaying ? { state: 'active', label: hintsOpen ? 'Hide hints' : 'Hints' } : 'hidden',
    run: () => setHintsOpen((o) => !o),
  })

  // Reveal the categories nobody got — a LOCAL display toggle: it swaps what the
  // board draws, writes nothing, and affects no peer. Both faces come from
  // `describeReveal`, which is where the rule for every game's reveal lives.
  const actReveal = useBoundAction('act-reveal', {
    describe: (asker) => {
      // The one narrowing this game adds: no BUTTON while you can still play,
      // so a player who dropped out cannot spoil a race still running. The
      // menu row keeps it all game, grayed, because it NAMES the glyph
      // (docs/ui.md → the menu is the legend).
      if (isStillPlaying && asker === 'button') return 'hidden'
      return describeReveal({ noun: 'solution', revealed: solutionShown, impliedBySolve, isTerminal })
    },
    run: toggleSolution,
  })

  // New game — the NEXT unplayed puzzle. The boards are a dated archive, so a
  // new game moves on to a date nobody seated has played; the server decides
  // which (`connections.next_puzzle_for_club`, reached by omitting
  // `puzzle_id`), the same answer the setup dialog previews. Same setup and
  // roster, same mode, same club.
  async function createNewGame() {
    // Ask what we'd get first, so a spent archive can be a NOTICE rather than
    // a failed create. The answer is advisory — `create_game` derives it again,
    // so a peer taking that puzzle in the gap costs nothing.
    const preview = await runRpc<PuzzleAnswer>(
      db.rpc('next_puzzle_for_club', { seen_by: players.map((p) => p.user_id) }),
    )
    if (preview.type === 'not-ok' && preview.dbcode === 'PN302') {
      // The archive is spent. The server's sentence points at the setup form's
      // date field, which this path has no form for; this surface says the two
      // ways forward instead (docs/envelopes.md → Who writes the words).
      await acknowledge({
        title: 'No more puzzles',
        message:
          'Everyone playing has already done every puzzle we have. Import more with '
          + '`gmake g-connections-puzzles`, or pick a date in the setup dialog to replay one.',
        okLabel: 'Got it',
      })
      return
    } else if (preview.type === 'not-ok') {
      // Shown even for a fault whose modal has already fired: a modal escalates
      // rather than replaces, so the board must not go silent when it is
      // dismissed. See docs/envelopes.md.
      localFeedbackSlot.show(FeedbackMessage.notOk(preview))
      return
    } else if (preview.type === 'ok' && preview.data.result === 'found') {
      // A puzzle is waiting, so the create below runs; its id is not carried
      // forward, since `create_game` derives it again.
    } else {
      reportUnhandled('next_puzzle_for_club', preview)
      return
    }

    // `puzzle_id` absent is how `create_game` is told to choose; carrying this
    // game's forward would restart the puzzle just finished.
    const carried = { ...setup }
    delete carried.puzzle_id
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        setup: carried,
        player_user_ids: players.map((p) => p.user_id),
        mode,
      }),
    )
    if (res.type === 'not-ok') {
      // As above: the words go in the slot, whichever severity they came with.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToGame(`connections_${mode}`, res.data.id)
      return
    } else {
      reportUnhandled('create_game', res)
      return
    }
  }

  // New game — its `+`, its menu row and its terminal button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this
  // game, which stays resumable) and goes straight through at terminal; the
  // shared run's single flight is what stops a second press taking two puzzles
  // out of the archive.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    // Reachable all game from the menu and `+` — NEW_GAME_CONFIRM is written
    // for that ("will be shelved, not lost", "Keep playing"). A BUTTON only at
    // the end, where "the next puzzle" is what you came to the row for.
    describe: (asker) => (asker === 'button' && !isTerminal ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time (common/pdf/doc.md):
  // the bands, the remaining tiles and the log are what the VIEWER may see, so
  // RLS carries onto paper — and the menu needn't rebuild as the board moves.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printConnectionsPdf(
        buildConnectionsPrintModel({
          brand,
          gameTitle: title,
          date: new Date().toLocaleDateString(),
          categories: game.board.categories,
          matched: matchedCategories,
          unmatched: boardView.unmatched,
          remainingTiles: boardView.remainingTiles,
          guesses,
          players,
          selfId: session.user.id,
          mode,
          isTerminal,
          mistakes: mistakeCount,
          maxMistakes: MISTAKE_BUDGET,
          setup: summaryRows,
        }),
      )
    },
  })

  // ─── The menu ──────────────────────────────────────────
  // The FULL connections menu. `buildGameMenu` supplies the framing (Help + chat
  // above, Back to club below); the middle is this game's own rows, each one a
  // binding it already made — so a row's words, glyph, key and availability come
  // from the action rather than being typed here a second time. The effect
  // re-runs only when the SHAPE changes, which is why every dep is stable.
  //
  // The rows read as the info column's action row does, divider for divider
  // (docs/playarea.md); Print is the one row with no twin in the row, and sits
  // after them. The icon-only Hints button is NAMED by its row.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that isn't
        // its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          // The menu twin of the info column's Hints button.
          { items: [actHint] },
          // The same three the terminal action row offers, reachable mid-game
          // too — Reveal grayed until the game is over.
          { items: [actReveal, actRestart, actNewGame] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actHint, actReveal, actRestart, actNewGame, actPrintBoard])

  // ─── Render ────────────────────────────────────────────
  // Everything below is derived fresh each render and read only by the JSX —
  // nothing here is a hook, which is why it may sit after the menu effect.

  // Who has bowed out of the race — the opponent strip's "out" cell. From the
  // common roster, like `isConceded`.
  const concededIds = new Set(
    players.filter((p) => p.conceded).map((p) => p.user_id),
  )

  const { remainingTiles } = boardView

  // When a past turn is open, `historySnap` is that turn's board (else null =
  // live). WHOSE board it replays is the row's own author's: mid-game compete
  // that is always me (RLS shows me nothing else), but at TERMINAL every
  // player's rows arrive, and a `#N` on one of theirs replays THEIR grid. Coop
  // is one shared board, so the filter is a no-op there.
  const historyRow = historyId !== null ? guesses.find((g) => g.id === historyId) : undefined
  const historyRows =
    mode === 'compete' && historyRow
      ? guesses.filter((g) => g.user_id === historyRow.user_id)
      : guesses
  const historySnap =
    historyId !== null ? historySnapshot(historyRows, game.board, historyId) : null
  // Named only when the board on screen is not the viewer's own — which only
  // compete can be. Coop is one shared grid.
  const historyActor =
    mode === 'compete' && historyRow && historyRow.user_id !== session.user.id
      ? memberById(players, historyRow.user_id)
      : undefined

  // tile → user_id. In coop this carries every peer's picks; in compete only
  // the caller's, since the broadcast is local there.
  const ownerByTile = new Map<string, string>()
  for (const [userId, list] of selections) {
    for (const t of list) ownerByTile.set(t, userId)
  }

  const colorByUserId = colorByUserIdMap(players)

  const found = matchedCategories.length

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        // ── Board to render (live OR the historical snapshot) ──
        game={game}
        matchedCategories={matchedCategories}
        remainingTiles={remainingTiles}
        unmatched={boardView.unmatched}
        solutionShown={solutionShown}
        historySnap={historySnap}
        historyActor={historyActor}
        isStillPlaying={isStillPlaying}
        isBoardInteractive={isBoardInteractive}
        isMyTurn={isMyTurn}
        isWaitingForTurn={isWaitingForTurn}
        myTurnJustStarted={turnFlash}
        // The frame says "this board is not a live position", which is true in
        // two situations, not one: the game is over for everybody (the frame
        // wears the verdict's outcome), or this player is out of a compete race while the
        // others play on. The second has no verdict yet, so it takes the neutral
        // gray — their board is inert, which is all the frame claims.
        terminalOutcome={terminalMessage ? terminalMessage.outcome : isLocallyTerminal ? 'neutral' : null}
        onExitHistory={exitHistory}
        // ── Tile selection (state in useGame; BoardCol renders and commits it) ──
        ownerByTile={ownerByTile}
        toggleTile={toggleTile}
        sendClear={sendClear}
        unionTiles={unionTiles}
        selfId={session.user.id}
        colorByUserId={colorByUserId}
        // Identity is only information on a genuinely shared board: coop, with
        // somebody else here. Solo, every pick is mine; in compete the picks
        // never leave this client.
        sharedBoard={mode === 'coop' && players.length > 1}
        // ── Own-guess feedback (the slot is PlayArea's) ──
        localFeedbackSlot={localFeedbackSlot}
        // ── Guess dispatch ──
        gameId={gameId}
        guesses={guesses}
        // ── Below-board readout ──
        mistakeCount={mistakeCount}
        mistakeBudget={MISTAKE_BUDGET}
      />

      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
      <InfoCol
        // ── Mode + phase ──
        isCompete={mode === 'compete'}
        terminalMessage={terminalMessage}
        isStillPlaying={isStillPlaying}
        isConceded={isConceded}
        isTurnBased={isTurnBased}
        turnHolderId={turnHolderId}
        // ── State readout ──
        found={found}
        categoryCount={CATEGORY_COUNT}
        mistakeCount={mistakeCount}
        mistakeBudget={MISTAKE_BUDGET}
        // ── Players (OpponentStrip, compete) ──
        players={players}
        selfId={session.user.id}
        metricByUser={opponentFound}
        concededIds={concededIds}
        // ── Action row — the same bindings, in the order the menu lists them ──
        actHint={actHint}
        actReveal={actReveal}
        actRestart={actRestart}
        actNewGame={actNewGame}
        actConcede={actConcede}
        actEndGame={actEndGame}
        actBackToClub={menu.actBackToClub}
        // ── The hint list ──
        categories={game.board.categories}
        hintsOpen={hintsOpen}
        // ── Setup disclosure ──
        setupRows={summaryRows}
        // ── Turn-history log ──
        guesses={guesses}
        historyId={historyId}
        onShowHistory={showHistory}
      />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board slot + the info-column outcome line, and MY
          win gets the celebration instead — once, when it happens. */}
      {celebration.show && (
        <CelebrationBlockingModal
          title="You win! 🎉"
          body={
            mode === 'compete'
              ? 'You found all four first.'
              : 'All four categories found.'
          }
          onClose={celebration.close}
        />
      )}
      {acknowledgeModal}
    </div>
  )
}
