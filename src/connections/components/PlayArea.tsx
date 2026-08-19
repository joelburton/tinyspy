import { faultMessage } from '../../common/lib/game/serverError'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconHint, IconNewGame, IconPrint, IconRestart } from '../../common/components/icons'
import { cls } from '../../common/lib/util/cls'
import type { GamePageCtx } from '../../common/lib/games'
import { colorByUserIdMap } from '../../common/lib/color/memberColor'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useDismissLocalFeedbackOnKey } from '../../common/hooks/feedback/useDismissLocalFeedbackOnKey'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { useTurnStartFlash } from '../../common/hooks/game/useTurnStartFlash'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, NEW_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { memberById } from '../../common/lib/game/peers'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { buildConnectionsPrintModel } from '../pdf/model'
import { printConnectionsPdf } from '../pdf/printConnectionsPdf'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { setupRows } from '../lib/setupSummary'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { solvedByMe, useSolutionReveal } from '../../common/hooks/game/useSolutionReveal'
import { db } from '../db'
import type { CategoryRank } from '../lib/board'
import { useGame } from '../hooks/useGame'
import type { ConnectionsSetup } from '../lib/setup'
import { turnSnapshot } from '../lib/history'
import { waitingTurnPill } from '../../common/components/game/turnCopy'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // connections-specific color tokens (lazy with this chunk)
import { useSwallowTab } from '../../common/hooks/input/useSwallowTab'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'

/** Four categories to find, four mistakes allowed — the NYT Connections
 *  constants, shown in the setup disclosure + the "N/4 found" state line. */
const CATEGORY_COUNT = 4
const MISTAKE_BUDGET = 4

/**
 * connections's play surface, shared between the coop and compete
 * manifests. The mode is read from `game.mode` (set at create-
 * game time and never changes); rendering branches on it for:
 *
 *   - **Selection**: coop shares via Broadcast (the Board
 *     shows per-tile peer attribution); compete keeps selections
 *     local (every tile reads as "mine" because the broadcast
 *     send is suppressed in useGame).
 *   - **Mistakes**: coop shows a single shared dot row; compete
 *     shows an OpponentStrip with everyone's per-player
 *     counts.
 *   - **Eliminated state** (compete only, non-terminal): caller's
 *     mistake_count >= 4 → render the unmatched categories
 *     revealed + a "you're out" indicator; let the game continue
 *     for the survivors (opponents' counts keep ticking via the
 *     realtime players-row subscription).
 *   - **Terminal copy**: coop says "you win/lose" (team verdict);
 *     compete distinguishes "you won the race" from "beaten to
 *     the punch" using the caller's matched-count.
 *   - **Feedback split** (docs/deferred.md → Feedback channels;
 *     mirrors psychicnum): my OWN guess result flashes green/red
 *     in the commit slot below the board (local — near my eyes,
 *     about what I just did); a teammate's guess is narrated in
 *     the GamePage header pill (group). Compete reaches neither
 *     header branch — the guesses log is RLS-scoped to the caller,
 *     so there are no peer events to announce.
 *
 * Submission flow:
 *   1. FE evaluates the guess locally against board.categories
 *      (FE-knows-the-answer; see docs/games/connections.md).
 *   2. Dup detection (sameTileSet on the existing guess log) —
 *      in compete the log is RLS-filtered to caller, so dup-
 *      detection only catches the caller's own repeats. Good.
 *   3. Fire submit_guess RPC with (tiles, result, rank).
 *   4. Realtime postgres-changes propagate to every player; the
 *      hook refetches automatically (players + guesses + games).
 *   5. On a CORRECT guess only, broadcast a `clear` (no-op in
 *      compete because broadcast is local-only there; coop drops
 *      everyone's selection). A wrong / one-away guess keeps the
 *      selection so the player can tweak it and resubmit.
 *
 * **Pause behavior**: PauseBoundary in GamePage unmounts this
 * component on pause and remounts on resume. The shared selection
 * state lives in `useGame` (component-local + broadcast); the
 * unmount drops it automatically.
 */
