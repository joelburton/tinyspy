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
import { db } from '../db'
import { useGame, type WordleGame, type WordlePlayerState, type EventRow } from '../hooks/useGame'
import { historySnapshot } from '../lib/history'
import { buildTerminalMessage } from '../lib/terminal'
import { WORD_LENGTH, type WordleSetup } from '../lib/setup'
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
 * The GATES, and nothing else: the read, the three answers it can come back
 * with, and the one narrowing of `setup`. Splitting them off is what lets
 * `<PlayArea>` below start with a game in hand — no `game?.`, no `?? 'coop'`,
 * no guard inside a handler for a row that cannot be missing by then.
 */
export function PlayAreaLoader(ctx: GamePageCtx) {
  const { game, playerStates, guesses, loading, failure } = useGame(ctx.gameId)

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
  // Per-player guess counts and solved flags (`wordle.players`).
  playerStates: WordlePlayerState[]
  // The guess log, oldest first.
  guesses: EventRow[]
  // This game's setup, narrowed once by the loader.
  setup: WordleSetup
}

/**
 * wordle's play surface, shared by the coop and compete manifests. It holds no
 * board and draws no control — `<BoardCol>` and `<InfoCol>` do — and decides
 * what each of them is handed.
 *
 * What is genuinely this surface's: the below-board feedback channel both
 * columns write into, the turn-history viewer, the peer narration, the bound
 * actions, and the derivations the two columns must agree on. The game rows
 * arrive as props from the loader above.
 *
 * `mode` is what differs between the manifests, and it differs in one place
 * each: coop shows the SHARED guess list and team budget, compete only the
 * caller's own guesses (RLS hides the rest until terminal) plus an
 * OpponentStrip of their counts.
 */
