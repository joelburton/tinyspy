import { useCallback, useEffect, useRef, useState } from 'react'
import type { GamePageCtx, GenericFeedbackMsg, GenericFeedbackTone } from '../../common/lib/games'
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
import { invokeStartGameEdgeFn } from '../../common/lib/game/manifestRpcs'
import { useDismissLocalFeedbackOnKey } from '../../common/hooks/feedback/useDismissLocalFeedbackOnKey'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, NEW_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { useStandardGameActions } from '../../common/hooks/game/useStandardGameActions'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { turnSnapshot } from '../lib/history'
import { computeColors } from '../lib/colors'
import { solvedWords } from '../lib/waffle'
import type { WaffleSetup } from '../lib/setup'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { StateLine } from './StateLine'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'
import { useSwallowTab } from '../../common/hooks/input/useSwallowTab'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'

/** Build waffle's own-action local pill: outline + TIMED (auto-clears after a
 *  beat — waffle's only own-move feedback is a rejected swap / failed End, a
 *  transient nudge). A pure msg-builder over the shared `useLocalFeedback`. */
const ownAction = (tone: GenericFeedbackTone, text: string): GenericFeedbackMsg => ({
  tone,
  text,
  variant: 'outline',
  dismiss: { kind: 'timed' },
})

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

  // Own-action feedback (LOCAL): a rejected swap or a failed End flashes in the
  // below-board slot — never the header pill (that's the peer/group channel).
  const { localFeedback, showLocalFeedback, clearLocalFeedback } = useLocalFeedback({ locked: isTerminal })
  // Any key is the player's next move → dismiss the own-move pill, even though
  // waffle has no keyboard entry (swaps are clicks). No-op at terminal (locked).
  useDismissLocalFeedbackOnKey(clearLocalFeedback)

  // ─── Turn-history viewer (coop only) ───────────────────
  // The shared coordination state: which swap-log row (by POSITION in the coop log)
  // is open on the board, or null = live. When set, PlayArea feeds BoardCol that
  // swap's historical snapshot + readOnly; BoardCol shows the yellow frame + banner
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
            tone: 'success',
            variant: 'outline',
            text: (
              <>
                <ActorDot actor={member} fallback="Someone" /> solved it
              </>
            ),
            dismiss: { kind: 'timed' },
          })
        } else if (out && !prev.out) {
          // Out of swaps is a milestone — important, neither clearly good nor bad → warning.
          globalFeedback.show({
            tone: 'warning',
            variant: 'outline',
            text: (
              <>
                <ActorDot actor={member} fallback="Someone" /> out of swaps
              </>
            ),
            dismiss: { kind: 'timed' },
          })
        }
      }
    },
    [playerStates, game, players, session.user.id, globalFeedback],
  )

  const handleSwap = useCallback(
    async (a: number, b: number) => {
      const { error } = await db.rpc('submit_swap', { target_game: gameId, pos_a: a, pos_b: b })
      // Own-action error → the local below-board flash. Success: the swap mutated
      // waffle.players → realtime refetch re-renders the board + colors.
      if (error) showLocalFeedback(ownAction('error', error.message))
    },
    [gameId, showLocalFeedback],
  )

  // Concede lives on the COMMON roster (ctx `players`), computed here (before the
  // handlers + the menu effect) so both can read it. Drives the shared trio's
  // concede guard, the menu's coop-End-vs-compete-Concede pick, the "You
  // conceded" copy, and the conceded-opponent 'out' marker below.
  const myConceded = players.find((m) => m.user_id === session.user.id)?.conceded ?? false

  // Post-game local answer reveal — set by the TERMINAL branch of
  // handleRevealAnswer (below), cleared by replay. Swaps the DISPLAYED board
  // for the solution; see the derivation past the loading guard.
  const [revealedLocally, setRevealedLocally] = useState(false)

  // ─── End / Concede / Replay — the shared trio ──────────
  // The byte-identical shared handlers (useStandardGameActions); waffle's own
  // bits are the `ownAction` failure pill, the replay sentence, and the
  // post-replay cleanup (leave the history view, clear the pill, re-hide a
  // locally-revealed answer). New game + Reveal answer stay below.
  const showError = useCallback(
    (m: string) => showLocalFeedback(ownAction('error', m)),
    [showLocalFeedback],
  )
  const onRestarted = useCallback(() => {
    exitViewing()
    clearLocalFeedback()
    setRevealedLocally(false) // the new run starts blind again
  }, [exitViewing, clearLocalFeedback])
  const { endGame, concede, restart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    myConceded,
    confirm: confirmAction,
    restartConfirm:
      "Restart? This clears everyone's progress and the turn log, and restarts from the original scramble.",
    showError,
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
      showLocalFeedback(ownAction('error', `New game failed: ${res.error}`))
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

  // Reveal answer — two shapes behind one action (the wordle pattern,
  // docs/ui.md → Terminal results):
  //   MID-GAME: give up — server-side `reveal_answer` overwrites every
  //   `waffle.players.board` with the solution (the board the players are
  //   looking at literally becomes the answer, all green) then ends the game
  //   as a neutral give-up (nobody wins). Confirmed since it ends the game for
  //   the whole group + wipes progress; the answer board + terminal state
  //   arrive via the realtime refetch.
  //   AT TERMINAL (a loss / manual end left words hidden): show THIS client
  //   the solution — no RPC, no confirm; post-terminal the solution is already
  //   on the client (coop always, compete unshields), so it's purely a display
  //   decision. Sets `revealedLocally` (declared above handleRestart, which
  //   clears it), which swaps the DISPLAYED board below.
  const handleRevealAnswer = useCallback(async () => {
    if (isTerminal) {
      setRevealedLocally(true)
      return
    }
    if (!window.confirm('Reveal the answer? This ends the game and fills the board with the solution.'))
      return
    const { error } = await db.rpc('reveal_answer', { target_game: gameId })
    if (error) {
      showLocalFeedback(ownAction('error', `Reveal failed: ${error.message}`))
      return
    }
    exitViewing()
    clearLocalFeedback()
  }, [isTerminal, gameId, showLocalFeedback, clearLocalFeedback, exitViewing])

  // Game menu: waffle now owns its FULL menu (Help + its own items + End/Concede +
  // Back to club) via `buildGameMenu`. Its own items are "Restart" (both
  // modes, any state), "New game" (same setup, fresh board + id — see
  // handleNewGame), and "Reveal answer". Reveal is offered MID-GAME only while
  // the caller actually holds the solution (compete shields it during play —
  // no leak: you can't reveal what wasn't sent; in practice coop-in-progress),
  // and AT TERMINAL until the answer is already showing (a win's board IS the
  // solution; the give-up RPC tagged status.outcome='revealed'; or this client
  // already clicked it).
  //
  // menuMode is derived up here (not the below-guard copy) so the effect can
  // pick coop End vs compete Concede. Every handler in the deps is a stable
  // useCallback (or a one-shot transition value like `isTerminal`), so this
  // effect only re-runs on real menu-affecting changes — never every render —
  // keeping the setState loop-free. (`myConceded` is derived at the top.)
  const solutionKnown = game?.solution != null
  const answerShown =
    revealedLocally || playState === 'won' || (status?.outcome as string | undefined) === 'revealed'
  const revealDisabled = isTerminal ? answerShown : !solutionKnown
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
          setup: [{ label: 'Extra swaps', value: String(game.max_swaps - game.par_swaps) }],
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
          ...infoSheet.menuSections,
          {
            items: [
              { id: 'restart', label: 'Restart', onClick: restart },
              // Same setup + roster, a fresh randomly-built board, a NEW game id.
              { id: 'new-game', label: 'New game', shortcut: '+', onClick: () => void handleNewGame() },
              {
                id: 'reveal',
                label: 'Reveal answer',
                disabled: revealDisabled,
                onClick: () => void handleRevealAnswer(),
              },
            ],
          },
          ...(printModel
            ? [{ items: [{ id: 'print', label: 'Print board (PDF)', onClick: () => printWafflePdf(printModel) }] }]
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
    handleRevealAnswer,
    isTerminal,
    revealDisabled,
    answerShown,
    infoSheet.menuSections,
    // The print model's inputs — rebuilt whenever the printable state moves, so
    // the snapshot is current at click time.
    brand,
    title,
    game,
    playerStates,
    swaps,
    players,
    session.user.id,
  ])

  if (loading) return <p>Loading game…</p>
  if (!game) return <p>Game not found.</p>

  const waffleSetup = setup as WaffleSetup
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isPlayer = self !== undefined
  const isCompete = game.mode === 'compete'

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
  // special case. The TERMINAL reveal is display-only: `revealedLocally` swaps the
  // shown board for the (post-terminal, unshielded) solution, colored all-green by
  // the same FE colorizer the history viewer uses — waffle.players is untouched.
  const revealSolution = revealedLocally && isTerminal ? game.solution : null
  const board = snap ? snap.board : (revealSolution ?? self?.board ?? game.scramble)
  const colors = snap
    ? snap.colors
    : revealSolution
      ? computeColors(revealSolution, revealSolution)
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

  const swapsUsed = self?.swaps_used ?? 0
  const remaining = Math.max(0, game.max_swaps - swapsUsed)

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
  // viewing, BoardCol's yellow banner covers this region with the swap description.)
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
        onRevealAnswer={() => void handleRevealAnswer()}
        revealDisabled={revealDisabled}
        onNewGame={handleNewGame}
        startingNewGame={startingNewGame}
        onBackToClub={goToClub}
        onRequestBackToClub={menu.requestBackToClub}
        setup={waffleSetup}
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
