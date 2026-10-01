// cs-blessed-connections

import { runRpc } from '@/common/supabase/dbResult'
import { useEffect, useMemo, useState } from 'react'
import { cls } from '@/common/utils/cls'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import { Loading } from '@/common/loading/Loading'
import { NoSuchGamePage } from '@/common/game-page/NoSuchGamePage'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { PlayAreaLoaderProps } from '@/common/game-page/playAreaLoaderProps'
import { colorByUserIdMap } from '@/common/members/memberColor'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { useShowWaitingMessage } from '@/common/feedback/useShowWaitingMessage'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { useAcknowledge } from '@/common/floating-panels/useAcknowledge'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { buildConnectionsPrintModel } from '../pdf/model'
import { printConnectionsPdf } from '../pdf/printConnectionsPdf'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBindAction } from '@/common/actions/useBindAction'
import { describeReveal } from '@/common/reveal/describeReveal'
import { useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { db } from '../db'
import { peerAnswerMessage } from '../lib/answer'
import { useGame, type GameData } from '../hooks/useGame'
import { useGetGameEndingMessage } from '../hooks/useGetGameEndingMessage'
import { useGetPlayerEndingMessage } from '../hooks/useGetPlayerEndingMessage'
import type { PuzzleAnswer } from '../lib/setup'
import { historySnapshot } from '../lib/history'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // connections-specific color tokens (lazy with this chunk)
import { useTabRing } from '@/common/keyboard/useTabRing'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * The three gates in front of connections' play surface: the read is out, the
 * read failed, or there is no such game. Everything below starts with the game
 * data in hand, which is why the surface never writes `gd?.`.
 *
 * The game's menu rows and its `+` arrive WITH the game, because the surface
 * that binds them mounts with it — a row for a game not yet read could only
 * gray itself or lie.
 */
export function PlayAreaLoader(ctx: PlayAreaLoaderProps) {
  const { gd, loading, failure } = useGame(ctx)

  if (loading) return <Loading />
  // A failed read is NOT a missing game. Both leave `gd` null, and saying
  // "there's no game here" about a dead connection is a confident wrong answer
  // — this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // Reaching this means the COMMON row exists — `GamePageGate` and
  // `GamePageLoader` each checked — and the connections one does not: a torn
  // write, or a game deleted while somebody had the board open. `detail` goes
  // to the console, never to the page.
  if (!gd) return <NoSuchGamePage detail={`rows=0 table=connections.games game=${ctx.cg.id}`} />

  return (
    <PlayArea
      gd={gd}
      authSession={ctx.authSession}
      globalFeedbackSlot={ctx.globalFeedbackSlot}
      clubHandle={ctx.cg.club_handle}
      goToFollowUpGame={ctx.goToFollowUpGame}
      menu={ctx.menu}
      brand={ctx.manifest.name}
    />
  )
}

type PlayAreaProps = Pick<
  PlayAreaLoaderProps,
  'authSession' | 'globalFeedbackSlot' | 'goToFollowUpGame' | 'menu'
> & {
  // The game data. Non-null by construction — the loader holds the gates.
  gd: GameData
  clubHandle: string
  brand: string
}

/**
 * connections' play surface — the coordinator. It holds no board and draws no
 * control of its own: `<BoardCol>` takes the grid and the commit row,
 * `<InfoCol>` the readouts and the action row, and this component decides what
 * each of them is handed.
 *
 * Both manifests mount it, and the mode (`gd.mode`, fixed at create-game time)
 * is what differs: whose picks the board shows (coop shares them over
 * Broadcast, compete keeps them local), whose progress a readout counts, and
 * which verdict `lib/gameEndingMessage.ts` builds. What a guess is worth is
 * decided in `lib/answer.ts` and nowhere here.
 *
 * Above it, `<GamePage>` owns members, the timer, the ending, pause and chat,
 * and unmounts this surface on pause — every piece of state below goes with it,
 * the shared picks in `useGame` included.
 */
function PlayArea({
  gd,
  authSession,
  globalFeedbackSlot,
  clubHandle,
  goToFollowUpGame,
  menu,
  brand,
}: PlayAreaProps) {
  const myId = authSession.user.id

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

  // The inline hint list, open or closed — the Hints action toggles it, and
  // InfoCol draws the list under its action row.
  const [hintsOpen, setHintsOpen] = useState(false)

  // The notice New game shows when the archive is spent.
  const { acknowledge, acknowledgeModal } = useAcknowledge()

  // Confetti the moment the win is MINE — the coop team's fourth category, or
  // my own fourth in a race — and never on mount: opening an already-won game
  // stays quiet (`useCelebration` states its three rules). It is the ONLY
  // modal at the end — the verdict itself rides the below-board pill
  // (docs/ui.md → Terminal results), and a racer who lost gets that and
  // nothing more.
  // SPECTATING: a club member watching has no outcome of their own, so gets
  // none.
  const celebration = useCelebration(gd.me?.outcome === 'won')

  // The board frame flashes the moment the move becomes mine: the dim is what
  // says "not yours", its lifting is a removal, and you are by definition
  // looking elsewhere when it happens. Never fires in a free-for-all game.
  const turnFlash = useTurnStartFlash(gd.standing.isMyTurn)

  // ─── Derived ───────────────────────────────────────────

  // The ended board's reveal — derived state, because the Reveal action below
  // reads it. The categories nobody got are shown only when this viewer asks:
  // an ended board is what the players left, their bands plus the tiles they
  // never cracked, and Reveal swaps the four bands in for the tiles (local and
  // reversible; common/reveal/doc.md). `impliedBy` is the exception: matching
  // all four IS the win, and a solver's board already carries every band.
  const {
    revealed: solutionShown,
    toggle: toggleSolution,
    impliedBySolve,
  } = useSolutionReveal({ impliedBy: gd.standing.hasSolved })

  // Board derivations the print model and the render both read — the same
  // values, rather than a second copy that could drift.
  const boardView = useMemo(() => {
    const matchedTiles = new Set<string>()
    for (const mc of gd.matchedCategories) for (const t of mc.tiles) matchedTiles.add(t)
    const matchedRanks = new Set(gd.matchedCategories.map((m) => m.rank))
    return {
      matchedTiles,
      remainingTiles: gd.puzzle.board.tileOrder.filter((t) => !matchedTiles.has(t)),
      // The categories nobody got — only while this viewer is asking for them.
      unmatched: solutionShown
        ? gd.puzzle.board.categories.filter((c) => !matchedRanks.has(c.rank))
        : [],
    }
  }, [gd.puzzle.board, solutionShown, gd.matchedCategories])

  // ─── The local slot, and what stands in it ─────────────
  // The local slot is the one for messages about ME; a peer's go in the
  // header's.

  // Drawn in the commit row's reserved height below the board (docs/ui.md →
  // Feedback pill): my own guess's answer, a not-ok, and the standing
  // conditions below. BoardCol shows the answers into it; a tile click
  // dismisses one, and so does any key.
  const localFeedbackSlot = useFeedbackSlot('local')
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // The endings' messages, for the pill and the info column: the game's once
  // it has ended, mine while I am out of the race and the others play on.
  const gameEndingMessage = useGetGameEndingMessage(gd)
  const playerEndingMessage = useGetPlayerEndingMessage(gd)
  useShowEndingFeedback(localFeedbackSlot, {
    gameEndingMessage,
    playerEndingMessage,
  })

  // A teammate holds the move (turn-order coop; never in a free-for-all).
  useShowWaitingMessage({
    slot: localFeedbackSlot,
    isWaiting: gd.standing.isWaitingForTurn,
    holder: gd.turns.turnHolder,
  })

  // ─── Narration — what a PEER did, in the header slot ───
  // About somebody else, which is what puts it in the global slot rather than
  // the local one (docs/ui.md → Where a message goes). Only coop has one.

  // A teammate's guess is narrated in the header, with the words and the color
  // `lib/answer.ts` gives its `_peer` twin. My own rows are excluded — my
  // answer is the local slot's. Compete never reaches here: RLS scopes the
  // guess log to the caller, so no foreign rows arrive, and we gate on coop.
  useShowPeerFeedback({
    enabled: !gd.isCompete,
    items: gd.events,
    keyOf: (g) => String(g.id),
    messageFor: (g) => {
      if (g.user_id === myId) return null // mine → the local slot
      // The row is somebody else's — the line above returned for my own — so
      // its answer is the `_peer` one.
      const { outcome, text } = peerAnswerMessage(g)
      return FeedbackMessage.peer(gd.playersById[g.user_id], outcome, text)
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
  // block, the info column's prop list, and the menu's rows. An action is what
  // the button, the menu row and the key all read, so none of them can drift
  // from another — and `pending` grays every surface of one for the length of
  // its run, which is why no handler here carries an in-flight flag of its own.
  // None of them is a `useCallback`: `useBindAction` reads its options
  // through a ref it refreshes every render, and the action's identity
  // turns on `pending` alone.

  // The shared trio — Stop / Concede / Restart. connections' own bit is which
  // `db` they call: a restart needs nothing else from this game, since the page
  // unmounts the whole play surface when the run changes and the shared
  // picks in `useGame` go with it, on every client.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.gameId,
    isTerminal: gd.isGameEnded,
    mode: gd.mode,
    isLocallyTerminal: gd.standing.isLocallyTerminal,
    localFeedbackSlot,
  })

  // Hints — the inline per-player reveal list, unfolded under the action row.
  // A toggle, so its words move with it; the list itself is InfoCol's. Gone,
  // row and button, once you can no longer submit.
  const actHint = useBindAction('act-hint', {
    describe: () =>
      gd.standing.isStillPlaying
        ? { state: 'active', label: hintsOpen ? 'Hide hints' : 'Hints' }
        : 'hidden',
    run: () => setHintsOpen((o) => !o),
  })

  // Reveal the categories nobody got — a LOCAL display toggle: it swaps what the
  // board draws, writes nothing, and affects no peer. Both faces come from
  // `describeReveal`, which is where the rule for every game's reveal lives.
  const actReveal = useBindAction('act-reveal', {
    describe: (asker) => {
      // The one narrowing this game adds: no BUTTON while you can still play,
      // so a player who dropped out cannot spoil a race still running. The
      // menu row keeps it all game, grayed, because it NAMES the glyph
      // (docs/ui.md → the menu is the legend).
      if (gd.standing.isStillPlaying && asker === 'button') return 'hidden'
      return describeReveal({
        noun: 'solution',
        revealed: solutionShown,
        impliedBySolve,
        isTerminal: gd.isGameEnded,
      })
    },
    run: toggleSolution,
  })

  // New game — the NEXT unplayed puzzle. The boards are a dated archive, so a
  // new game moves on to a date nobody seated has played; the server decides
  // which (`connections.next_puzzle_for_club`, reached by omitting
  // `puzzle_id`), the same answer the setup dialog previews. Same setup and
  // roster, same mode, same club.
  async function createNewGame() {
    const playerUserIds = gd.players.map((p) => p.user_id)
    // Ask what we'd get first, so a spent archive can be a NOTICE rather than
    // a failed create. The answer is advisory — `create_game` derives it again,
    // so a peer taking that puzzle in the gap costs nothing.
    const preview = await runRpc<PuzzleAnswer>(
      db.rpc('next_puzzle_for_club', { p_seen_by: playerUserIds }),
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
    const carried = { ...gd.setup }
    delete carried.puzzle_id
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: carried,
        p_player_user_ids: playerUserIds,
        p_mode: gd.mode,
      }),
    )
    if (res.type === 'not-ok') {
      // As above: the words go in the slot, whichever severity they came with.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToFollowUpGame(res.data.id)
      return
    } else {
      reportUnhandled('create_game', res)
      return
    }
  }

  // New game — its `+`, its menu row and its ended-game button, from one action.
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this
  // game, which stays resumable) and goes straight through once the game has
  // ended; the shared run's single flight is what stops a second press taking
  // two puzzles out of the archive.
  const actNewGame = useBindAction('act-new-game', {
    terminal: gd.isGameEnded,
    // Reachable all game from the menu and `+` — NEW_GAME_CONFIRM is written
    // for that ("will be shelved, not lost", "Keep playing"). A BUTTON only at
    // the end, where "the next puzzle" is what you came to the row for.
    describe: (asker) => (asker === 'button' && !gd.isGameEnded ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print builds its model from the live state at CLICK time (common/pdf/doc.md):
  // the bands, the remaining tiles and the log are what the VIEWER may see, so
  // RLS carries onto paper — and the menu needn't rebuild as the board moves.
  const actPrintBoard = useBindAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printConnectionsPdf(
        buildConnectionsPrintModel({
          brand,
          gameTitle: gd.title,
          date: new Date().toLocaleDateString(),
          categories: gd.puzzle.board.categories,
          matched: gd.matchedCategories,
          unmatched: boardView.unmatched,
          remainingTiles: boardView.remainingTiles,
          guesses: gd.events,
          players: gd.players,
          selfId: myId,
          mode: gd.mode,
          isTerminal: gd.isGameEnded,
          mistakeCount: gd.readout.mistakeCount,
          mistakeBudget: gd.readout.maxMistakes,
          setupRows: gd.setupRows,
        }),
      )
    },
  })

  // ─── The menu ──────────────────────────────────────────
  // The FULL connections menu. `buildGameMenu` supplies the framing (Help + chat
  // above, Back to club below); the middle is this game's own rows, each one an
  // action it already made — so a row's words, glyph, key and availability come
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
        exits: [actConcede, actStopGame],
        extra: [
          // The menu twin of the info column's Hints button.
          { items: [actHint] },
          // The same three the ended game's action row offers, reachable
          // mid-game too — Reveal grayed until the game is over.
          { items: [actReveal, actRestart, actNewGame] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actStopGame, actHint, actReveal, actRestart, actNewGame, actPrintBoard])

  // ─── Render ────────────────────────────────────────────
  // Everything below is derived fresh each render and read only by the JSX —
  // nothing here is a hook, which is why it may sit after the menu effect.

  // The ending that applies to me: the game's once it has ended, else mine.
  const endingMessage = gameEndingMessage ?? playerEndingMessage

  const { remainingTiles } = boardView

  // When a past turn is open, `historySnap` is that turn's board (else null =
  // live). WHOSE board it replays is the row's own author's: mid-game compete
  // that is always me (RLS shows me nothing else), but at the END every
  // player's rows arrive, and a `#N` on one of theirs replays THEIR grid. Coop
  // is one shared board, so the filter is a no-op there.
  const historyRow = historyId !== null ? gd.events.find((g) => g.id === historyId) : undefined
  const historyRows =
    gd.isCompete && historyRow
      ? gd.events.filter((g) => g.user_id === historyRow.user_id)
      : gd.events
  const historySnap =
    historyId !== null ? historySnapshot(historyRows, gd.puzzle.board, historyId) : null
  // Named only when the board on screen is not the viewer's own — which only
  // compete can be. Coop is one shared grid.
  const historyActor =
    gd.isCompete && historyRow && historyRow.user_id !== myId
      ? gd.playersById[historyRow.user_id]
      : undefined

  const colorByUserId = colorByUserIdMap(gd.players)

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        // ── Board to render (live OR the historical snapshot) ──
        board={gd.puzzle.board}
        matchedCategories={gd.matchedCategories}
        remainingTiles={remainingTiles}
        unmatched={boardView.unmatched}
        solutionShown={solutionShown}
        historySnap={historySnap}
        historyActor={historyActor}
        isStillPlaying={gd.standing.isStillPlaying}
        isBoardInteractive={gd.standing.isBoardInteractive}
        isMyTurn={gd.standing.isMyTurn}
        isWaitingForTurn={gd.standing.isWaitingForTurn}
        myTurnJustStarted={turnFlash}
        // The frame says "this board is not a live position", in the outcome of
        // the ending that applies to me: the game's once it has ended, or mine
        // while I am out of a race the others still run.
        terminalOutcome={endingMessage?.outcome ?? null}
        onExitHistory={exitHistory}
        // ── Tile picks (state in useGame; BoardCol renders and commits them) ──
        ownerByTile={gd.picks.ownerByTile}
        toggleTile={gd.picks.toggleTile}
        sendClear={gd.picks.sendClear}
        unionTiles={gd.picks.union}
        selfId={myId}
        colorByUserId={colorByUserId}
        // Identity is only information on a genuinely shared board: coop, with
        // somebody else here. Solo, every pick is mine; in compete the picks
        // never leave this client.
        sharedBoard={!gd.isCompete && gd.players.length > 1}
        // ── Own-guess feedback (the slot is PlayArea's) ──
        localFeedbackSlot={localFeedbackSlot}
        // ── Guess dispatch ──
        gameId={gd.gameId}
        guesses={gd.boardEvents}
        // ── Below-board readout ──
        mistakeCount={gd.readout.mistakeCount}
        mistakeBudget={gd.readout.maxMistakes}
      />

      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
      <InfoCol
        // ── Mode + phase ──
        isCompete={gd.isCompete}
        isTerminal={gd.isGameEnded}
        endingMessage={endingMessage}
        isStillPlaying={gd.standing.isStillPlaying}
        isTurnBased={gd.turns.isTurnBased}
        turnHolderId={gd.turns.turnHolderId}
        // ── State readout ──
        found={gd.readout.foundCount}
        categoryCount={gd.readout.requiredCategoriesCount}
        mistakeCount={gd.readout.mistakeCount}
        mistakeBudget={gd.readout.maxMistakes}
        // ── Players (OpponentStrip, compete) ──
        players={gd.players}
        selfId={myId}
        // ── Action row — the same actions, in the order the menu lists them ──
        actHint={actHint}
        actReveal={actReveal}
        actRestart={actRestart}
        actNewGame={actNewGame}
        actConcede={actConcede}
        actStopGame={actStopGame}
        actBackToClub={menu.actBackToClub}
        // ── The hint list ──
        categories={gd.puzzle.board.categories}
        hintsOpen={hintsOpen}
        // ── Setup disclosure ──
        setupRows={gd.setupRows}
        // ── Turn-history log ──
        guesses={gd.events}
        historyId={historyId}
        onShowHistory={showHistory}
      />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board slot + the info-column outcome line, and MY
          win gets the celebration instead — once, when it happens. */}
      {celebration.isOpen && (
        <CelebrationBlockingModal
          title="You win! 🎉"
          body={
            gd.isCompete
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
