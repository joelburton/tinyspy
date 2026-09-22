// cs-met-wordle

import { runRpc } from '@/common/supabase/dbResult'
import { useEffect, useMemo } from 'react'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { buildWordlePrintModel } from '../pdf/model'
import { printWordlePdf } from '../pdf/printWordlePdf'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { answerMessage, peerAnswerMessage } from '../lib/answer'
import { setupRows } from '../lib/setupSummary'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { describeReveal } from '@/common/reveal/describeReveal'
import { solvedByMe, useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'
import { db } from '../db'
import { useGame, type WordleGame, type WordlePlayerState, type EventRow } from '../hooks/useGame'
import { historySnapshot } from '../lib/history'
import type { WordleSetup } from '../lib/setup'
import { memberById } from '@/common/members/memberList'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { cls } from '@/common/utils/cls'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import { Loading } from '@/common/loading/Loading'
import { NoSuchGamePage } from '@/common/game-page/NoSuchGamePage'
import styles from './PlayArea.module.css'
import '../theme.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * wordle's play surface, shared by the coop and compete manifests. The thin
 * COORDINATOR of the two columns: it owns the game data (`useGame`), the below-board
 * feedback channel (both columns write it), the turn-history viewer, the peer
 * narration, and the cross-column derivations — then hands each column what it needs.
 *
 *   - `<BoardCol>` — the board + on-screen keyboard: the input engine (the pending
 *     guess + `submit_guess`, whose result arrives by realtime rather than as
 *     local state). See BoardCol.tsx.
 *   - `<InfoCol>` — the guess counter + guess list + action row + setup. Presentational.
 *
 * Mode (`game.mode`) branches the derivations: coop shows the SHARED guess list +
 * team budget; compete shows only the caller's own guesses (RLS hides opponents) plus
 * an OpponentStrip of their guess counts.
 */
/** Every wordle answer is five letters — the board renders a fixed 5 columns
 *  (Board.tsx) and the word lists are 5-letter. Named here so the printed grid
 *  and the on-screen one can't disagree. */
const WORD_LENGTH = 5

/**
 * The GATES, and nothing else: the read, the three answers it can come back
 * with, and the one narrowing of `setup`. Splitting them off is what lets
 * `<PlayArea>` below start with a game in hand — no `game?.`, no `?? 'coop'`,
 * no guard inside a handler for a row that cannot be missing by then.
 */
export function PlayAreaLoader(ctx: GamePageCtx) {
  const { game, players: playerStates, guesses, loading, failure } = useGame(ctx.gameId)

  if (loading) return <Loading />
  // A failed read is NOT a missing game. Both leave `game` null, and saying
  // "there's no game here" about a dead connection is a confident wrong answer
  // — this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // Reaching this means the COMMON row exists — `GamePageGate` and
  // `GamePageLoader` each checked — and wordle's does not: a torn write, or a
  // game deleted while somebody had the board open. `detail` goes to the
  // console, never to the page.
  if (!game) return <NoSuchGamePage detail={`rows=0 view=wordle.games_state game=${ctx.gameId}`} />

  return (
    <PlayArea
      {...ctx}
      game={game}
      playerStates={playerStates}
      guesses={guesses}
      // The one place the setup blob is narrowed. `GamePageCtx` types it
      // `Record<string, unknown>` for every game; below, it is this game's.
      setup={ctx.setup as unknown as WordleSetup}
    />
  )
}

type PlayAreaProps = Omit<GamePageCtx, 'setup'> & {
  // The loaded game row. Non-null by construction — the loader holds the gates.
  game: WordleGame
  // Per-player guess counts and solved flags (`wordle.players_state`).
  playerStates: WordlePlayerState[]
  // The guess log, oldest first.
  guesses: EventRow[]
  // This game's setup, narrowed once by the loader.
  setup: WordleSetup
}

export function PlayArea({
  session,
  gameId,
  brand,
  title,
  players: members,
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
  game,
  playerStates,
  guesses,
}: PlayAreaProps) {
  const mode = game.mode

  // The guess is typed at the window rather than into an input, so nothing here
  // takes focus and Tab has nowhere to go; an empty ring keeps it from walking
  // out to the browser. (The on-screen keyboard's caps are clicks, not stops.)
  useTabRing([])

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (common/setup-form/doc.md → Setup rows).
  const summaryRows = useMemo(
    () => setupRows(setup, mode, members),
    [setup, mode, members],
  )

  // Mobile (docs/mobile.md → the psychicnum recipe): below the breakpoint the
  // board + keyboard fill the screen and the info column moves into an off-canvas
  // <InfoSheet>, reached by the header's page switch. Desktop is
  // unchanged. wordle's one divergence — the board caps its height so the
  // keyboard always fits — lives in Board.module.css, not here.
  const infoSheet = useInfoSheet()

  // The local feedback slot — the fixed-height slot between the board and the
  // keyboard. A soft reject or an RPC not-ok is shown into it by BoardCol, the
  // End / Concede races by InfoCol's actions, and the three standing
  // conditions below are effects on it. Accepted guesses get NO message — the
  // colored row that lands IS the feedback.
  const localFeedbackSlot = useFeedbackSlot('local')

  // ─── Turn-history viewer ───────────────────────────────
  // Click an event-log #N to replay that turn's board (the guess rows up to that turn,
  // with that turn's row ringed in the history blue), addressed by the row's id. Exit is
  // intrinsic to the hook (a click anywhere / the banner ✕); a keystroke also exits —
  // BoardCol freezes its capture while viewing, so the viewer's own any-key
  // action (bound by the hook) has the keys to itself.
  const { isViewingHistory, historyId, historyN, showHistory, exitHistory } =
    useHistoryViewer<number>()

  // ─── Coop-win celebration ──────────────────────────────
  // Confetti at the MOMENT the team solves it (the winning guess flips
  // playState to 'won' on every connected client via realtime); opening an
  // already-won game stays quiet (useCelebration never pops on mount). Gated on
  // playState ALONE — it's coop-only by the states vocabulary (compete writes
  // 'won_compete') and, unlike anything read from useGame, correct from the
  // very first render (the waffle loading-race lesson).
  const celebration = useCelebration(playState === 'won')

  // ─── The turn arriving (turn-order coop) ───────────────
  // The board frame flashes yellow the moment the move becomes mine. The board
  // dimming says "not yours"; its lifting is a removal, and a removal is a poor
  // signal — you have been waiting, so you are looking somewhere else when it
  // happens. Never fires in a free-for-all game (`isMyTurn` is permanently true
  // there), so it needs no mode gate.
  const turnFlash = useTurnStartFlash(isMyTurn)

  // ─── Derived (null-safe; real values after the loading guard) ──
  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isCompete = mode === 'compete'
  const maxGuesses = game.max_guesses
  const guessesUsed = self?.guesses_used ?? 0
  const mySolved = self?.solved ?? false

  // ─── The word shows only when I ask for it — unless I solved it ────
  // The ask is LOCAL and reversible (useSolutionReveal): my looking doesn't open
  // the word on my opponent's screen while they're still turning it over, and
  // hiding it again costs a click, not a Restart. The target itself is on every
  // client once the game is terminal (wordle._target_for gates on is_terminal),
  // so this is purely what's drawn.
  //
  // `impliedBy: mySolved` is the exception: you can only finish a wordle by
  // typing the answer, so a solver is already looking at it and the info-column
  // line is just the same word made click-to-define. MY solve, not the game's
  // verdict — compete writes `won_compete` when SOMEONE wins, and the racer who
  // was three guesses off never produced the word.
  const {
    revealed: answerShown,
    toggle: toggleAnswer,
    impliedBySolve,
  } = useSolutionReveal({
    impliedBy: solvedByMe({ isCompete, playState, mine: mySolved }),
  })
  // Concede lives on the common roster (ctx `members`), not wordle.players.
  const myConceded = members.find((m) => m.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(members.filter((m) => m.conceded).map((m) => m.user_id))
  // Coop: the shared board. Compete: my own guesses (RLS-filtered).
  const myGuesses = isCompete
    ? guesses.filter((g) => g.user_id === session.user.id)
    : guesses

  // ─── Coop peer-guess narration (global header) ─────────────────
  // A teammate's ACCEPTED guess is narrated in the GamePage header: "● moth guessed
  // CRANE", in the row's own outcome (`neutral` for an ordinary guess, `won` for the
  // one that solves it) with their identity dot. Only accepted guesses reach here —
  // `wordle.events` holds nothing else (a soft reject writes no row). My own guesses
  // are excluded (they land on the shared board). Compete never narrates a guess: RLS
  // scopes the log to the caller, and we gate on coop besides. The shared hook's
  // seen-set (not "the last row") is what handles two coop players' rows arriving
  // interleaved.
  usePeerFeedback({
    enabled: mode === 'coop',
    items: guesses,
    keyOf: (g) => String(g.id),
    messageFor: (g) => {
      if (g.user_id === session.user.id) return null // mine → board, no narration
      const member = memberById(members, g.user_id)
      // The row is somebody else's — the line above returned for my own — so
      // its answer is the `_peer` one.
      const { outcome, text } = peerAnswerMessage(g)
      return FeedbackMessage.peer(member, outcome, text)
    },
    globalFeedbackSlot,
  })

  // ─── Compete opponent-solve narration (global header) ──────────
  // In compete, RLS hides opponents' guesses, so the only peer event we can surface is
  // a SOLVE (the public `players.solved` flag flips): "● moth solved it". It wears the
  // word a solving guess wears anywhere — a solve is a solve regardless of whose it is;
  // the OUTCOME follows the event, not my competitive stake (docs/ui.md → Feedback
  // pill, "Outcome follows the event, not the viewer's stake"). My own
  // solve is excluded (covered by the terminal feedback). `solvedIds` is memoized so
  // the hook re-runs only when it changes.
  const solvedIds = useMemo(
    () => playerStates.filter((p) => p.solved).map((p) => p.user_id),
    [playerStates],
  )
  usePeerFeedback({
    enabled: mode === 'compete',
    items: solvedIds,
    keyOf: (id) => id,
    messageFor: (id) => {
      if (id === session.user.id) return null // my own solve → terminal handling
      const member = memberById(members, id)
      const { outcome, text } = answerMessage({ answerType: 'solved_peer' })
      return FeedbackMessage.peerMilestone(member, outcome, text)
    },
    globalFeedbackSlot,
  })

  // ─── The three standing conditions of the local slot ───
  // Each is an effect on a primitive edge that shows on true and retracts in
  // its cleanup — the slot draws whichever ranks highest. Above the early
  // returns because effects must be.

  // The per-status terminal message. Memoized on its inputs so the verdict
  // effect sees one object per outcome, not one per render. The compete
  // tie-break is inferred here (no backend flag needed): the server picks the
  // winner by fewest guesses, then earliest solved_at, so if any OTHER solver
  // used the same guess count as the winner, the clock broke the tie.
  const winnerId = status?.winner_user_id as string | undefined
  const selfWon = winnerId === session.user.id
  const winnerState = playerStates.find((p) => p.user_id === winnerId)
  const wonByClock =
    !!winnerState &&
    playerStates.some(
      (p) =>
        p.user_id !== winnerId &&
        p.solved &&
        p.guesses_used === winnerState.guesses_used,
    )
  // Did the viewer lose specifically on the clock (tied the winner's guess
  // count but solved later)?
  const selfTiedWinner =
    !selfWon &&
    !!self &&
    self.solved &&
    !!winnerState &&
    self.guesses_used === winnerState.guesses_used
  const over = useMemo(
    () =>
      isTerminal
        ? buildOver({ mode, playState, timerExpired: timer.expired, selfWon, wonByClock, selfTiedWinner })
        : null,
    [isTerminal, mode, playState, timer.expired, selfWon, wonByClock, selfTiedWinner],
  )
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  // Locally terminal (compete only): I'm done — solved, or out of my own
  // guesses, or conceded — but the game continues for the others still racing.
  // Coop has no such state (one shared board: over for me ⇒ over for everyone).
  // Solving is the GOOD way to be done: compete is won by fewest guesses,
  // decided when everyone finishes, so a solver may well be winning, and the
  // default "Lost — race continues" would be flatly wrong for them.
  const isLocallyDone =
    !isTerminal && isCompete && (mySolved || guessesUsed >= maxGuesses || myConceded)
  // May I still submit? Gates the help line and the row's line; read by the
  // Reveal binding, so its button and its menu row agree.
  const showInput = !isTerminal && !isLocallyDone
  useEffect(function showOutOfRace() {
    if (!isLocallyDone) return
    const id = localFeedbackSlot.show(
      FeedbackMessage.outOfRace(myConceded, mySolved ? 'Solved — waiting on the rest' : 'Out of guesses — waiting'),
    )
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isLocallyDone, myConceded, mySolved])

  // Turn-order (coop, opt-in): a teammate holds the move. `currentTurnUserId`
  // is null in a free-for-all game, so this never fires there. The holder is
  // read as two primitives so the effect settles in one pass.
  const waiting = currentTurnUserId !== null && !isMyTurn && !isTerminal
  const turnHolder = currentTurnUserId === null ? undefined : memberById(members, currentTurnUserId)
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

  // ─── End / Concede / Replay — the shared trio ──────────
  // The byte-identical shared handlers (useStandardGameActions); wordle's own
  // bits are the replay sentence and the post-replay cleanup (leave the
  // history view, dismiss a lingering result — a restart is the player's next
  // action; the verdict leaves by its own effect). New game + Reveal solution
  // stay below — their paths diverge (new game is a direct create_game).
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: isCompete ? 'compete' : 'coop',
    myConceded,
    // Solved and waiting for the others: conceding would forfeit a win already
    // banked, so it goes gray and you leave via Back to club.
    selfSolved: solvedIds.includes(session.user.id),
    localFeedbackSlot,
  })

  // Reveal the answer — a LOCAL display toggle: it shows the word to me alone,
  // writes nothing, and affects no peer. Terminal-only, since the target does
  // not reach the client until the game is over for everyone
  // (wordle._target_for), so a player who dropped out early can't peek at a
  // live race; inert too once solving has already put the word on screen. Both
  // faces come from `describeReveal`, which is where the rule for every game's
  // reveal lives.
  const actReveal = useBoundAction('act-reveal', {
    describe: (asker) => {
      // The one narrowing this game adds: no BUTTON while you can still play.
      // The menu row keeps it all game, grayed, because it NAMES the glyph
      // (docs/ui.md → the menu is the legend).
      if (showInput && asker === 'button') return 'hidden'
      return describeReveal({ noun: 'solution', revealed: answerShown, impliedBySolve, isTerminal })
    },
    run: toggleAnswer,
  })

  // New game — a FRESH game (new id, new random target) with THIS game's
  // setup + roster + mode, in the same club (waffle's "same again!" feature).
  // wordle's create_game is a direct RPC — no edge function; picking a random
  // target is one SQL line — so this mirrors the manifest's startGameInClub.
  // Non-destructive (common.create_game un-currents this game into the club
  // list), so no confirm; the creator jumps in via ctx.goToGame, peers arrive
  // via the game-invitation toast.
  //
  // A plain function, rebuilt every render: the binding below reads it at click
  // time, so `setup` and `members` are whatever the last realtime refetch left,
  // and the action's own identity doesn't move when they do.
  async function createNewGame() {
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        // ctx.setup is Record<string,unknown> at the shell level; this game's
        // rows were created from a WordleSetup, so the cast is the usual
        // per-game narrowing (docs/common.md → GamePageCtx.setup).
        setup,
        player_user_ids: members.map((m) => m.user_id),
        mode,
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
      //
      // Unlike waffle's, everything this can answer is a FAULT — wordle's
      // create_game raises no form-validation at all, since every value it
      // refuses is one no control offers. PN057 was the last exception and
      // became a fault on 2026-08-30.
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToGame(`wordle_${mode}`, res.data.id)
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
  // second press dealing a second word.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    // Reachable all game from the menu and `+` — NEW_GAME_CONFIRM is written
    // for that ("will be shelved, not lost", "Keep playing"). A BUTTON only at
    // the end, where the next game is what you came to the row for.
    describe: (asker) => (asker === 'button' && !isTerminal ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Reveal solution — TERMINAL ONLY, like every other game (docs/ui.md →
  // Terminal results): the order is the same everywhere — End the game (which
  // ends it for everyone), then Reveal. No irreversible thing sits behind a
  // menu item that reads like a display toggle, and no path can reveal while
  // somebody is still playing.
  //
  // No handler of its own any more: showing the word is `toggleAnswer`, a
  // local state flip. No RPC, so no failure to classify, and no `async` — the
  // button and the menu item both call it directly.

  // Print the board — a snapshot at CLICK time (common/pdf/doc.md). RLS already scopes
  // `guesses` to what the viewer may see (own only in compete until terminal),
  // and the model refuses to print the target before terminal, so neither the
  // boards nor the answer can leak onto paper early.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printWordlePdf(
        buildWordlePrintModel({
          brand,
          gameTitle: title,
          date: new Date().toLocaleDateString(),
          mode,
          isTerminal,
          maxGuesses,
          wordLength: WORD_LENGTH,
          guesses,
          players: members,
          selfId: session.user.id,
          target: game.target,
          answerShown,
          solvedBy: new Set(solvedIds),
          setup: summaryRows,
        }),
      )
    },
  })

  // The FULL wordle menu. `buildGameMenu` supplies the framing (Help + chat
  // above, Back to club below); the middle is this game's own rows, each one a
  // binding it already made — so a row's words, glyph, key and availability come
  // from the action rather than being typed here a second time. Reveal wears the
  // same two faces here as on the terminal button, because it IS that binding.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        // Both exits, in reading order; each hides itself in the mode that isn't
        // its own, so this list is the same in coop and compete.
        exits: [actConcede, actEndGame],
        extra: [
          // The same three the terminal action row offers, reachable mid-game
          // too — Reveal grayed until the game is over.
          { items: [actReveal, actRestart, actNewGame] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actRestart, actNewGame, actReveal, actPrintBoard])

  const rows = myGuesses.map((g) => ({ guess: g.guess, colors: g.colors }))

  // When a past turn is open, `historySnap` is that turn's board (the guess rows
  // up to it, the last one ringed); else null = live.
  //
  // WHOSE board it replays is the row's own author's. Mid-game compete that is
  // always me — RLS shows me nothing else — but at TERMINAL every player's rows
  // arrive, and a `#N` on one of theirs replays THEIR board: six rows of
  // somebody else's game, which is the whole point of opening it. Coop is one
  // shared board, so the filter is a no-op there.
  const historyRow = historyId !== null ? guesses.find((g) => g.id === historyId) : undefined
  const historyRows =
    isCompete && historyRow
      ? guesses.filter((g) => g.user_id === historyRow.user_id)
      : guesses
  const historySnap =
    isViewingHistory && historyId !== null
      ? historySnapshot(historyRows, historyId, historyN)
      : null
  // Named only when the board on screen is not the viewer's own — which only
  // compete can be. Coop is one shared board, so a teammate's row replays the
  // board you are already looking at.
  const historyActor =
    isCompete && historyRow && historyRow.user_id !== session.user.id
      ? memberById(members, historyRow.user_id)
      : undefined

  // The GAME-STATE half of the board gate — BoardCol ORs in its own mid-submit
  // state. `readOnly` (glossary): the board is inert when there's no self row, the
  // game's terminal, I've solved / conceded, or I'm out of guesses. (De Morgan of
  // the old positive `guessingAllowed`.)
  // `!isMyTurn` folds in turn-order (coop only): a waiting player's board is
  // inert. Always true for free-for-all / solo, so it only tightens a turn
  // game. Unlike psychicnum, wordle has no coop "locally done" look
  // (isLocallyDone is compete-only), so a waiting coop player sees no false
  // "out" — just the disabled keyboard + the whose-turn note below.
  const readOnly =
    !self || isTerminal || mySolved || myConceded || guessesUsed >= maxGuesses || !isMyTurn


  // The verdict in the slot is the terse verdict ALONE. The answer is NOT
  // folded in — the pill is a one-line, ellipsizing row (~48 chars on a phone)
  // and the word has its own home in the info column's terminalExtra ("The
  // answer was CRANE", click-to-define), so duplicating it there only crowded
  // out the verdict.

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        // ── Board to render (live rows + the history snapshot) ──
        rows={rows}
        historySnap={historySnap}
        historyActor={historyActor}
        maxGuesses={game.max_guesses}
        brand={brand}
        // ── History viewer ──
        onExitHistory={exitHistory}
        // ── Guess dispatch (BoardCol owns submit_guess) ──
        gameId={gameId}
        readOnly={readOnly}
        // ── The below-board slot: BoardCol shows rejects into it and draws it ──
        localFeedbackSlot={localFeedbackSlot}
        // ── Board-scope marks ──
        // The finished board wears its verdict, and the keyboard goes with it:
        // `over` is the same terminal message the slot shows, so the two can't
        // disagree about how this game went.
        gameOver={over ? over.outcome : null}
        notMyTurn={waiting}
        myTurnJustStarted={turnFlash}
      />
      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
        // ── Mode + phase ──
        isCompete={isCompete}
        isTerminal={isTerminal}
        over={over}
        showInput={showInput}
        myConceded={myConceded}
        isPlayer={!!self}
        currentTurnUserId={currentTurnUserId}
        // ── State ──
        guessesUsed={guessesUsed}
        maxGuesses={maxGuesses}
        // ── Opponent strip (compete) ──
        players={members}
        selfId={session.user.id}
        playerStates={playerStates}
        concededIds={concededIds}
        // ── Action row — the same bindings, in the order the menu lists them ──
        actReveal={actReveal}
        actRestart={actRestart}
        actNewGame={actNewGame}
        actConcede={actConcede}
        actEndGame={actEndGame}
        actBackToClub={menu.actBackToClub}
        // ── Setup disclosure ──
        setup={setup}
        setupRows={summaryRows}
        // ── Terminal answer reveal (null while hidden — incl. on a loss) ──
        solution={answerShown ? game.target : null}
        // ── Event log ──
        guesses={guesses}
        mode={game.mode}
        historyId={historyId}
        onShowHistory={showHistory}
        />
      </InfoSheet>

      {/* No modal carries the verdict (the waffle treatment — docs/ui.md →
          Terminal results): it's in-page, on the below-board pill + the
          action-row outcome line, and a coop solve gets the celebration
          instead. */}
      {celebration.show && <CelebrationBlockingModal title="Solved! 🎉" onClose={celebration.close} />}
    </div>
  )
}

