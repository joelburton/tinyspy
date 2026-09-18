// cs-fixed-outcome-fix

import { runRpc } from '@/common/supabase/dbResult'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconHideSolution } from '@/common/icons/icons'
import { cls } from '@/common/utils/cls'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
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
import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'
import { buildConnectionsPrintModel } from '../pdf/model'
import { printConnectionsPdf } from '../pdf/printConnectionsPdf'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { setupRows } from '../lib/setupSummary'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { solvedByMe, useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { db } from '../db'
import type { CategoryRank } from '../lib/board'
import { useGame } from '../hooks/useGame'
import type { ConnectionsSetup, PuzzleAnswer } from '../lib/setup'
import { historySnapshot } from '../lib/history'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // connections-specific color tokens (lazy with this chunk)
import { useTabRing } from '@/common/keyboard/useTabRing'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

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
 *     mirrors psychicnum): my OWN guess result shows green/red
 *     in the commit slot below the board (local — near my eyes,
 *     about what I just did); a teammate's guess is narrated in
 *     the GamePage header (the global slot). Compete reaches
 *     neither header branch — the guesses log is RLS-scoped to the
 *     caller, so there are no peer events to announce.
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
  globalFeedbackSlot,
  clubHandle,
  goToGame,
  menu,
  brand,
  title,
}: GamePageCtx) {
  // The board is worked by clicks and typing, so Tab has nowhere to go here —
  // and an empty ring is what keeps it from walking out to the browser.
  useTabRing([])
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
  // Which hint categories are revealed. Owned HERE rather than in <HintList>,
  // which was for a restart handler that no longer exists — a restart unmounts
  // the surface now. The state could move back down; connections' todo has it.
  const [revealedHints, setRevealedHints] = useState<ReadonlySet<CategoryRank>>(() => new Set())
  const revealHint = useCallback((rank: CategoryRank) => {
    setRevealedHints((prev) => (prev.has(rank) ? prev : new Set(prev).add(rank)))
  }, [])

  // Mobile: below --mobile the board fills the screen and the info column slides in
  // as an off-canvas sheet from a "Game info" menu item (the shared recipe —
  // docs/mobile.md). Plain (not `wide`): the info column is a narrow 22rem readout
  // + event log, no multi-column word list. Desktop is untouched.
  const infoSheet = useInfoSheet()

  const { acknowledge, acknowledgeModal } = useAcknowledge()

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

  // ─── The local feedback slot (own-action feedback) ─────
  // Shown *in place of the commit buttons*: the player's own guess result —
  // "Correct" (green) / "One away!" (amber) / "Incorrect" (red) — a not-ok,
  // and the standing conditions further down. It lives in the commit row's
  // already-reserved height (never a new line that would reflow the board —
  // docs/ui.md → Layout stability), and a tile click dismisses a result the
  // moment the player starts a fresh selection (BoardCol's handleToggle) —
  // the tile-click analog of psychicnum's "typing dismisses the result".
  // Local channel: near my eyes, about what I just did (docs/deferred.md →
  // Feedback channels).
  const localFeedbackSlot = useFeedbackSlot('local')
  // Any key is the player's next move → dismiss a gesture-cleared message,
  // even though connections has no keyboard entry (guesses are tile clicks).
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // ─── Turn-history viewer ───────────────────────────────
  // Click a event-log #N to replay that turn (the bands matched before it + this
  // turn's 4 guessed tiles ringed in their outcome color, on the board as it was).
  // Keyed by log position. Exit is intrinsic to the hook (a click anywhere, the
  // banner ✕, or any key — the hook binds `act-exit-history` itself, and the
  // board's own commands hide while a turn is open so the key reaches it).
  const { historyId, showHistory, exitHistory } =
    useHistoryViewer<number>()

  // ─── Coop peer events (group feedback) ─────────────────
  // A teammate's guess is narrated in the GamePage header: correct →
  // "Bea found ANIMALS!" (green), one-away → "Bea was one away" (amber),
  // wrong → "Bea guessed wrong" (red). My own guesses are excluded — they
  // get the local commit flash above; my guess also already shows in the
  // event log. Compete never reaches here: the guesses log is RLS-scoped to
  // the caller server-side, so no foreign rows arrive, and we gate on coop
  // besides.
  usePeerFeedback({
    enabled: game?.mode === 'coop',
    items: guesses,
    keyOf: (g) => String(g.id),
    messageFor: (g) => {
      if (g.user_id === session.user.id) return null // mine → the local slot
      const member = memberById(players, g.user_id)
      if (g.matched) {
        // NOT the category's name: it's puzzle data of unbounded length (a NYT
        // category can run 25+ chars), and the header fits ~26 on a phone
        // before it ellipsises. The solved band appears on the reader's own
        // board at the same moment, so naming it here says nothing new.
        return FeedbackMessage.peer(member, g.outcome, 'found category')
      }
      return FeedbackMessage.peer(member, g.outcome, g.outcome === 'near' ? 'was one away' : 'guessed wrong')
    },
    globalFeedbackSlot,
  })

  // Concede lives on the common roster (ctx `players` = GamePlayer[]), not
  // connections.players; `myConceded` also folds into the locally-terminal
  // branch below (same treatment as a 4-mistake elimination).
  const myConceded =
    players.find((p) => p.user_id === session.user.id)?.conceded ?? false

  // ─── End / Concede / Replay — the shared three ─────────
  // End is coop's stop, hidden in compete: it terminates with everyone
  // {won:false} and a NEUTRAL verdict, because friends agreeing to stop is a
  // valid outcome, not a "you lose" punishment. It is a button in the info
  // column and a menu row, one binding. Concede is compete's drop-out (a real
  // loss; the others keep racing). Replay restarts THIS puzzle — the same
  // sixteen tiles in the same shuffle, everyone's guesses + mistakes wiped —
  // A restart needs nothing from this game: the page unmounts the whole play
  // surface when the run changes, and the shared selections live in `useGame`
  // inside it — so every client, not just the one that pressed Restart, drops
  // its own picks AND its picture of everyone else's. Nothing replays them
  // either: selections are fire-and-forget Broadcast with no presence sync.
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
    impliedBySolve,
  } = useSolutionReveal({
    impliedBy: solvedByMe({
      isCompete: game?.mode === 'compete',
      playState,
      mine: iMatchedThemAll,
    }),
  })

  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
      db,
      gameId,
      isTerminal,
      mode: game?.mode === 'compete' ? 'compete' : 'coop',
      myConceded,
      localFeedbackSlot,
    })

  // ─── New game — the NEXT unplayed puzzle ───────────────
  // connections's boards are a dated ARCHIVE rather than something generated
  // per game, so "New game" can't just re-roll — it has to move on to a
  // puzzle nobody here has done. That rule now lives in ONE place, the server
  // (`connections.next_puzzle_for_club`, reached by simply omitting
  // `puzzle_id`), which is the same thing the setup dialog previews. It used
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
  //
  // A plain function, rebuilt every render: the binding below reads it at click
  // time, so the values it closes over are whatever the last realtime refetch
  // left, and the action's own identity doesn't move when they do.
  const gameMode = game?.mode
  const createNewGame = async () => {
    if (!gameMode) return // menu exists pre-load, but there's no mode to copy yet

    // Ask what we'd get, purely so running out can be a NOTICE rather than a
    // not-ok: "there is no next puzzle" is a fact about the archive, not a
    // failure of this click. Same shape strands uses. The answer is advisory —
    // the create below derives it again, so a peer taking that puzzle in the
    // gap costs nothing.
    const preview = await runRpc<PuzzleAnswer>(
      db.rpc('next_puzzle_for_club', { seen_by: players.map((p) => p.user_id) }),
    )
    if (preview.type === 'not-ok' && preview.dbcode === 'PN302') {
      // THE ARCHIVE IS SPENT, and this surface says it better than the server
      // can. PN302's own sentence points at the date field on the setup form —
      // right there, useless here, since this path has no form. What this
      // surface knows instead is the two ways forward from a finished game, so
      // it substitutes rather than repeats (docs/envelopes.md → a server
      // message may not say LESS than the sentence it replaces; the same test
      // read the other way permits a caller that says MORE).
      await acknowledge({
        title: 'No more puzzles',
        message:
          'Everyone playing has already done every puzzle we have. Import more with '
          + '`gmake g-connections-puzzles`, or pick a date in the setup dialog to replay one.',
        okLabel: 'Got it',
      })
      return
    } else if (preview.type === 'not-ok') {
      // Anything else: the slot carries the words, because the fault modal that
      // just fired is dismissable and this is what remains once it is gone. It
      // also has to be said HERE — the new game never happens, and a player who
      // pressed a button and saw nothing change is owed a reason.
      localFeedbackSlot.show(FeedbackMessage.notOk(preview))
      return
    } else if (preview.type === 'ok' && preview.data.result === 'found') {
      // A puzzle is waiting, so the create below runs. Nothing to do HERE: the
      // id is deliberately not carried forward — this was only ever a
      // look-ahead, and create_game derives it again — so the branch exists to
      // name the answer, not to act on it.
    } else {
      reportUnhandled('next_puzzle_for_club', preview)
      return
    }

    // `puzzle_id` is deliberately ABSENT: that is how create_game is told to
    // choose. Carrying THIS game's setup forward would otherwise re-start the
    // very puzzle we just finished.
    const carried = { ...(setup as unknown as ConnectionsSetup) }
    delete carried.puzzle_id
    // No `.single()`: the RPC returns the envelope itself, one jsonb value —
    // asking for a single ROW of it gets the envelope where the game was meant
    // to be, and `data.id` reads undefined off it.
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        setup: carried,
        player_user_ids: players.map((p) => p.user_id),
        mode: gameMode,
      }),
    )
    if (res.type === 'not-ok') {
      // The same envelope the setup form reads, read differently: there is no
      // field and no form here, so whatever came back goes in the slot as it
      // reads, over the verdict, until its × is pressed. Shown even for a
      // fault, whose modal has already fired centrally — the modal escalates,
      // it does not replace, and dismissing it must not leave the board silent
      // about why the game did not start.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToGame(`connections_${gameMode}`, res.data.id)
      return
    } else {
      reportUnhandled('create_game', res)
      return
    }
  }

  // New game — its `+`, its menu row and its terminal button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this game:
  // create_game clears the club's current-view flag, so it stays resumable — the
  // copy says shelved, not ended) and goes straight through at terminal, where
  // there is nothing to interrupt. The shared run's single flight is what stops a
  // second press taking two puzzles out of the archive.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    describe: () => 'active',
    run: createNewGame,
  })

  // Hints — the inline per-player reveal list, unfolded under the action row.
  // A toggle, so its words move with it; the list itself is InfoCol's.
  const actHint = useBoundAction('act-hint', {
    describe: () => ({ state: 'active', label: hintsOpen ? 'Hide hints' : 'Hints' }),
    run: () => setHintsOpen((o) => !o),
  })

  // Reveal the categories nobody got — a LOCAL display toggle: it swaps what the
  // board draws, writes nothing, and affects no peer. Terminal-only, so a player
  // who dropped out can't spoil a race still running.
  const actReveal = useBoundAction('act-reveal', {
    describe: () => {
      if (impliedBySolve) return { state: 'disabled', label: 'Solution already shown' }
      if (solutionShown) return { state: 'active', label: 'Hide categories', icon: IconHideSolution }
      // Named in the inert case too: the registry's bare "Reveal" would make the
      // row change its words as the game ended, which is not what it says.
      return { state: isTerminal ? 'active' : 'disabled', label: 'Reveal categories' }
    },
    run: toggleSolution,
  })

  // Mode is read off the loaded game; before it loads we default to coop.
  const mode: 'coop' | 'compete' = game?.mode ?? 'coop'
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

  // Print the board — a snapshot at CLICK time (docs/pdf.md). The bands, the
  // remaining tiles and the log all come from what the VIEWER may see, so RLS
  // scoping carries onto paper for free. Built inside `run` rather than in the
  // menu effect, so the menu needn't rebuild as the board moves.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (game && boardView ? 'active' : 'hidden'),
    run: () => {
      if (!game || !boardView) return
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

  // The FULL connections menu. `buildGameMenu` supplies the framing (Help + chat
  // above, Back to club below); the middle is this game's own rows, each one a
  // binding it already made — so a row's words, glyph, key and availability come
  // from the action rather than being typed here a second time. The effect
  // re-runs only when the SHAPE changes, which is why every dep is stable.
  //
  // Hints is a MENU row as well as an info-column button: that button is
  // icon-only, so the row is where its name is taught beside its glyph.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that isn't
        // its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          { items: [actHint, actRestart, actNewGame] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actHint, actRestart, actNewGame, actPrintBoard])

  // Hints + End are buttons in the info-column action row AND menu rows, each
  // from one binding — see the .infoActions block below. Hints toggles the
  // inline HintList (only shown while the caller can submit).

  // (The guess dispatch — submit_guess + dup detection + the wrong-guess shake — and
  // the local tile shuffle moved into BoardCol, beside the board + commit row.)

  // ─── The three standing conditions of the local slot ───
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — the slot draws whichever ranks highest. Above the early
  // returns because effects must be.

  // The terminal message, memoized on primitives so the verdict effect sees
  // one object per outcome. Compete distinguishes the winner (caller hit 4
  // matches — RLS hides peer matches, so caller-with-4-matched is the
  // server-confirmed winner) from two kinds of loser: eliminated (used all 4
  // mistakes) vs "beaten to the punch" (still racing when an opponent solved
  // it). Coop verdicts are team-wide.
  const timerExpired = timer.expired
  const selfMatched = matchedCategories.length
  const selfEliminated = mistakeCount >= MISTAKE_BUDGET
  const over = useMemo(
    () =>
      isTerminal && gameMode
        ? buildOver({ mode: gameMode, playState, timerExpired, selfMatched, selfEliminated })
        : null,
    [isTerminal, gameMode, playState, timerExpired, selfMatched, selfEliminated],
  )
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  // Locally terminal (compete, not game-over): caller is out of the race but
  // the game continues for the survivors — either eliminated (hit 4 mistakes)
  // OR they conceded (dropped out). It freezes this player's input; it does NOT
  // open the answer, which waits for the game to be over for everyone (see the
  // reveal below). Sitting out with the puzzle unspoiled is the better version
  // of spectating, and it's the same rule every other game follows.
  const locallyDone = isEliminated || myConceded
  useEffect(function showOutOfRace() {
    if (!locallyDone || isTerminal) return
    const id = localFeedbackSlot.show(FeedbackMessage.outOfRace(myConceded))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, locallyDone, isTerminal, myConceded])

  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId`
  // is null in a free-for-all game, so this never fires there. It carries the
  // whose-turn answer on MOBILE, where the InfoCol's TurnStatusLine is
  // off-canvas in the InfoSheet; without it a frozen board just ignored taps
  // with no explanation.
  const waiting = currentTurnUserId !== null && !isMyTurn && !isTerminal
  const turnHolder = players.find((p) => p.user_id === currentTurnUserId)
  const holderName = turnHolder?.username
  const holderColor = turnHolder?.color
  useEffect(function showWaiting() {
    if (!waiting) return
    const id = localFeedbackSlot.show(
      FeedbackMessage.waiting(
        holderName === undefined ? undefined : { username: holderName, color: holderColor ?? '' },
      ),
    )
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, waiting, holderName, holderColor])

  if (loading) return <p>Loading board…</p>
  // THE LOAD FAILED, which is not the same as the game being absent — and used
  // to be told as if it were, so a dead connection said "Game not found."
  // about a game that exists. The board cannot render either way, so the
  // failure IS the surface here (docs/ui.md → Faults: a fault page where the
  // page behind it does not survive, a modal where it does). The modal has
  // already been and gone; this is what a player is left looking at.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // Genuinely absent: the reads worked and there is no such game.
  if (!game) return <p>Game not found.</p>

  // `concededIds` marks a dropped-out opponent 'out' in the strip. (`myConceded`
  // is derived above the early returns so the header-menu effect can read it.)
  const concededIds = new Set(
    players.filter((p) => p.conceded).map((p) => p.user_id),
  )

  const { remainingTiles } = boardView!

  // When a past turn is open, `historySnap` is that turn's board (else null =
  // live) — the bands matched STRICTLY BEFORE it + its own 4 guessed tiles (ringed in
  // the outcome color). Keyed by log position; a later realtime guess only grows the
  // log past historyId, so a past turn holds.
  const historySnap = historyId !== null ? historySnapshot(guesses, game.board, historyId) : null

  // tile → user_id mapping. In coop this carries every peer's
  // contribution; in compete it only ever has the caller's tiles
  // (broadcast is local-only there) so every tile reads as "mine"
  // and the peer-frame logic in Board never activates.
  const ownerByTile = new Map<string, string>()
  for (const [userId, list] of selections) {
    for (const t of list) ownerByTile.set(t, userId)
  }

  const colorByUserId = colorByUserIdMap(players)

  const showInput = !isTerminal && !locallyDone

  const matchedRanks = new Set(matchedCategories.map((m) => m.rank))
  const unmatched = solutionShown
    ? game.board.categories.filter((c) => !matchedRanks.has(c.rank))
    : []

  const connSetup = setup as ConnectionsSetup
  const found = matchedCategories.length

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        // ── Board to render (live OR the historical snapshot via `snap`) ──
        game={game}
        matchedCategories={matchedCategories}
        remainingTiles={remainingTiles}
        unmatched={unmatched}
        solutionShown={solutionShown}
        historySnap={historySnap}
        showInput={showInput}
        isMyTurn={isMyTurn}
        notMyTurn={waiting}
        myTurnJustStarted={turnFlash}
        // The frame says "this board is not a live position", which is true in
        // two situations, not one: the game is over for everybody (the frame
        // wears the verdict's outcome), or this player is out of a compete race while the
        // others play on. The second has no verdict yet, so it takes the neutral
        // gray — their board is inert, which is all the frame claims.
        gameOver={over ? over.outcome : locallyDone ? 'neutral' : null}
        onExitHistory={exitHistory}
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
        revealedHints={revealedHints}
        onRevealHint={revealHint}
        actHint={actHint}
        actEndGame={actEndGame}
        actConcede={actConcede}
        actRestart={actRestart}
        actReveal={actReveal}
        actNewGame={actNewGame}
        actBackToClub={menu.actBackToClub}
        // ── Setup disclosure ──
        setup={connSetup}
        setupRows={summaryRows}
        puzzleDate={game.puzzleDate}
        tileCount={game.board.tileOrder.length}
        // ── Turn-history log ──
        guesses={guesses}
        historyId={historyId}
        onShowHistory={showHistory}
      />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board slot + the info-column outcome line,
          and a coop solve gets the celebration instead — once, when it happens. */}
      {celebration.show && (
        <CelebrationBlockingModal
          title="You win! 🎉"
          body="All four categories found."
          onClose={celebration.close}
        />
      )}
      {acknowledgeModal}
    </div>
  )
}

/**
 * The per-status terminal message. `pillText` + `outcome` are the below-board
 * verdict; `infoColText` + `outcome` the short, bold, color-coded line in the
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
 * a phone (docs/mobile.md → feedback text).
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
}): TerminalMessage {
  // Manual end (connections.end_game) — NEUTRAL terminal in BOTH modes: the
  // friends chose to stop, nobody won or lost. The shared
  // gameEndedTerminalMessage() owns it. Must come first — 'ended' is
  // mode-independent.
  if (playState === 'ended') return gameEndedTerminalMessage(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { pillText: 'You win!', infoColText: 'You won!', outcome: 'won' }
    }
    return {
      pillText: timerExpired ? 'Lost: out of time' : 'Lost: out of mistakes',
      infoColText: timerExpired ? 'Out of time' : 'Out of mistakes',
      outcome: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    if (selfMatched >= CATEGORY_COUNT) {
      return { pillText: 'Won: the race', infoColText: 'You won!', outcome: 'won' }
    }
    // I lost — but WHY matters. If I used all my mistakes I was eliminated
    // (out of mistakes); "beaten to the punch" is only for a still-racing player
    // whose opponent solved it first.
    if (selfEliminated) {
      return { pillText: 'Lost: out of mistakes', infoColText: 'Out of mistakes', outcome: 'lost' }
    }
    return { pillText: 'Beaten to the punch', infoColText: 'Opponent won', outcome: 'lost' }
  }
  // lost_compete (everyone eliminated OR timeout)
  return {
    pillText: timerExpired
      ? 'Out of time — no winner'
      : 'Everyone eliminated',
    infoColText: timerExpired ? 'Out of time' : 'All eliminated',
    outcome: 'lost',
  }
}
