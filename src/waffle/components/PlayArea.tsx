// cs-unmet

import { useCallback, useEffect, useRef, useMemo, useState } from 'react'
import { IconHideSolution } from '@/common/icons/icons'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { cls } from '@/common/utils/cls'
import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { buildWafflePrintModel } from '../pdf/model'
import { printWafflePdf } from '../pdf/printWafflePdf'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { setupRows } from '../lib/setupSummary'
import { runEdgeFn, runRpc } from '@/common/supabase/dbResult'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { useHistoryViewer } from '@/common/turn-log/useHistoryViewer'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { solvedByMe, useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { turnSnapshot } from '../lib/history'
import { computeColors } from '../lib/colors'
import { solvedWords, swapCells, unjudgeCells } from '../lib/waffle'
import type { WaffleSetup } from '../lib/setup'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { StateLine } from './StateLine'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import styles from './PlayArea.module.css'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { useSingleFlight } from '@/common/single-flight/useSingleFlight'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/** What `waffle.submit_swap` puts in `data` for a swap it took. Only `result` is
 *  read — the rest is deliberately ignored, because the new colors must reach
 *  every player together over realtime rather than reaching the swapper a round
 *  trip early (see `doSwap`). It is typed anyway: the fields exist on the wire,
 *  and a reader deserves to see what was declined rather than what was missing. */
type SwapAnswer = {
  result: 'swapped'
  colors: string
  swaps_used: number
  solved: boolean
  terminal: boolean
}

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
 * on the FE (see lib/history + lib/colors). See docs/playarea.md.
 *
 * **Feedback split** (docs/deferred.md → Feedback channels): the player's OWN
 * not-oks (a refused swap, a failed End) show in BoardCol's below-board slot; the
 * header's global slot carries PEER news — in compete, when an opponent solves
 * or runs out of swaps (coop needs none: the swap log already shows every move).
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
  globalFeedbackSlot,
  clubHandle,
  goToGame,
  menu,
}: GamePageCtx) {
  // The board is worked by clicks and typing, so Tab has nowhere to go here —
  // and an empty ring is what keeps it from walking out to the browser.
  useTabRing([])
  const { game, players: playerStates, swaps, loading, failure } = useGame(gameId)
  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (docs/pdf.md → Setup rows).
  const summaryRows = useMemo(
    () => setupRows(setup as unknown as WaffleSetup, game?.mode ?? 'coop', players, game?.par_swaps ?? 0),
    [setup, game, players],
  )

  // The below-board slot: a refused swap, a failed End, and the three standing
  // conditions further down — never the header (that's the peer channel).
  const localFeedbackSlot = useFeedbackSlot('local')
  // Any key is the player's next move → dismiss a gesture-cleared message,
  // even though waffle has no keyboard entry (swaps are clicks).
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // ─── Turn-history viewer (coop only) ───────────────────
  // The shared coordination state: which swap-log row (by POSITION in the coop log)
  // is open on the board, or null = live. When set, PlayArea feeds BoardCol that
  // swap's historical snapshot + readOnly; BoardCol shows the gray-blue frame + banner
  // and freezes input. Only coop can reach it (compete renders no swap log). Any key
  // returns to live: the hook binds `act-exit-viewer` itself, so nothing is wired here.
  const { viewingId: viewingIndex, viewing, select: setViewingIndex, exitViewing } =
    useHistoryViewer()

  // Mobile: below --mobile the board fills the screen and the whole info column
  // slides in as an off-canvas sheet from a "Game info" menu item (the shared
  // recipe — docs/mobile.md). Plain (not `wide`): waffle's info column is a narrow
  // 22rem readout + swap log, no multi-column word list. Desktop is untouched.
  const infoSheet = useInfoSheet()

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
          // A solve is a GOOD outcome → won (green) — the same green a found
          // word reads as in both modes (docs/ui.md → Feedback pill: the
          // outcome follows the event). Adverse to me in compete, but the
          // outcome names the event, not my stake.
          globalFeedbackSlot.show(FeedbackMessage.peerMilestone(member, 'won', 'solved it'))
        } else if (out && !prev.out) {
          // Out of swaps: neither clearly good nor bad → warning.
          globalFeedbackSlot.show(FeedbackMessage.peerMilestone(member, 'warning', 'out of swaps'))
        }
      }
    },
    [playerStates, game, players, session.user.id, globalFeedbackSlot],
  )

  // ─── A swap in flight ──────────────────────────────────
  // The move is shown at once; its verdict is not (plans/tile-feedback.md → "What
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
      const res = await runRpc<SwapAnswer>(
        db.rpc('submit_swap', { target_game: gameId, pos_a: a, pos_b: b }),
      )
      if (res.type === 'not-ok') {
        // Refused (the turn moved, the game ended, you conceded). Optimism is
        // about ACCEPTANCE, so this is the price: take the letters back, then
        // say why in the below-board slot, in the words the server sent.
        setOptimisticSwap(null)
        localFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      } else if (res.type === 'ok' && res.data.result === 'swapped') {
        // Accepted: leave the overlay standing. It clears when the server's own
        // board lands, which is the same moment the colors do.
        //
        // The rest of the payload — the new colors, the swap count, solved,
        // terminal — is ignored on purpose (see the comment above `doSwap`): the
        // colors must reach everyone together, over realtime. `result` is read
        // BECAUSE it is ignored, since an answer nobody inspects is an answer
        // that can change into something else without anyone noticing.
        return
      } else {
        // The overlay is waiting for a board that may never come, so drop it —
        // otherwise two letters sit swapped and colorless until a reload.
        setOptimisticSwap(null)
        reportUnhandled('submit_swap', res)
        return
      }
    },
    [gameId, localFeedbackSlot],
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
  // exactly why the reveal derives this rather than initializing from it.)
  const iSolved =
    playerStates.find((p) => p.user_id === session.user.id)?.solved === true
  const {
    revealed: answerShown,
    toggle: toggleAnswer,
    impliedBySolve,
  } = useSolutionReveal({
    impliedBy: solvedByMe({ isCompete: game?.mode === 'compete', playState, mine: iSolved }),
  })

  // ─── End / Concede / Replay — the shared trio ──────────
  // The byte-identical shared handlers (useStandardGameActions); waffle's own
  // bits are the replay sentence and the post-replay cleanup (leave the
  // history view, dismiss the last result, re-hide a locally-revealed
  // answer). New game + Reveal answer stay below.
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: game?.mode === 'compete' ? 'compete' : 'coop',
    myConceded,
    // Solved and waiting for the others: conceding would forfeit a win already
    // banked, so it goes gray and you leave via Back to club.
    selfSolved: playerStates.find((p) => p.user_id === session.user.id)?.solved ?? false,
    localFeedbackSlot,
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
    if (!gameMode) return // menu exists pre-load, but there's no mode to copy yet
    const args = newGameArgsRef.current
    const res = await runEdgeFn<CreatedGame>(
      'waffle-build-board',
      {
        target_club: clubHandle,
        setup: args.setup,
        player_user_ids: args.playerIds,
        mode: gameMode,
      },
    )
    if (res.type === 'not-ok') {
      // THE SAME ENVELOPE, READ DIFFERENTLY. On the setup form a validation is
      // an answer — fix the field and press Start again. Here there is no field
      // and no form, so whatever came back goes in the slot as it reads, over
      // the verdict, until its × is pressed. Shown even for a fault whose
      // modal has already fired centrally — the modal escalates, it does not
      // replace (docs/envelopes.md), so dismissing it must not leave the board
      // silent about why the game didn't start.
      //
      // This is one of only two New Game buttons where a `form-validation` can
      // genuinely arrive rather than a fault: `waffle-build-board` answers PN121
      // when the generator gives up at that difficulty. It reads in the slot,
      // which is what its raise site asked for — there is no field here to put
      // it under.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToGame(`waffle_${gameMode}`, res.data.id)
      return
    } else {
      reportUnhandled('waffle-build-board', res)
      return
    }
  }, [gameMode, clubHandle, goToGame, localFeedbackSlot])

  // New game — its `+`, its menu row and its terminal button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play (an accidental `+` should not
  // read as "I just lost my game" — the copy says shelved, not ended) and goes
  // straight through at terminal; the shared run's single flight is what stops
  // a second press building a second board.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    describe: () => 'active',
    run: createNewGame,
  })

  // Reveal the answer — a LOCAL display toggle: it swaps the board shown, writes
  // nothing, and affects no peer. Its two faces are what `describe` is for, the
  // glyph moving with the words because the button is icon-only. Terminal-only:
  // the solution doesn't reach a compete client before then, so a player who
  // conceded can't peek at a race still running.
  const actReveal = useBoundAction('act-reveal', {
    describe: () => {
      if (impliedBySolve) return { state: 'disabled', label: 'Solution already shown' }
      if (answerShown) return { state: 'active', label: 'Hide answer', icon: IconHideSolution }
      // Named in the inert case too: the registry's bare "Reveal" would make the
      // row change its words as the game ended, which is not what it says.
      return isTerminal
        ? { state: 'active', label: 'Reveal answer' }
        : { state: 'disabled', label: 'Reveal answer', tooltip: "Can't reveal until all end" }
    },
    run: toggleAnswer,
  })

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

  // Print the board — a snapshot at CLICK time (docs/pdf.md), so the menu needn't
  // rebuild as the board moves. The server already withholds a compete
  // opponent's board AND their swaps until the game ends, so what the viewer may
  // see is what prints; the model refuses the solution before terminal on top of
  // that.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (game ? 'active' : 'hidden'),
    run: () => {
      if (!game) return
      printWafflePdf(
        buildWafflePrintModel({
          brand,
          gameTitle: title,
          date: new Date().toLocaleDateString(),
          mode: game.mode === 'compete' ? 'compete' : 'coop',
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
        }),
      )
    },
  })

  // The FULL waffle menu. `buildGameMenu` supplies the framing (Help + chat
  // above, Back to club below); the middle is this game's own rows, each one a
  // binding it already made — so a row's words, glyph, key and availability come
  // from the action rather than being typed here a second time. The effect
  // re-runs only when the SHAPE changes, which is why every dep is stable.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that
        // isn't its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          { items: [actRestart, actNewGame, actReveal] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actRestart, actNewGame, actReveal, actPrintBoard])

  // ─── The three standing conditions of the local slot ───
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — the slot draws whichever ranks highest. Above the early
  // returns because effects must be.
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isPlayer = self !== undefined
  const swapsUsed = self?.swaps_used ?? 0
  const remaining = Math.max(0, (game?.max_swaps ?? 0) - swapsUsed)

  // The terminal message, memoized on primitives so the verdict effect sees
  // one object per outcome. Coop swaps for the win-vs-par verdict: coop rows
  // are kept in lock-step, so any row carries the group's count — falling
  // back to row 0 keeps the label honest for a non-player watcher (whose
  // `self` is undefined).
  const selfWon = (status?.winner_user_id as string | undefined) === session.user.id
  const swapsOverPar = ((self ?? playerStates[0])?.swaps_used ?? 0) - (game?.par_swaps ?? 0)
  const timerExpired = timer.expired
  const over = useMemo(
    () =>
      isTerminal && gameMode
        ? buildOver({ mode: gameMode, playState, timerExpired, selfWon, swapsOverPar })
        : null,
    [isTerminal, gameMode, playState, timerExpired, selfWon, swapsOverPar],
  )
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  // LOCALLY TERMINAL (compete only): the game continues but *I* can't act —
  // I've solved my board (waiting), run out of swaps, OR conceded (a real
  // loss, the rest race on). Shown with the terminal LOOK, not a quietly
  // swapped help line. Like wordle, this is compete-only, so a waiting coop
  // player sees only the inert board + the whose-turn note — no false "out
  // of swaps".
  const selfSolved = self?.solved === true
  const selfDone = isPlayer && (selfSolved || remaining === 0 || myConceded)
  useEffect(function showOutOfRace() {
    if (!selfDone) return
    const id = localFeedbackSlot.show(
      FeedbackMessage.outOfRace(
        myConceded,
        selfSolved ? 'Solved — waiting on the rest' : 'Out of swaps — waiting',
      ),
    )
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, selfDone, myConceded, selfSolved])

  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId`
  // is null in a free-for-all game, so this never fires there. On a phone the
  // InfoCol's TurnStatusLine is off-canvas, so this is the only whose-turn
  // indicator beside the dimmed board.
  const waiting = currentTurnUserId !== null && !isMyTurn && !isTerminal
  const turnHolder = players.find((m) => m.user_id === currentTurnUserId)
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

  if (loading) return <p>Loading game…</p>
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "Game not found." about a dead connection is a confident wrong answer —
  // this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  if (!game) return <p>Game not found.</p>

  const waffleSetup = setup as WaffleSetup

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

  // The board is inert whenever I can't act OR I'm peeking at history. `!isMyTurn`
  // folds in turn-order (coop only): a waiting player's board freezes. Always true
  // for free-for-all / solo.
  const readOnly = isTerminal || !isPlayer || selfDone || viewing || !isMyTurn

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
        // The finished board wears its verdict: `over` is the same
        // TerminalMessage the below-board verdict and the info-column line
        // read, so the three can't disagree about how this game went.
        gameOver={over ? over.outcome : null}
        // The swaps behind the board on show — coop's shared log, or my own in
        // compete (`replaySwaps`, the same filtered list the history viewer
        // replays). A restart deletes these rows, which is exactly what tells
        // the flash that a re-dealt board was not played into existence.
        moveCount={replaySwaps.length}
        // (While viewing, BoardCol's history banner covers the slot's region
        // with the swap description.)
        localFeedbackSlot={localFeedbackSlot}
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
        actEndGame={actEndGame}
        actConcede={actConcede}
        actRestart={actRestart}
        actReveal={actReveal}
        actNewGame={actNewGame}
        actBackToClub={menu.actBackToClub}
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
      {celebration.show && <CelebrationBlockingModal title="Solved it! 🧇" onClose={celebration.close} />}
    </div>
  )
}

/**
 * The per-status terminal message (the shared `TerminalMessage`), mode- and
 * (compete) self-aware. `outcome` + `pillText` are the below-board verdict;
 * `outcome` + `infoColText` the short bold info-column line (won = green,
 * lost = red, manual end = neutral).
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
}): TerminalMessage {
  // Manual end (waffle.end_game) → 'ended' in either mode. Neutral result:
  // nobody won or lost; outcome 'neutral' keeps the info-column line plain.
  // Handled first so an 'ended' game never falls through to a loss verdict.
  // Deliberately NOT worded here: manual end is the one terminal every game
  // shares, so it stays in the shared `gameEndedTerminalMessage()` rather
  // than drifting per game.
  if (playState === 'ended') return gameEndedTerminalMessage(mode)
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
      return { pillText: parVerdict, infoColText: parVerdict, outcome: 'won' }
    }
    return {
      pillText: timerExpired ? 'Lost: out of time' : 'Lost: out of swaps',
      infoColText: timerExpired ? 'Out of time' : 'Out of swaps',
      outcome: 'lost',
    }
  }
  // compete
  if (playState === 'won_compete') {
    return selfWon
      ? { pillText: 'Won: fewest swaps', infoColText: 'You won!', outcome: 'won' }
      : { pillText: 'Lost: beaten on swaps', infoColText: 'Opponent won', outcome: 'lost' }
  }
  // lost_compete — nobody solved, or time ran out. No `Lost:` prefix: nobody was
  // beaten, the board just ran out.
  return {
    pillText: timerExpired ? 'Out of time — no winner' : 'Nobody solved',
    infoColText: timerExpired ? 'Out of time' : 'No winner',
    outcome: 'lost',
  }
}