export function PlayArea({
  session,
  gameId,
  players,
  playState,
  isTerminal,
  timer,
  isMyTurn,
  currentTurnUserId,
  setup,
  globalFeedback,
  goToClub,
  clubHandle,
  goToGame,
  menu,
  brand,
  title,
}: GamePageCtx) {
  // Tab does nothing while the board has the keyboard — this play surface is
  // not a form, so native Tab would walk out to the header buttons and on into
  // the browser's URL bar, stranding the player. (The capture-entry games get
  // this from useCaptureKeys; see useSwallowTab.)
  useSwallowTab()
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
  } = useGame(session, gameId)
  const connectionsSetup = setup as unknown as ConnectionsSetup

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (docs/pdf.md → Setup rows).
  const summaryRows = useMemo(
    () => setupRows(connectionsSetup, game?.mode ?? 'coop', players, game?.puzzleDate ?? null),
    [connectionsSetup, game, players],
  )
  // Inline hint list open/closed — InfoCol's Hints button TOGGLES it, and the list
  // renders in InfoCol right below that button (it's one more info-column readout,
  // not a window over the board). (The guess dispatch, the local tile shuffle, and
  // the wrong-guess shake all live in BoardCol.)
  const [hintsOpen, setHintsOpen] = useState(false)
  // Which hint categories are revealed. Owned HERE rather than in <HintList> so
  // the restart handler can clear it — see that component's `revealed` prop.
  const [revealedHints, setRevealedHints] = useState<ReadonlySet<CategoryRank>>(() => new Set())
  const revealHint = useCallback((rank: CategoryRank) => {
    setRevealedHints((prev) => (prev.has(rank) ? prev : new Set(prev).add(rank)))
  }, [])

  // Mobile: below --mobile the board fills the screen and the info column slides in
  // as an off-canvas sheet from a "Game info" menu item (the shared recipe —
  // docs/mobile.md). Plain (not `wide`): the info column is a narrow 22rem readout
  // + turn log, no multi-column word list. Desktop is untouched.
  const infoSheet = useInfoSheet()

  // The shared end-game confirm modal (replaces window.confirm — a true
  // modal: backdrop-blocked board, dialog-owned keyboard).
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

  // ─── Coop-win celebration ──────────────────────────────
  // Confetti at the MOMENT the team clears the fourth category (the winning
  // guess flips playState to 'won' on every connected client via realtime, so
  // the whole group celebrates together); opening an already-solved game stays
  // quiet (useCelebration never pops on mount). It's the ONLY modal at terminal
  // — the verdict itself rides the below-board pill (docs/ui.md → Terminal
  // results).
  //
  // Gated on `playState` ALONE, which is available from the very first render —
  // the waffle loading-race lesson. That's also why COMPETE doesn't celebrate:
  // "did I win the race?" needs `selfMatched` from useGame, which is 0 until the
  // fetch lands, so a won-race game opened fresh would go false→true after load
  // and pop confetti at someone merely reviewing it. Same call wordle + waffle
  // made (they celebrate coop only).
  const celebration = useCelebration(playState === 'won')

  // ─── Your turn just started (coop turn-order) ──────────
  // The board looks identical the instant it becomes yours, and by definition
  // you were looking somewhere else — you had been waiting. Never fires in a
  // free-for-all game, where `isMyTurn` is permanently true.
  const turnFlash = useTurnStartFlash(isMyTurn)

  // ─── Commit-slot flash (own-action feedback, local) ─────
  // A transient message shown *in place of the commit buttons* for the
  // player's own guess: "Correct!" (green) / "One away!" (amber) /
  // "Incorrect" (red), or a validation/RPC error (red). It lives in the
  // commit row's already-reserved height (never a new line that would
  // reflow the board — docs/ui.md → Layout stability), and `clearLocalFeedback`
  // dismisses it the moment the player clicks a tile to start a fresh selection
  // (handleToggle below) — the tile-click analog of psychicnum's "typing
  // dismisses the flash". Local channel: near my eyes, about what I just did
  // (docs/deferred.md → Feedback channels). Shared machinery; the host owns
  // where it renders + when it clears early.
  const {
    localFeedback,
    showLocalFeedback,
    clearLocalFeedback,
  } = useLocalFeedback({ locked: isTerminal })
  // Any key is the player's next move → dismiss the own-move pill, even though
  // connections has no keyboard entry (guesses are tile clicks). No-op at
  // terminal (locked).
  useDismissLocalFeedbackOnKey(clearLocalFeedback)

  // ─── Turn-history viewer ───────────────────────────────
  // Click a turn-log #N to replay that turn (the bands matched before it + this
  // turn's 4 guessed tiles ringed in their outcome color, on the board as it was).
  // Keyed by log position. Exit is intrinsic to the hook (a click anywhere / the
  // banner ✕); a keystroke also exits (connections has no keyboard input to clash).
  const { viewing, viewingId, select: selectTurn, exitViewing, exitOnKey } =
    useHistoryViewer<number>()
  useGlobalKeyHandler(exitOnKey)

  // ─── Coop peer events (group feedback) ─────────────────
  // A teammate's guess is narrated in the GamePage header: correct →
  // "Bea found ANIMALS!" (green), one-away → "Bea was one away" (amber),
  // wrong → "Bea guessed wrong" (red). My own guesses are excluded — they
  // get the local commit flash above; my guess also already shows in the
  // turn log. Compete never reaches here: the guesses log is RLS-scoped to
  // the caller server-side, so no foreign rows arrive, and we gate on coop
  // besides. globalFeedback.show is a prop callback, so no local set-state here.
  useGlobalFeedback({
    enabled: game?.mode === 'coop',
    items: guesses,
    keyOf: (g) => g.id,
    messageFor: (g) => {
      if (g.user_id === session.user.id) return null // mine → local commit flash
      const member = memberById(players, g.user_id)
      if (g.result === 'correct') {
        // NOT the category's name: it's puzzle data of unbounded length (a NYT
        // category can run 25+ chars), and the header pill fits ~26 on a phone
        // before it ellipsises. The solved band appears on the reader's own
        // board at the same moment, so naming it here says nothing new.
        return {
          tone: 'won',
          text: (
            <>
              <ActorDot actor={member} fallback="Someone" /> found category
            </>
          ),
          mode: { kind: 'timed' },
        }
      }
      return {
        tone: g.result === 'oneAway' ? 'near' : 'lost',
        text: (
          <>
            <ActorDot actor={member} fallback="Someone" />{' '}
            {g.result === 'oneAway' ? 'was one away' : 'guessed wrong'}
          </>
        ),
        mode: { kind: 'timed' },
      }
    },
    globalFeedback,
  })

  // Concede lives on the common roster (ctx `players` = GamePlayer[]), not
  // connections.players; `myConceded` also folds into the locally-terminal
  // branch below (same treatment as a 4-mistake elimination).
  const myConceded =
    players.find((p) => p.user_id === session.user.id)?.conceded ?? false

  // ─── End / Concede / Replay — the shared three ─────────
  // End is available in both modes and terminates with everyone {won:false} and
  // a NEUTRAL verdict: friends agreeing to stop is a valid outcome, not a "you
  // lose" punishment. It's fired by the End button in the info column (like
  // psychicnum), not a GamePage-menu item. Concede is compete's drop-out (a real
  // loss; the others keep racing). Replay restarts THIS puzzle — the same
  // sixteen tiles in the same shuffle, everyone's guesses + mistakes wiped —
  // and `onRestarted` leaves the turn-history view + clears the pill.
  // ─── The categories show only when I ask for them ─────
  // Never automatically. connections used to be one of the two games registered
  // hides_solution = false, so a loss (or, in compete, being eliminated) put the
  // answer on screen unasked — and, because the board swaps loose tiles for
  // full-width bands, it did that by DELETING the tiles the players were still
  // looking at. Now the ended board is what they actually left: their solved
  // bands plus the tiles they never cracked, frozen. Reveal swaps in the four
  // bands; Hide swaps back. Local, so one impatient player can't end everyone's
  // thinking.
  //
  // `impliedBy` is the exception: matching all four IS the win, and each match
  // resolves into a full-width band — so a solver's board already carries every
  // category and there is nothing left for the reveal to draw. MY four, not the
  // game's verdict: connections compete ends the race for everyone the moment
  // one player finishes, and the rest never got there.
  const iMatchedThemAll = matchedCategories.length >= CATEGORY_COUNT
  const {
    revealed: solutionShown,
    toggle: toggleSolution,
    reset: resetSolution,
    impliedBySolve,
  } = useSolutionReveal({
    impliedBy: solvedByMe({
      isCompete: game?.mode === 'compete',
      playState,
      mine: iMatchedThemAll,
    }),
  })

  const { endGame: handleEndGame, concede: handleConcede, restart: handleRestart } =
    useStandardGameActions({
      db,
      gameId,
      isTerminal,
      myConceded,
      confirm: confirmAction,
      showError: showLocalFeedback,
      onRestarted: () => {
        exitViewing()
        clearLocalFeedback()
        // The same sixteen tiles again, so whatever was picked for the guess
        // that is now gone must go with it — and this one BROADCASTS, so every
        // teammate's board drops it too rather than starting the replay with a
        // half-built move on it. (The verdict marks clear themselves off the
        // shrinking guess log, which reaches peers the same way.)
        sendClear()
        // The same sixteen tiles again, so a hint spent on the first attempt
        // must not carry into the second. (Fires only on the client that
        // clicked Restart — the same limitation every onRestarted cleanup in
        // the roster has; a peer's restart leaves their own list alone.)
        setRevealedHints(new Set())
        // The same four categories to find again — so forget my choice about
        // them. `reset`, not `hide`: hiding would record an explicit "no" that
        // outranks the solve-implied default, so matching all four on the
        // replay wouldn't leave the bands up.
        resetSolution()
      },
    })

  // ─── New game — the NEXT unplayed puzzle ───────────────
  // connections's boards are a dated ARCHIVE rather than something generated
  // per game, so "New game" can't just re-roll — it has to move on to a
  // puzzle nobody here has done. That rule now lives in ONE place, the server
  // (`connections.next_puzzle_for_club`, reached by simply omitting
  // `puzzleId`), which is the same thing the setup dialog previews. It used
  // to be two FE reads plus a pure `nextUnplayedPuzzle` helper, and the two
  // paths could disagree: that rule was per-club and per-MODE and walked
  // forward from the current puzzle, so a coop game didn't use up the compete
  // side and another club's play didn't count at all. The server's is
  // per-PLAYER and spans clubs, which is what stops a puzzle you played
  // alone turning up in a game with friends.
  //
  // Running out is now a server raise (`no-unplayed-puzzle|`) rather than a
  // pre-flight check, so it can't race a peer starting the last puzzle
  // between our two reads and the create.
  const gameMode = game?.mode
  const createNewGame = useCallback(async () => {
    // Starting a new game mid-play SHELVES this one (create_game clears the
    // club's current-view flag; it stays resumable from the club page). Confirm
    // anyway so an accidental `+` doesn't read as "I just lost my game" — the
    // copy says shelved, not ended. At terminal there's nothing to interrupt.
    if (!isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))) return
    if (!gameMode) return // menu exists pre-load, but there's no mode to copy yet

    // Ask what we'd get, purely so running out can be a NOTICE rather than an
    // error pill: "there is no next puzzle" is a fact about the archive, not a
    // failure of this click. Same shape strands uses. The answer is advisory —
    // the create below derives it again, so a peer taking that puzzle in the
    // gap costs nothing.
    const { data: preview, error: lookupError } = await db
      .rpc('next_puzzle_for_club', { seen_by: players.map((p) => p.user_id) })
    if (lookupError) {
      showLocalFeedback(faultMessage(lookupError, 'new game'))
      return
    }
    if (!preview?.[0]) {
      await confirmAction({
        title: 'No more puzzles',
        message:
          'Everyone playing has already done every puzzle we have. Import more with '
          + '`gmake g-connections-puzzles`, or pick a date in the setup dialog to replay one.',
        confirmLabel: 'Got it',
        cancelLabel: null, // a notice, not a question
      })
      return
    }

    // `puzzleId` is deliberately ABSENT: that is how create_game is told to
    // choose. Carrying THIS game's setup forward would otherwise re-start the
    // very puzzle we just finished.
    const carried = { ...(setup as unknown as ConnectionsSetup) }
    delete carried.puzzleId
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: carried,
        player_user_ids: players.map((p) => p.user_id),
        mode: gameMode,
      })
      .single()
    if (error || !data) {
      // New game is a FAULT SURFACE (serverError.ts → faultMessage): this setup
      // already built a game once, so any failure here is a bug or an outage
      // — never a pill. Copy supplies the words when it has them.
      showLocalFeedback(faultMessage(error, 'new game'))
      return
    }
    goToGame(`connections_${gameMode}`, (data as { id: string }).id)
  }, [gameMode, clubHandle, setup, players, goToGame, showLocalFeedback, confirmAction, isTerminal])

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

  // ─── Header menu ("each game owns its whole menu") ─────
  // The shell no longer injects a common Help / Back-to-club section; connections
  // builds its FULL menu via buildGameMenu. connections has no game-specific menu
  // actions (Hints + End live as info-column buttons), so `extra` is empty — the
  // menu is just Help + the End(coop)/Concede(compete) + Back-to-club tail.
  //
  // The end/concede handlers dispatch through a stable `actionsRef` so this
  // effect can depend on STABLE values only (setGameSections is a setState — a
  // handler in the deps would re-run it every render → loop). The ref is
  // repopulated in the effect below whenever a handler identity changes. Mode is
  // read off the loaded game; before it loads we default to coop, then the effect
  // re-runs once `game` arrives. Placed above the early returns so hook order is
  // stable.
  const mode: 'coop' | 'compete' = game?.mode ?? 'coop'
  const actionsRef = useRef<{
    endGame: () => void
    concede: () => void
    restart: () => void
    newGame: () => void
  }>({
    endGame: () => {},
    concede: () => {},
    restart: () => {},
    newGame: () => {},
  })
  useEffect(() => {
    actionsRef.current = {
      endGame: handleEndGame,
      concede: handleConcede,
      restart: handleRestart,
      newGame: () => void handleNewGame(),
    }
  }, [handleEndGame, handleConcede, handleRestart, handleNewGame])
  // Board derivations, hoisted ABOVE the early return so the print-model build
  // in the menu effect (a hook, so it can't live below one) reads the SAME
  // values the render does rather than a second copy that could drift.
  const boardView = useMemo(() => {
    if (!game) return null
    const locallyDone = isEliminated || myConceded
    const matchedTiles = new Set<string>()
    for (const mc of matchedCategories) for (const t of mc.tiles) matchedTiles.add(t)
    const matchedRanks = new Set(matchedCategories.map((m) => m.rank))
    return {
      locallyDone,
      matchedTiles,
      remainingTiles: game.board.tileOrder.filter((t) => !matchedTiles.has(t)),
      // The categories nobody got — ONLY while this viewer is asking for them.
      // They used to appear the moment the game ended (or the moment a compete
      // player was eliminated), which both handed over the answer unasked and,
      // because the board swaps tiles for bands, erased the sixteen-minus-solved
      // tiles the players were still staring at.
      unmatched: solutionShown
        ? game.board.categories.filter((c) => !matchedRanks.has(c.rank))
        : [],
    }
  }, [game, isEliminated, myConceded, solutionShown, matchedCategories])

  useEffect(() => {
    // "Print board (PDF)" — a snapshot at click time (docs/pdf.md). The bands,
    // the remaining tiles and the log all come from what the VIEWER may see, so
    // RLS scoping carries onto paper for free.
    const printModel =
      game && boardView
        ? buildConnectionsPrintModel({
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
          })
        : null
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode,
        isTerminal,
        conceded: myConceded,
        onEndGame: () => actionsRef.current.endGame(),
        onConcede: () => actionsRef.current.concede(),
        extra: [
          {
            items: [
              // The info column's Hints button is icon-only, so this is where its
              // name lives — and the glyph beside it is what teaches the pairing.
              { id: 'hints', icon: IconHint, label: 'Hints', onClick: () => setHintsOpen((o) => !o) },
              // The same pair the terminal action row offers, reachable mid-game too.
              { id: 'restart', icon: IconRestart, label: 'Restart', onClick: () => actionsRef.current.restart() },
              { id: 'new-game', icon: IconNewGame, label: 'New game', shortcut: '+', onClick: () => actionsRef.current.newGame() },
            ],
          },
          ...(printModel
            ? [{ items: [{ id: 'print', icon: IconPrint, label: 'Print board (PDF)', onClick: () => printConnectionsPdf(printModel) }] }]
            : []),
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [
    menu, mode, isTerminal, myConceded,
    game, boardView, brand, title, matchedCategories, guesses, players,
    session.user.id, mistakeCount,
    summaryRows,
  ])

  // Hints + End live in the info-column action row (buttons), not the GamePage
  // menu — see the .infoActions block below. Hints toggles the inline HintList
  // (only shown while the caller can submit); End fires handleEndGame.

  // (The guess dispatch — submit_guess + dup detection + the wrong-guess shake — and
  // the local tile shuffle moved into BoardCol, beside the board + commit row.)

  if (loading) return <p>Loading board…</p>
  if (!game) return <p>Game not found.</p>

  // `concededIds` marks a dropped-out opponent 'out' in the strip. (`myConceded`
  // is derived above the early returns so the header-menu effect can read it.)
  const concededIds = new Set(
    players.filter((p) => p.conceded).map((p) => p.user_id),
  )

  const { remainingTiles } = boardView!

  // Turn-history: when a past turn is open, `snap` is that turn's board (else null =
  // live) — the bands matched STRICTLY BEFORE it + its own 4 guessed tiles (ringed in
  // the outcome color). Keyed by log position; a later realtime guess only grows the
  // log past viewingId, so a past turn holds.
  const snap = viewingId !== null ? turnSnapshot(guesses, game.board, viewingId) : null

  // tile → user_id mapping. In coop this carries every peer's
  // contribution; in compete it only ever has the caller's tiles
  // (broadcast is local-only there) so every tile reads as "mine"
  // and the peer-frame logic in Board never activates.
  const ownerByTile = new Map<string, string>()
  for (const [userId, list] of selections) {
    for (const t of list) ownerByTile.set(t, userId)
  }

  const colorByUserId = colorByUserIdMap(players)

  // Locally terminal (compete, not game-over): caller is out of the race but
  // the game continues for the survivors — either eliminated (hit 4 mistakes)
  // OR they conceded (dropped out). It freezes this player's input; it does NOT
  // open the answer, which waits for the game to be over for everyone (see the
  // reveal below). Sitting out with the puzzle unspoiled is the better version
  // of spectating, and it's the same rule every other game follows.
  const locallyDone = isEliminated || myConceded
  const showInput = !isTerminal && !locallyDone

  const matchedRanks = new Set(matchedCategories.map((m) => m.rank))
  const unmatched = solutionShown
    ? game.board.categories.filter((c) => !matchedRanks.has(c.rank))
    : []

  // Modal copy. Compete distinguishes the winner (caller hit 4 matches —
  // RLS hides peer matches, so caller-with-4-matched is the server-confirmed
  // winner) from two kinds of loser: eliminated (used all 4 mistakes) vs
  // "beaten to the punch" (still racing when an opponent solved it). Coop
  // verdicts are team-wide.
  const over = isTerminal ? buildOver({
    mode: game.mode,
    playState,
    timerExpired: timer.expired,
    selfMatched: matchedCategories.length,
    selfEliminated: mistakeCount >= MISTAKE_BUDGET,
  }) : null

  const connSetup = setup as ConnectionsSetup
  const found = matchedCategories.length

  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId` is
  // null in a free-for-all game, so this is false there — the pill's presence is
  // fixed for the game's life, no reflow. It carries the whose-turn answer on
  // MOBILE, where the InfoCol's TurnStatusLine is off-canvas in the InfoSheet;
  // without it a frozen board just ignored taps with no explanation.
  const waiting = currentTurnUserId !== null && !isMyTurn && !isTerminal
  const boardPill = waiting
    ? waitingTurnPill(players.find((p) => p.user_id === currentTurnUserId))
    : localFeedback

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        // ── Board to render (live OR the historical snapshot via `snap`) ──
        game={game}
        matchedCategories={matchedCategories}
        remainingTiles={remainingTiles}
        unmatched={unmatched}
        solutionShown={solutionShown}
        snap={snap}
        viewing={viewing}
        showInput={showInput}
        isMyTurn={isMyTurn}
        notMyTurn={waiting}
        myTurnJustStarted={turnFlash}
        // The frame says "this board is not a live position", which is true in
        // two situations, not one: the game is over for everybody (its tone is
        // the verdict's), or this player is out of a compete race while the
        // others play on. The second has no verdict yet, so it takes the neutral
        // gray — their board is inert, which is all the frame claims.
        gameOver={over ? over.tone : locallyDone ? 'neutral' : null}
        onExitViewing={exitViewing}
        // ── Tile selection (state in useGame; rendered + committed here) ──
        ownerByTile={ownerByTile}
        toggleTile={toggleTile}
        sendClear={sendClear}
        unionTiles={unionTiles}
        selfId={session.user.id}
        colorByUserId={colorByUserId}
        // Identity is only information on a genuinely shared board: coop, with
        // somebody else here. Solo, every pick is mine and a colored ring would
        // be decoration on top of the selection border; in compete the selection
        // never leaves this client, so the same holds however many are racing.
        sharedBoard={game.mode === 'coop' && players.length > 1}
        // ── Own-guess feedback (channel owned by PlayArea) ──
        localPill={boardPill}
        showLocalFeedback={showLocalFeedback}
        clearLocalFeedback={clearLocalFeedback}
        // ── Guess dispatch ──
        gameId={gameId}
        guesses={guesses}
        // ── Below-board readout / slot content ──
        mistakeCount={mistakeCount}
        mistakeBudget={MISTAKE_BUDGET}
        over={over}
        myConceded={myConceded}
      />

      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
      <InfoCol
        // ── Mode + phase ──
        isCompete={game.mode === 'compete'}
        over={over}
        showInput={showInput}
        myConceded={myConceded}
        currentTurnUserId={currentTurnUserId}
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
        // ── Action row ──
        categories={game.board.categories}
        hintsOpen={hintsOpen}
        onHints={() => setHintsOpen((o) => !o)}
        revealedHints={revealedHints}
        onRevealHint={revealHint}
        onEndGame={handleEndGame}
        onConcede={handleConcede}
        onRestart={handleRestart}
        onReveal={toggleSolution}
        solutionShown={solutionShown}
        solutionAlreadyShown={impliedBySolve}
        onNewGame={handleNewGame}
        startingNewGame={startingNewGame}
        onBackToClub={goToClub}
        // ── Setup disclosure ──
        setup={connSetup}
        setupRows={summaryRows}
        puzzleDate={game.puzzleDate}
        tileCount={game.board.tileOrder.length}
        // ── Turn-history log ──
        guesses={guesses}
        viewingIndex={viewingId}
        onSelectTurn={selectTurn}
      />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board pill + the info-column outcome line,
          and a coop solve gets the celebration instead — once, when it happens. */}
      {celebration.show && (
        <CelebrationDialog
          title="You win! 🎉"
          body="All four categories found."
          onClose={celebration.close}
        />
      )}
      {confirmDialog}
    </div>
  )
}

/**
 * Per-status terminal copy. `verdict` + `tone` drive the permanent below-board
 * pill; `message` + `tone` drive the short, bold, color-coded line in the
 * info-column action row (won = green, lost = red, manual end = neutral). Same
 * shape as psychicnum's buildOver. Coop
 * verdicts are team-wide; compete distinguishes the racer who hit 4 matches (the
 * winner) from two losers — eliminated (used all 4 mistakes) vs beaten to the
 * punch (an opponent solved it first). Detail-on-page intentionally: the
 * matched/unmatched categories show on the bands and mistake counts on the strip;
 * the pill + line stay focused on the verdict.
 *
 * Verdicts are terse and unpunctuated ("Lost: out of mistakes", not "You lost:
 * out of mistakes."): the pill is a fixed-height, ellipsising row that has to fit
 * a phone (docs/mobile.md → feedback copy).
 */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfMatched,
  selfEliminated,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfMatched: number
  /** Compete: did the caller use all their mistakes? Distinguishes the
   *  out-of-mistakes loss from "beaten to the punch". */
  selfEliminated: boolean
}): TerminalCopy {
  // Manual end (connections.end_game) — NEUTRAL terminal in BOTH modes: the
  // friends chose to stop, nobody won or lost. The shared endedCopy() owns it
  // (green modal, neutral copy). Must come first — 'ended' is mode-independent.
  if (playState === 'ended') return endedCopy(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { verdict: 'You win!', message: 'You won!', tone: 'won' }
    }
    return {
      verdict: timerExpired ? 'Lost: out of time' : 'Lost: out of mistakes',
      message: timerExpired ? 'Out of time' : 'Out of mistakes',
      tone: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    if (selfMatched >= CATEGORY_COUNT) {
      return { verdict: 'Won: the race', message: 'You won!', tone: 'won' }
    }
    // I lost — but WHY matters. If I used all my mistakes I was eliminated
    // (out of mistakes); "beaten to the punch" is only for a still-racing player
    // whose opponent solved it first.
    if (selfEliminated) {
      return { verdict: 'Lost: out of mistakes', message: 'Out of mistakes', tone: 'lost' }
    }
    return { verdict: 'Beaten to the punch', message: 'Opponent won', tone: 'lost' }
  }
  // lost_compete (everyone eliminated OR timeout)
  return {
    verdict: timerExpired
      ? 'Out of time — no winner'
      : 'Everyone eliminated',
    message: timerExpired ? 'Out of time' : 'All eliminated',
    tone: 'lost',
  }
}