export function PlayArea({
  session,
  gameId,
  brand,
  title,
  players: members,
  playState,
  isTerminal,
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

  // ─── Page hooks ────────────────────────────────────────
  // What this surface IS, before anything this game knows: where Tab may go,
  // where the info column sits on a phone, and the two things that fire at a
  // moment rather than describing a state — the win's confetti and the frame's
  // flash when the turn arrives.

  // The guess is typed at the window rather than into an input, so nothing here
  // takes focus and Tab has nowhere to go; an empty ring keeps it from walking
  // out to the browser. (The on-screen keyboard's caps are clicks, not stops.)
  useTabRing([])

  // Mobile (docs/mobile.md): below the breakpoint the board and keyboard fill
  // the screen and the info column moves into an off-canvas `<InfoSheet>`.
  // wordle's one divergence — the board capping its height so the keyboard
  // always fits — is in Board.module.css, not here.
  const infoSheet = useInfoSheet()

  // Confetti at the MOMENT the game is won — the team's solve in coop, and in a
  // race MY win, `status.winner_user_id` being the server's word on who won.
  // Both gates read the common row, so both are correct on the very first
  // render, which is what `useCelebration` requires.
  const winnerId = status?.winner_user_id as string | undefined
  const selfWon = winnerId === session.user.id
  const celebration = useCelebration(
    playState === 'won' || (playState === 'won_compete' && selfWon),
  )

  // The board frame flashes yellow the moment the move becomes mine. Never
  // fires in a free-for-all game (`isMyTurn` is permanently true there), so it
  // needs no mode gate.
  const turnFlash = useTurnStartFlash(isMyTurn)

  // ─── Derived ───────────────────────────────────────────
  // Who I am in this game and what I may still do, read off the props and the
  // hook's rows. Named here because the sections below share them: the
  // standing conditions, the bindings' `describe`s, the print model and both
  // columns all ask the same questions, and they must not answer them
  // differently.

  const self = playerStates.find((p) => p.user_id === session.user.id)
  const isCompete = mode === 'compete'
  const maxGuesses = game.max_guesses
  const guessesUsed = self?.guesses_used ?? 0
  const mySolved = self?.solved ?? false
  // Concede lives on the common roster (ctx `members`), not wordle.players.
  const myConceded = members.find((m) => m.user_id === session.user.id)?.conceded ?? false
  // Who has solved it — the compete narration, Concede's gate and the print
  // model all read it. Memoized so the narration hook re-runs only when it
  // changes.
  const solvedIds = useMemo(
    () => playerStates.filter((p) => p.solved).map((p) => p.user_id),
    [playerStates],
  )
  // Coop: the shared board. Compete: my own guesses (RLS-filtered).
  const myGuesses = isCompete
    ? guesses.filter((g) => g.user_id === session.user.id)
    : guesses

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (common/setup-form/doc.md → Setup rows).
  const summaryRows = useMemo(
    () => setupRows(setup, mode, members),
    [setup, mode, members],
  )

  // The word shows only when I ask for it, and the ask is local and reversible
  // (`useSolutionReveal`). The target is on every client once the game is
  // terminal (`wordle._target_for` gates on `is_terminal`), so this is purely
  // what gets drawn.
  //
  // `impliedBy` is the exception: a wordle can only be finished by typing the
  // answer, so a solver is already looking at it. MY solve, not the game's
  // verdict — compete writes `won_compete` when SOMEONE wins, and the racer who
  // was three guesses off never produced the word.
  const {
    revealed: answerShown,
    toggle: toggleAnswer,
    impliedBySolve,
  } = useSolutionReveal({
    impliedBy: solvedByMe({ isCompete, playState, mine: mySolved }),
  })

  // Locally terminal (compete only): I'm done — solved, out of my own guesses,
  // or conceded — while the game runs on for the others. Coop has no such
  // state, one shared board being over for everyone at once. Solving is one of
  // the ways in, and a good one: compete is won by fewest guesses, decided when
  // everyone finishes, so a solver waiting here may well be winning.
  const isLocallyDone =
    !isTerminal && isCompete && (mySolved || guessesUsed >= maxGuesses || myConceded)
  // May I still submit? Gates the help line and the row's line; read by the
  // Reveal binding, so its button and its menu row agree.
  const showInput = !isTerminal && !isLocallyDone

  // The GAME-STATE half of the board gate — BoardCol ORs in its own mid-submit
  // state. `readOnly` (glossary): the board is inert when there is no self row,
  // the game is terminal, I have solved or conceded, or I am out of guesses.
  // `!isMyTurn` folds in turn-order, and is permanently true in a free-for-all
  // game, so it only tightens a turn one.
  const readOnly =
    !self || isTerminal || mySolved || myConceded || guessesUsed >= maxGuesses || !isMyTurn

  // ─── The local slot, and its three standing conditions ─
  // Each condition is an effect on a primitive edge that shows on true and
  // retracts in its cleanup — the slot draws whichever ranks highest. The
  // local slot is the one for messages about ME; a peer's go in the header's.

  // The local feedback slot — the fixed-height slot between the board and the
  // keyboard. A soft reject or an RPC not-ok is shown into it by BoardCol, the
  // End / Concede races by InfoCol's actions, and the three standing
  // conditions below are effects on it. Accepted guesses get NO message — the
  // colored row that lands IS the feedback.
  const localFeedbackSlot = useFeedbackSlot('local')

  // The per-status terminal message. Memoized on its inputs so the verdict
  // effect sees one object per outcome, not one per render. The compete
  // tie-break is inferred here (no backend flag needed): the server picks the
  // winner by fewest guesses, then earliest solved_at, so if any OTHER solver
  // used the same guess count as the winner, the clock broke the tie.
  const reason = status?.reason as string | undefined
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
  const terminalMessage = useMemo(
    () =>
      isTerminal
        ? buildTerminalMessage({ mode, playState, reason, selfWon, wonByClock, selfTiedWinner })
        : null,
    [isTerminal, mode, playState, reason, selfWon, wonByClock, selfTiedWinner],
  )
  useEffect(function showTerminalVerdict() {
    if (!terminalMessage) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(terminalMessage))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, terminalMessage])

  // Out of the race while the others play on.
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

  // ─── Narration — what a PEER did, in the header slot ───
  // About somebody else, which is what puts it in the global slot rather than
  // the local one (docs/ui.md → the two feedback slots). Each mode has one
  // peer event it can see.

  // Coop: a teammate's guess narrated in the header — "● moth guessed CRANE",
  // in the row's own outcome. Only ACCEPTED guesses can reach here, since a
  // soft reject writes no row; my own are excluded, landing on the shared board
  // instead. Compete never narrates a guess at all: RLS scopes the log to the
  // caller, and the gate below says coop besides.
  usePeerFeedback({
    enabled: mode === 'coop',
    items: guesses,
    keyOf: (g) => String(g.id),
    messageFor: (g) => {
      if (g.user_id === session.user.id) return null // mine → board, no narration
      const member = memberById(members, g.user_id)
      const { outcome, text } = peerAnswerMessage(g)
      return FeedbackMessage.peer(member, outcome, text)
    },
    globalFeedbackSlot,
  })

  // Compete: RLS hides opponents' guesses, so the peer event this mode can
  // surface is a SOLVE — the public `players.solved` flag flipping. It wears the
  // word a solving guess wears anywhere, the outcome following the event rather
  // than my stake in it (docs/ui.md → Feedback pill). My own solve is excluded,
  // being covered by the terminal feedback.
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

  // ─── The turn-history viewer ───────────────────────────
  // Opening an event-log #N replays that turn's board, addressed by the row's
  // id. Exit is the hook's own, and it takes a keystroke too: BoardCol freezes
  // its capture while viewing, leaving the hook's any-key action the keys.
  const { isViewingHistory, historyId, historyN, showHistory, exitHistory } =
    useHistoryViewer<number>()

  // ─── The commands, bound ───────────────────────────────
  // Every command this game offers, in one order that three readers keep: this
  // block, the info column's prop list, and the menu's rows. A binding is what
  // the button, the menu row and the key all read, so none of them can drift
  // from another — and `pending` grays every surface of one for the length of
  // its run, so no handler keeps an in-flight flag of its own.

  // End / Concede / Replay — the shared handlers, identical across games
  // (`useStandardGameActions`). New game and Reveal are below, their paths
  // being wordle's own.
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

  // Reveal the answer — a local display toggle that writes nothing and reaches
  // no peer. Both faces come from `describeReveal`, where the rule for every
  // game's reveal lives.
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

  // New game — a FRESH game (new id, new random target) with THIS game's setup,
  // roster and mode, in the same club. wordle's `create_game` is a direct RPC —
  // no edge function, since picking a random target is one SQL line — so this
  // mirrors the manifest's `startGameInClub`. Nothing is destroyed: the club's
  // current-view flag moves, leaving this game resumable from the club list.
  // The creator jumps in via `goToGame`, peers arrive by invitation toast.
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
      // No field to fix here, so whatever came back goes in the slot as it
      // reads, over the verdict, until its × is pressed — a fault whose modal
      // already fired centrally included, since the modal escalates rather than
      // replaces (docs/envelopes.md).
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
  // The registry asks NEW_GAME_CONFIRM mid-play and goes straight through at
  // terminal, where there is nothing to interrupt; the shared run's single
  // flight stops a second press dealing a second word.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !isTerminal ? 'hidden' : 'active'),
    run: createNewGame,
  })

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

  // ─── The menu ──────────────────────────────────────────
  // `buildGameMenu` supplies the framing (Help and chat above, Back to club
  // below); the middle is this game's own rows, each one a binding made above,
  // so a row's words, glyph, key and availability come from the action rather
  // than being typed a second time here.
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

  // ─── Render ────────────────────────────────────────────
  // Everything below is derived fresh each render and read only by the JSX —
  // nothing here is a hook, which is why it may sit after the menu effect.

  // Who has bowed out of the race — the opponent strip's "out" cell. From the
  // common roster, like `myConceded`.
  const concededIds = new Set(members.filter((m) => m.conceded).map((m) => m.user_id))

  const rows = myGuesses.map((g) => ({ guess: g.guess, colors: g.colors }))

  // When a past turn is open, `historySnap` is that turn's board (the rows up to
  // it, the last one ringed); else null = live.
  //
  // WHOSE board it replays is the row author's. Mid-game compete that is always
  // me, RLS showing me nothing else — but at TERMINAL every player's rows
  // arrive, and a `#N` on one of theirs replays THEIR board, which is the point
  // of opening it. Coop is one shared board, so the filter is a no-op there.
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
        // `terminalMessage` is the same one the slot shows, so the two can't
        // disagree about how this game went.
        gameOver={terminalMessage ? terminalMessage.outcome : null}
        notMyTurn={waiting}
        myTurnJustStarted={turnFlash}
      />
      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
        // ── Mode + phase ──
        isCompete={isCompete}
        isTerminal={isTerminal}
        terminalMessage={terminalMessage}
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

      {/* The win moment. The verdict itself stays in-page — the below-board
          pill and the action-row outcome line (docs/ui.md → Terminal
          results). */}
      {celebration.show && (
        <CelebrationBlockingModal
          title="Solved! 🎉"
          body={isCompete ? 'You solved it in the fewest guesses.' : 'The team found the word.'}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