/**
 * Per-status terminal message. `outcome` + `pillText` are the below-board
 * verdict; `outcome` + `infoColText` are the short, color-coded info-column
 * outcome line. Mode- and (compete) self-aware.
 */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfWon,
  wonByClock,
  selfTiedWinner,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfWon: boolean
  /** The winner tied another solver on guesses → the clock decided it. */
  wonByClock: boolean
  /** The viewer lost specifically on the clock (tied the winner's count). */
  selfTiedWinner: boolean
}): TerminalMessage {
  // Manual end (wordle.end_game) → the shared neutral message. Deliberately
  // NOT worded here: manual end is the one terminal every game shares, so it
  // stays in one place rather than drifting per game.
  if (playState === 'ended') return gameEndedTerminalMessage(mode)
  if (mode === 'coop') {
    if (playState === 'won') {
      return { pillText: 'Won: solved it', infoColText: 'Solved it!', outcome: 'won' }
    }
    return {
      pillText: timerExpired ? 'Lost: out of time' : 'Lost: out of guesses',
      infoColText: timerExpired ? 'Out of time' : 'Out of guesses',
      outcome: 'lost',
    }
  }
  // compete. The winner is fewest-guesses, clock-as-tiebreak — so the words
  // distinguish "fewest guesses" from "same guesses, but faster".
  if (playState === 'won_compete') {
    if (selfWon) {
      return wonByClock
        ? { pillText: 'Won: same guesses, but faster', infoColText: 'You won (faster)', outcome: 'won' }
        : { pillText: 'Won: fewest guesses', infoColText: 'You won!', outcome: 'won' }
    }
    return selfTiedWinner
      ? { pillText: 'Lost: beaten on the clock', infoColText: 'Opponent won (faster)', outcome: 'lost' }
      : { pillText: 'Lost: beaten on guesses', infoColText: 'Opponent won', outcome: 'lost' }
  }
  // lost_compete — nobody solved, or time ran out. No `Lost:` prefix: nobody was
  // beaten, the board just ran out.
  return {
    pillText: timerExpired ? 'Out of time — no winner' : 'Nobody solved',
    infoColText: timerExpired ? 'Out of time' : 'No winner',
    outcome: 'lost',
  }
}
