import { failureMessage, faultMessage } from '../../common/lib/game/serverError'
import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { IconHideSolution, IconNewGame, IconPrint, IconRestart, IconReveal } from '../../common/components/icons'
import type { GamePageCtx, GenericFeedbackMsg } from '../../common/lib/games'
import { cls } from '../../common/lib/util/cls'
import { terminalPill, outOfRacePill } from '../../common/lib/game/localPills'
import { waitingTurnPill } from '../../common/components/game/turnCopy'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { buildWafflePrintModel } from '../pdf/model'
import { printWafflePdf } from '../pdf/printWafflePdf'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { setupRows } from '../lib/setupSummary'
import { invokeStartGameEdgeFn } from '../../common/lib/game/manifestRpcs'
import { useDismissLocalFeedbackOnKey } from '../../common/hooks/feedback/useDismissLocalFeedbackOnKey'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, NEW_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { useTurnStartFlash } from '../../common/hooks/game/useTurnStartFlash'
import { solvedByMe, useSolutionReveal } from '../../common/hooks/game/useSolutionReveal'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { turnSnapshot } from '../lib/history'
import { computeColors } from '../lib/colors'
import { solvedWords, swapCells, unjudgeCells } from '../lib/waffle'
import type { WaffleSetup } from '../lib/setup'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { StateLine } from './StateLine'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'
import { useSwallowTab } from '../../common/hooks/input/useSwallowTab'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'

/**
 * waffle's play surface, shared by the coop and compete manifests, on the shared
 * two-column scaffold. PlayArea is the **coordinator**: it holds the game data
 * (`useGame`), the server mutations (swap / end / concede RPCs), and the cross-column
 * coordination state (the turn-history viewer, the below-board feedback), and wires
 * two presentational columns:
 *
 *   - **`<BoardCol>`** — the square Board + the below-board feedback slot. Takes
 *     the board to render (live OR a historical snapshot) + `readOnly`; emits a swap
 *     up (`onSwap`) and "back to live" (`onExitViewing`).
 *   - **`<InfoCol>`** — the swap-state readout, OpponentStrip, action row, setup
 *     disclosure, terminal answer reveal, and the coop swap log. Named callbacks up.
 *
 * Mode is read from `game.mode`. Moves go through `waffle.submit_swap`; board/colors
 * update via the realtime refetch in `useGame` (Pattern A) — a live swap needs no
 * optimistic local state. Turn-history (coop only) replays past boards, coloring them
 * on the FE (see lib/history + lib/colors). See docs/playarea-decomposition-plan.md.
 *
 * **Feedback split** (docs/deferred.md → Feedback channels): the player's OWN errors
 * (a rejected swap, a failed End) flash LOCALLY in BoardCol's below-board slot; the
 * header pill carries PEER/group news — in compete, when an opponent solves or runs
 * out of swaps (coop needs none: the swap log already shows every move).
 */
export function PlayArea({
  session,
  gameId,
  brand,
  title,
  players,
  playState,
  isTerminal,
  timer,
  isMyTurn,
  currentTurnUserId,
  setup,
  status,
  globalFeedback,
  goToClub,
  clubHandle,
  goToGame,
  menu,
}: GamePageCtx) {
  // Tab does nothing while the board has the keyboard — this play surface is
  // not a form, so native Tab would walk out to the header buttons and on into
  // the browser's URL bar, stranding the player. (The capture-entry games get
  // this from useCaptureKeys; see useSwallowTab.)
  useSwallowTab()
  const { game, players: playerStates, swaps, loading } = useGame(gameId)
  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (docs/pdf.md → Setup rows).
  const summaryRows = useMemo(
    () => setupRows(setup as unknown as WaffleSetup, game?.mode ?? 'coop', players, game?.par_swaps ?? 0),
    [setup, game, players],
  )

  // Own-action feedback (LOCAL): a rejected swap or a failed End flashes in the
  // below-board slot — never the header pill (that's the peer/group channel).
  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback({ locked: isTerminal })
  // Any key is the player's next move → dismiss the own-move pill, even though
  // waffle has no keyboard entry (swaps are clicks). No-op at terminal (locked).
  useDismissLocalFeedbackOnKey(clearLocalFeedback)

  // ─── Turn-history viewer (coop only) ───────────────────
  // The shared coordination state: which swap-log row (by POSITION in the coop log)
  // is open on the board, or null = live. When set, PlayArea feeds BoardCol that
  // swap's historical snapshot + readOnly; BoardCol shows the gray-blue frame + banner
  // and freezes input. Only coop can reach it (compete renders no swap log). waffle
  // has no keyboard play, so `exitOnKey` is its ONLY key handler — a bare key exits.
  const { viewingId: viewingIndex, viewing, select: setViewingIndex, exitViewing, exitOnKey } =
    useHistoryViewer()
  useGlobalKeyHandler(exitOnKey)

  // Mobile: below --mobile the board fills the screen and the whole info column
  // slides in as an off-canvas sheet from a "Game info" menu item (the shared
  // recipe — docs/mobile.md). Plain (not `wide`): waffle's info column is a narrow
  // 22rem readout + swap log, no multi-column word list. Desktop is untouched.
  const infoSheet = useInfoSheet()

  // The shared end-game confirm modal (replaces window.confirm — a true
  // modal: backdrop-blocked board, dialog-owned keyboard).
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()

  // ─── Coop-win celebration ──────────────────────────────
  // Confetti at the MOMENT the group solves it — the winning swap flips
  // playState to 'won' on every connected client via the realtime refetch, so
  // everyone celebrates together; opening an already-won game stays quiet
  // (useCelebration never pops on mount). Gated on playState ALONE, which is
  // both the coop-only guard ('won' is coop's win; compete writes
  // 'won_compete') and — unlike `game.mode`, which is null until useGame's
  // async fetch lands and would fake a mid-session flip on every mount of a
  // won game — correct from the very first render.
  const celebration = useCelebration(playState === 'won')

  // ─── The turn arriving (turn-order coop) ───────────────
  // The board frame flashes yellow at the moment the move becomes mine. The
  // board dimming is what says "not yours"; its lifting is a removal, and a
  // removal is a poor signal — you have been waiting, so you are looking
  // somewhere else when it happens. Never fires in a free-for-all game
  // (`isMyTurn` is permanently true there), so it needs no mode gate.
  const turnFlash = useTurnStartFlash(isMyTurn)

  // ─── Compete peer news (header pill) ───────────────────
  // When an opponent's public state ticks — they solved the puzzle, or they ran out
  // of swaps — narrate it in the header (tension; compete has no swap log to show
  // it). The count/word stays hidden; we only surface the milestone. The ref seeds
  // silently on first load so history isn't replayed. Coop surfaces nothing here.
  const seenOpponentRef = useRef<Map<string, { solved: boolean; out: boolean }>>(new Map())
  useEffect(
    function announceOpponentMilestones() {
      if (!game || game.mode !== 'compete') return
      for (const ps of playerStates) {
        if (ps.user_id === session.user.id) continue
        const out = !ps.solved && ps.swaps_used >= game.max_swaps
        const prev = seenOpponentRef.current.get(ps.user_id)
        seenOpponentRef.current.set(ps.user_id, { solved: ps.solved, out })
        if (prev === undefined) continue // first sighting — seed, don't announce
        const member = players.find((m) => m.user_id === ps.user_id)
        if (ps.solved && !prev.solved) {
          // A solve is a GOOD outcome → success (green) — the same green a found word
          // reads as in both modes (docs/ui.md → Feedback pill: tone follows the
          // event). Adverse to me in compete, but the tone names the event, not my stake.
          globalFeedback.show({
            tone: 'won',
            text: (
              <>
                <ActorDot actor={member} fallback="Someone" /> solved it
              </>
            ),
            mode: { kind: 'timed' },
          })
        } else if (out && !prev.out) {
          // Out of swaps is a milestone — important, neither clearly good nor bad → warning.
          globalFeedback.show({
            tone: 'warning',
            text: (
              <>
                <ActorDot actor={member} fallback="Someone" /> out of swaps
              </>
            ),
            mode: { kind: 'timed' },
          })
        }
      }
    },
    [playerStates, game, players, session.user.id, globalFeedback],
  )

  // ─── A swap in flight ──────────────────────────────────
  // The move is shown at once; its verdict is not (docs/tile-feedback.md → "What
  // the dim does NOT excuse"). The moment you drop a tile, the two letters trade
  // places on your board, the two cells go UNJUDGED — their old color was
  // invalidated by the move and the new one is the server's to give, so they show
  // the middle gray under the in-flight dim (see `.inFlight` in Board.module.css
  // for why that gray and not the light blank). A board that didn't move would
  // read as a swap that didn't happen, which is the single worst thing this
  // surface can say; the dim on top of stale colors would read as the app
  // struggling.
  //
  // The colors then arrive for EVERYONE together, over the realtime refetch,
  // with the attention flash. In coop the FE actually holds the solution (it
  // colors the history viewer's replayed boards), so the swapper *could* color
  // their own tiles a round-trip early — and deliberately doesn't: they'd be
  // acting on a board their teammates can't see yet, in a game where the next
  // move follows fast. Which is also why `submit_swap`'s reply — it returns the
  // new colors — is ignored here. Don't wire it up.
  //
  // `atBoard` / `atSwaps` are the server state this swap was made against; the
  // optimistic overlay lasts exactly until either moves (below), so it needs no
  // timer and can't outlive its answer. The RPC resolving is NOT the end of it:
  // the reply beats the refetch, and un-dimming there would leave two colorless
  // tiles sitting undimmed until the board caught up.
  const [optimisticSwap, setOptimisticSwap] = useState<{
    cells: readonly [number, number]
    atBoard: string
    atSwaps: number
  } | null>(null)
  // The server state as of THIS render, read at click time so the handler's
  // identity (and the menu effect that depends on it) doesn't churn.
  const serverStateRef = useRef({ board: '', swaps: 0 })
  const doSwap = useCallback(
    async (a: number, b: number) => {
      const { board: atBoard, swaps: atSwaps } = serverStateRef.current
      setOptimisticSwap({ cells: [a, b], atBoard, atSwaps })
      const { error } = await db.rpc('submit_swap', { target_game: gameId, pos_a: a, pos_b: b })
      if (error) {
        // Refused (a teammate spent the last swap, the turn moved, the game
        // ended). Optimism is about ACCEPTANCE, so this is the price: take the
        // letters back, then say why in the below-board flash.
        setOptimisticSwap(null)
        showLocalFeedback(failureMessage(error, 'swap'))
      }
      // Accepted: leave the overlay standing. It clears when the server's own
      // board lands, which is the same moment the colors do.
    },
    [gameId, showLocalFeedback],
  )
  const [handleSwap] = useSingleFlight(doSwap)

  // Concede lives on the COMMON roster (ctx `players`), computed here (before the
  // handlers + the menu effect) so both can read it. Drives the shared trio's
  // concede guard, the menu's coop-End-vs-compete-Concede pick, the "You
  // conceded" copy, and the conceded-opponent 'out' marker below.
  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false

  // ─── The answer shows only when I ask for it ──────────
  // Never automatically — not even on a win, where the board in front of you
  // already IS the solution. LOCAL and reversible (useSolutionReveal): my
  // looking doesn't swap the board out from under a partner who's still
  // studying where they got stuck, and hiding brings THEIR board back rather
  // than needing a Restart. The solution itself is on every client at terminal
  // (waffle._solution_for), so this is purely which grid gets drawn.
  //
  // `impliedBy` is the exception: a waffle win IS the solved grid, so a solver
  // is already looking at the answer and the swap would put back an identical
  // board. MY solve, not the game's verdict — a compete racer who ran out of
  // swaps never got there. (`playerStates` is [] on the first render, which is
  // exactly why the reveal derives this rather than initialising from it.)
  const iSolved =
    playerStates.find((p) => p.user_id === session.user.id)?.solved === true
  const {
    revealed: answerShown,
    toggle: toggleAnswer,
    reset: resetAnswer,
    impliedBySolve,
  } = useSolutionReveal({
    impliedBy: solvedByMe({ isCompete: game?.mode === 'compete', playState, mine: iSolved }),
  })

  // ─── End / Concede / Replay — the shared trio ──────────
  // The byte-identical shared handlers (useStandardGameActions); waffle's own
  // bits are the replay sentence and the post-replay cleanup (leave the
  // history view, clear the pill, re-hide a locally-revealed answer).
  // Failures arrive fully classified. (The old local `ownAction` builder
  // stamped these TIMED so they auto-faded — ruled drift 2026-08-13; a race's
  // "Game over" now sticks like every other game's, and a fault is manual.)
  // New game + Reveal answer stay below.
  const onRestarted = useCallback(() => {
    exitViewing()
    clearLocalFeedback()
    // The same board, scrambled back — so forget my choice about the answer.
    // `reset`, not `hide`: hiding would record an explicit "no" that outranks
    // the solve-implied default, so solving the replayed board wouldn't show it.
    resetAnswer()
    // Forget any optimistic swap too. It expires by comparing itself against the
    // server's board + swap count, and a restart puts BOTH back to where a
    // first-move swap was made — which would make a long-answered swap look
    // live again on the fresh board.
    setOptimisticSwap(null)
  }, [exitViewing, clearLocalFeedback, resetAnswer])
  const { endGame, concede, restart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    myConceded,
    confirm: confirmAction,
    showError: showLocalFeedback,
    onRestarted,
  })

  // New game — a FRESH game (new id, new randomly-built board) with THIS
  // game's setup + roster + mode, in the same club: the "same again!" action
  // after a solve, without a trip through the club page's setup dialog. Goes
  // through the same `waffle-build-board` edge function the manifest's
  // startGameInClub uses (it builds a board for the band and calls
  // create_game). Non-destructive — common.create_game un-currents THIS game
  // (it shelves into the club's games list, resumable) — so no confirm. The
  // creator jumps straight in; peers arrive via the game-invitation toast.
  //
  // `setup` + `players` arrive as fresh identities on every realtime refetch,
  // so the handler reads them via a click-time ref — keeping its own identity
  // (and therefore the menu effect below) stable across refetches.
  const gameMode = game?.mode
  const newGameArgsRef = useRef<{ setup: Record<string, unknown>; playerIds: string[] }>({
    setup,
    playerIds: [],
  })
  useEffect(() => {
    newGameArgsRef.current = { setup, playerIds: players.map((p) => p.user_id) }
  })

  // The server state a swap is made AGAINST, captured at click time — see
  // `optimisticSwap`. A ref rather than a dep, so `doSwap` keeps its identity
  // across the realtime refetches that arrive between moves.
  useEffect(() => {
    const mine = playerStates.find((p) => p.user_id === session.user.id)
    serverStateRef.current = {
      board: mine?.board ?? game?.scramble ?? '',
      swaps: mine?.swaps_used ?? 0,
    }
  })
  const createNewGame = useCallback(async () => {
    // Starting a new game mid-play SHELVES this one (create_game clears the
    // club's current-view flag; it stays resumable from the club page). Confirm
    // anyway so an accidental `+` doesn't read as "I just lost my game" — the
    // copy says shelved, not ended. At terminal there's nothing to interrupt.
    if (!isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))) return
    if (!gameMode) return // menu exists pre-load, but there's no mode to copy yet
    const args = newGameArgsRef.current
    const res = await invokeStartGameEdgeFn(
      'waffle-build-board',
      {
        target_club: clubHandle,
        setup: args.setup,
        player_user_ids: args.playerIds,
        mode: gameMode,
      },
      brand,
    )
    if ('error' in res) {
      // New game is a FAULT SURFACE (serverError.ts → faultMessage): this setup
      // already built a game once, so anything that comes back is a bug or an
      // outage — never a pill. Copy supplies the words when it has them; the
      // real message survives otherwise (res.error is a classifiable CallError).
      showLocalFeedback(faultMessage(res.error, 'new game'))
      return
    }
    goToGame(`waffle_${gameMode}`, res.id)
  }, [gameMode, clubHandle, brand, goToGame, showLocalFeedback, confirmAction, isTerminal])

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

  // Reveal answer — TERMINAL ONLY, like every other game (docs/ui.md →
  // Terminal results). There used to be a mid-game shape as well: a give-up
  // that rewrote every `waffle.players.board` to the solution and ended the
  // game in one confirmed click. It's gone, so the order is the same
  // everywhere — End the game (which ends it for everyone), then Reveal — and
  // the FE display swap below covers what the board rewrite used to do,
  // without destroying the boards the players actually built.
  //
  // No handler of its own: showing the answer is `toggleAnswer`, a local state
  // flip that swaps the DISPLAYED board. No RPC, so no failure to classify.

  // Game menu: waffle now owns its FULL menu (Help + its own items + End/Concede +
  // Back to club) via `buildGameMenu`. Its own items are "Restart" (both
  // modes, any state), "New game" (same setup, fresh board + id — see
  // handleNewGame), and "Reveal answer" — offered once the game is over for
  // everyone, until the answer is already showing (a win's board IS the
  // solution, or somebody already asked).
  //
  // menuMode is derived up here (not the below-guard copy) so the effect can
  // pick coop End vs compete Concede. Every handler in the deps is a stable
  // useCallback (or a one-shot transition value like `isTerminal`), so this
  // effect only re-runs on real menu-affecting changes — never every render —
  // keeping the setState loop-free. (`myConceded` is derived at the top.)
  // Terminal-only: the solution doesn't reach a compete client before then, so
  // a player who conceded can't peek at a race still running.
  const menuMode: 'coop' | 'compete' = game?.mode === 'compete' ? 'compete' : 'coop'
  useEffect(() => {
    // "Print board (PDF)" — a snapshot at click time (docs/pdf.md). The server
    // already withholds a compete opponent's board AND their swaps until the
    // game ends, so what the viewer may see is what prints; the model refuses
    // the solution before terminal on top of that.
    const printModel = game
      ? buildWafflePrintModel({
          brand,
          gameTitle: title,
          date: new Date().toLocaleDateString(),
          mode: menuMode,
          isTerminal,
          maxSwaps: game.max_swaps,
          parSwaps: game.par_swaps,
          playerBoards: playerStates,
          swaps,
          players,
          selfId: session.user.id,
          // The six words, derived the same way the on-screen reveal derives
          // them: every word is fully green against the solution itself.
          solutionWords: game.solution
            ? (solvedWords(game.solution, computeColors(game.solution, game.solution))
                .filter((w): w is string => w !== null))
            : null,
          answerShown,
          setup: summaryRows,
        })
      : null
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: menuMode,
        isTerminal,
        conceded: myConceded,
        onEndGame: endGame,
        onConcede: concede,
        extra: [
          {
            items: [
              { id: 'restart', icon: IconRestart, label: 'Restart', onClick: restart },
              // Same setup + roster, a fresh randomly-built board, a NEW game id.
              { id: 'new-game', icon: IconNewGame, label: 'New game', shortcut: '+', onClick: () => void handleNewGame() },
              {
                id: 'reveal',
                // The same two faces as the terminal row's button — one toggle.
                // The View glyph, not EyeOff, once solving put it there — see
                // RevealButton for why the inert face keeps the plain eye.
                icon: answerShown && !impliedBySolve ? IconHideSolution : IconReveal,
                label: impliedBySolve
                  ? 'Solution already shown'
                  : answerShown
                    ? 'Hide answer'
                    : 'Reveal answer',
                disabled: !isTerminal || impliedBySolve,
                onClick: toggleAnswer,
              },
            ],
          },
          ...(printModel
            ? [{ items: [{ id: 'print', icon: IconPrint, label: 'Print board (PDF)', onClick: () => printWafflePdf(printModel) }] }]
            : []),
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [
    menu,
    menuMode,
    myConceded,
    endGame,
    concede,
    restart,
    handleNewGame,
    toggleAnswer,
    impliedBySolve,
    isTerminal,
    answerShown,
    // The print model's inputs — rebuilt whenever the printable state moves, so
    // the snapshot is current at click time.
    brand,
    title,
    game,
    playerStates,
    swaps,
    players,
    session.user.id,
    summaryRows,
  ])

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  const waffleSetup = setup as WaffleSetup

  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isPlayer = self !== undefined
  const isCompete = game.mode === 'compete'
  const swapsUsed = self?.swaps_used ?? 0
  const remaining = Math.max(0, game.max_swaps - swapsUsed)

  // `concededIds` marks a conceded opponent 'out' in the strip mid-game.
  // (`myConceded` — my own drop-out flag — is derived at the top.)
  const concededIds = new Set(players.filter((m) => m.conceded).map((m) => m.user_id))

  // Turn viewer: the historical board for the swap being viewed, or null when
  // live. Replayed from the scramble + swap log, colored on the FE.
  //
  // The log now carries EVERY player's swaps in compete (2026-08-02), and a
  // replay must apply only ONE player's — applying an opponent's transpositions
  // to my scramble would produce a board nobody ever saw. Whose is never in
  // doubt: the log makes `#N` clickable only when the rows on show are the
  // board's own (coop's shared game, or my own rows — the picker's
  // `boardIsShown`), so the replay list is exactly this.
  const replaySwaps = isCompete
    ? swaps.filter((sw) => sw.user_id === session.user.id)
    : swaps
  const snap =
    viewingIndex !== null
      ? turnSnapshot(game.scramble, game.solution, replaySwaps, viewingIndex)
      : null

  // The grid shows the caller's own board + live colors (including at game-over) — OR,
  // while viewing, the historical snapshot. After the MID-GAME "Reveal answer" the
  // caller's own board IS the solution (the RPC overwrote it), so that needs no
  // special case. The TERMINAL reveal is display-only: this viewer's own toggle
  // swaps the shown board for the (post-terminal, unshielded) solution, colored
  // all-green by the same FE colorizer the history viewer uses — waffle.players
  // is untouched, which is exactly why hiding again brings back the board the
  // players actually finished with.
  const revealSolution = answerShown && isTerminal ? game.solution : null
  const serverBoard = self?.board ?? game.scramble

  // The optimistic swap, still standing or already answered. It lasts exactly
  // as long as the server state it was made against: the instant either the
  // board or the swap count moves, the server has spoken (or a teammate has) and
  // the real board takes over. Derived rather than cleared, so there is no timer
  // to tune and no window where the overlay outlives its answer.
  //
  // BOTH tests are needed. Swapping two IDENTICAL letters leaves the board
  // string untouched, so only the count shows it landed; a teammate's swap in
  // coop moves the board without moving my count, and that board is newer than
  // my overlay either way. (That is also the one race here: a teammate landing
  // first drops my letters back for the rest of my round-trip. Coop-only — a
  // compete racer's board is nobody else's to touch — and it resolves itself.)
  const pendingSwap =
    optimisticSwap &&
    optimisticSwap.atBoard === serverBoard &&
    optimisticSwap.atSwaps === swapsUsed
      ? optimisticSwap.cells
      : null

  const board = snap
    ? snap.board
    : (revealSolution ??
      (pendingSwap ? swapCells(serverBoard, pendingSwap[0], pendingSwap[1]) : serverBoard))
  const colors = snap
    ? snap.colors
    : revealSolution
      ? computeColors(revealSolution, revealSolution)
      : pendingSwap && self?.colors
        ? unjudgeCells(self.colors, pendingSwap)
        : (self?.colors ?? null)

  // The answer reveal (info column) reads the caller's OWN live board + colors —
  // never the history snapshot, and mid-game never the shielded solution. A word all
  // of whose cells are green is already on the caller's screen, so revealing it leaks
  // nothing; unsolved words stay hidden (em dashes). A non-player watcher (no
  // colors) sees all-hidden. The terminal local reveal swaps in the solution here
  // too, so all six words fill in together with the board.
  const answerWords = solvedWords(
    revealSolution ?? self?.board ?? game.scramble,
    revealSolution ? computeColors(revealSolution, revealSolution) : (self?.colors ?? null),
  )

  const selfWon = (status?.winner_user_id as string | undefined) === session.user.id
  // Coop swaps for the win-vs-par verdict: coop rows are kept in lock-step, so
  // any row carries the group's count — falling back to row 0 keeps the label
  // honest for a non-player watcher (whose `self` is undefined).
  const coopSwapsUsed = (self ?? playerStates[0])?.swaps_used ?? 0
  const over = isTerminal
    ? buildOver({
        mode: game.mode,
        playState,
        timerExpired: timer.expired,
        selfWon,
        swapsOverPar: coopSwapsUsed - game.par_swaps,
      })
    : null

  // LOCALLY TERMINAL (compete only): the game continues but *I* can't act — I've
  // solved my board (waiting), run out of swaps, OR conceded (a real loss, the rest
  // race on). Shown with the terminal LOOK, not a quietly swapped help line.
  const selfDone = isPlayer && (self?.solved === true || remaining === 0 || myConceded)

  // The board is inert whenever I can't act OR I'm peeking at history. `!isMyTurn`
  // folds in turn-order (coop only): a waiting player's board freezes. Always true
  // for free-for-all / solo. Like wordle, waffle's `selfDone` "waiting" pill is
  // compete-only, so a waiting coop player sees only the inert board + the InfoCol
  // TurnStatusLine — no false "out of swaps".
  const readOnly = isTerminal || !isPlayer || selfDone || viewing || !isMyTurn

  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId` is
  // null in a free-for-all game, so this is false there — the pill's presence is
  // fixed for the game's life, no reflow.
  const waiting = currentTurnUserId !== null && !isMyTurn && !isTerminal

  // The below-board local pill. Precedence: the permanent terminal verdict → the
  // sticky locally-terminal "waiting" pill → the whose-turn pill (the ONLY
  // whose-turn indicator on mobile, where the InfoCol's TurnStatusLine is
  // off-canvas) → the transient own-move error. (While
  // viewing, BoardCol's history banner covers this region with the swap description.)
  const localPill: GenericFeedbackMsg | null = over
    ? terminalPill(over.tone, over.verdict)
    : selfDone
      ? outOfRacePill(
          myConceded,
          self?.solved ? 'Solved — waiting on the rest' : 'Out of swaps — waiting',
        )
      : waiting
        ? waitingTurnPill(players.find((m) => m.user_id === currentTurnUserId))
        : localFeedback

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        mobileStatus={
          <StateLine
            swapsUsed={swapsUsed}
            maxSwaps={game.max_swaps}
            remaining={remaining}
            parSwaps={game.par_swaps}
          />
        }
        board={board}
        colors={colors}
        readOnly={readOnly}
        highlight={snap?.highlight}
        viewingDescription={snap ? snap.description : null}
        onExitViewing={exitViewing}
        onSwap={handleSwap}
        pendingSwap={pendingSwap}
        notMyTurn={waiting}
        myTurnJustStarted={turnFlash}
        // The finished board wears its verdict: `over` is the same TerminalCopy
        // the below-board pill and the info-column line read, so the three can't
        // disagree about how this game went.
        gameOver={over ? over.tone : null}
        // The swaps behind the board on show — coop's shared log, or my own in
        // compete (`replaySwaps`, the same filtered list the history viewer
        // replays). A restart deletes these rows, which is exactly what tells
        // the flash that a re-dealt board was not played into existence.
        moveCount={replaySwaps.length}
        onDismissPill={clearLocalFeedback}
        localPill={localPill}
      />

      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
      <InfoCol
        isCompete={isCompete}
        over={over}
        isPlayer={isPlayer}
        selfDone={selfDone}
        myConceded={myConceded}
        currentTurnUserId={currentTurnUserId}
        selfSolved={self?.solved ?? false}
        swapsUsed={swapsUsed}
        maxSwaps={game.max_swaps}
        remaining={remaining}
        parSwaps={game.par_swaps}
        players={players}
        selfId={session.user.id}
        playerStates={playerStates}
        concededIds={concededIds}
        onEndGame={endGame}
        onConcede={concede}
        onRestart={restart}
        onRevealAnswer={toggleAnswer}
        answerShown={answerShown}
        answerAlreadyShown={impliedBySolve}
        onNewGame={handleNewGame}
        startingNewGame={startingNewGame}
        onBackToClub={goToClub}
        onRequestBackToClub={menu.requestBackToClub}
        setup={waffleSetup}
        setupRows={summaryRows}
        answerWords={answerWords}
        swaps={swaps}
        viewingIndex={viewingIndex}
        onSelectTurn={setViewingIndex}
      />
      </InfoSheet>

      {/* No modal for the verdict (docs/ui.md → Terminal results — waffle is
          where this treatment started): it's carried in-page (the below-board
          pill + the outcome line in the action row, with Restart right there),
          and a coop solve gets the celebration instead. */}
      {celebration.show && <CelebrationDialog title="Solved it! 🧇" onClose={celebration.close} />}
      {confirmDialog}
    </div>
  )
}

/**
 * Per-status terminal copy (the shared `TerminalCopy`), mode- and (compete)
 * self-aware. `tone` + `verdict` drive the below-board terminal pill; `tone` +
 * `message` drive the short bold info-column line (won = green, lost = red,
 * manual end = neutral).
 */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfWon,
  swapsOverPar,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfWon: boolean
  /** Swaps used minus par — the coop win verdict is golf-style ("Par +2"). */
  swapsOverPar: number
}): TerminalCopy {
  // Manual end (waffle.end_game) → 'ended' in either mode. Neutral result: nobody
  // won or lost; tone:'neutral' keeps the info-column line plain. Handled first so
  // an 'ended' game never falls through to a loss verdict. Deliberately NOT worded
  // here: manual end is the one terminal every game shares, so it stays in the
  // shared `endedCopy()` rather than drifting per game.
  if (playState === 'ended') return endedCopy(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      // Golf-style verdict: how the solve measured against par, not a generic
      // "Solved!" (the celebration dialog carries that moment). Par is the
      // generator's MINIMUM, so over-par is the norm and matching it is the
      // flex — "par!". Under par can't happen; rendered honestly if it ever does.
      // Prefixed `Won:` like every other terminal verdict — the par figure alone
      // reads as a score, not as "you won".
      const parVerdict =
        swapsOverPar === 0
          ? 'Won: par!'
          : swapsOverPar > 0
            ? `Won: par +${swapsOverPar}`
            : `Won: par −${-swapsOverPar}`
      return { verdict: parVerdict, message: parVerdict, tone: 'won' }
    }
    return {
      verdict: timerExpired ? 'Lost: out of time' : 'Lost: out of swaps',
      message: timerExpired ? 'Out of time' : 'Out of swaps',
      tone: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { verdict: 'Won: fewest swaps', message: 'You won!', tone: 'won' }
      : { verdict: 'Lost: beaten on swaps', message: 'Opponent won', tone: 'lost' }
  }
  // lost_compete — nobody solved, or time ran out. No `Lost:` prefix: nobody was
  // beaten, the board just ran out.
  return {
    verdict: timerExpired ? 'Out of time — no winner' : 'Nobody solved',
    message: timerExpired ? 'Out of time' : 'No winner',
    tone: 'lost',
  }
}
