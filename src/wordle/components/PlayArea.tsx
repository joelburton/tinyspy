// cs-blessed-wordle

import { runRpc } from '@/common/supabase/dbResult'
import { useEffect, useMemo } from 'react'
import { cls } from '@/common/utils/cls'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { buildWordlePrintModel } from '../pdf/model'
import { printWordlePdf } from '../pdf/printWordlePdf'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { answerMessage, peerAnswerMessage } from '../lib/answer'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useShowEndingFeedback } from '@/common/feedback/useShowEndingFeedback'
import { useShowWaitingMessage } from '@/common/feedback/useShowWaitingMessage'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { describeReveal } from '@/common/reveal/describeReveal'
import { useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { db } from '../db'
import { useGame, type GameData } from '../hooks/useGame'
import { useGetGameEndingMessage } from '../hooks/useGetGameEndingMessage'
import { useGetPlayerEndingMessage } from '../hooks/useGetPlayerEndingMessage'
import { historySnapshot } from '../lib/history'
import { WORD_LENGTH } from '../lib/setup'
import { memberById } from '@/common/members/memberList'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import { Loading } from '@/common/loading/Loading'
import { NoSuchGamePage } from '@/common/game-page/NoSuchGamePage'
import styles from './PlayArea.module.css'
import '../theme.css'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * The GATES, and nothing else: the read, and the three answers it can come
 * back with. Splitting them off is what lets `<PlayArea>` below start with the
 * game data in hand — no `gd?.`, no guard inside a handler for a row that
 * cannot be missing by then.
 */
export function PlayAreaLoader(ctx: GamePageCtx) {
  const { gd, loading, failure } = useGame(ctx)

  if (loading) return <Loading />
  // A failed read is NOT a missing game. Both leave `gd` null, and saying
  // "there's no game here" about a dead connection is a confident wrong answer
  // — this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // Reaching this means the COMMON row exists — `GamePageGate` and
  // `GamePageLoader` each checked — and wordle's does not: a torn write, or a
  // game deleted while somebody had the board open. `detail` goes to the
  // console, never to the page.
  if (!gd) return <NoSuchGamePage detail={`rows=0 view=wordle.games_state game=${ctx.gameId}`} />

  return (
    <PlayArea
      gd={gd}
      session={ctx.session}
      globalFeedbackSlot={ctx.globalFeedbackSlot}
      clubHandle={ctx.clubHandle}
      goToFollowUpGame={ctx.goToFollowUpGame}
      menu={ctx.menu}
      brand={ctx.brand}
    />
  )
}

type PlayAreaProps = Pick<
  GamePageCtx,
  | 'session'
  | 'globalFeedbackSlot'
  | 'clubHandle'
  | 'goToFollowUpGame'
  | 'menu'
  | 'brand'
> & {
  // The game data. Non-null by construction — the loader holds the gates.
  gd: GameData
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
 * `gd.mode` is what differs between the manifests, and it differs in one place
 * each: coop shows the SHARED guess list and team budget, compete only the
 * caller's own guesses (RLS hides the rest until terminal) plus an
 * OpponentStrip of their counts.
 */
function PlayArea({
  gd,
  session,
  globalFeedbackSlot,
  clubHandle,
  goToFollowUpGame,
  menu,
  brand,
}: PlayAreaProps) {
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
  // compete game MY win, my outcome being the server's word on who won. Both
  // are on the page's rows, so both are correct on the very first render,
  // which is what `useCelebration` requires.
  const celebration = useCelebration(
    gd.isCompete ? gd.me?.outcome === 'won' : gd.gameEnding?.outcome === 'won',
  )

  // The board frame flashes yellow the moment the move becomes mine. Never
  // fires in a free-for-all game (`isMyTurn` holds for as long as I play
  // there), so it needs no mode gate.
  const turnFlash = useTurnStartFlash(gd.standing.isMyTurn)

  // ─── Derived ───────────────────────────────────────────

  // Who has solved it — the compete narration and the print model read it.
  // Memoized so the narration hook re-runs only when it changes.
  const solvedIds = useMemo(
    () => Object.values(gd.playersById).filter((p) => p.solvedAt !== null).map((p) => p.user_id),
    [gd.playersById],
  )

  // The word shows only when I ask for it, and the ask is local and reversible
  // (`useSolutionReveal`). The target is on every client once the game has
  // ended (`wordle._target_for`), so this is purely what gets drawn.
  //
  // `impliedBy` is the exception: a wordle can only be SOLVED by typing the
  // answer, so a solver is already looking at it — `gd.standing.hasSolved`.
  const {
    revealed: answerShown,
    toggle: toggleAnswer,
    impliedBySolve,
  } = useSolutionReveal({
    impliedBy: gd.standing.hasSolved,
  })

  // ─── The local slot, and what stands in it ─────────────
  // The local slot is the one for messages about ME; a peer's go in the
  // header's.

  // The local feedback slot — the fixed-height slot between the board and the
  // keyboard. A soft reject or an RPC not-ok is shown into it by BoardCol, the
  // Stop / Concede races by InfoCol's actions, and the endings and the waiting
  // line below. Accepted guesses get NO message — the colored row that lands
  // IS the feedback.
  const localFeedbackSlot = useFeedbackSlot('local')

  // The endings' messages, for the pill and the info column: the game's once
  // it has ended, mine while I have ended and the others play on.
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
    holder: gd.turnHolder,
  })

  // ─── Narration — what a PEER did, in the header slot ───
  // About somebody else, which is what puts it in the global slot rather than
  // the local one (docs/ui.md → Feedback pill). Each mode has one peer event
  // it can see.

  // Coop: a teammate's guess narrated in the header — "● moth guessed CRANE",
  // in the row's own outcome. Only ACCEPTED guesses can reach here, since a
  // soft reject writes no row; my own are excluded, landing on the shared board
  // instead. Compete never narrates a guess at all: RLS scopes the log to the
  // caller, and the gate below says coop besides.
  usePeerFeedback({
    enabled: !gd.isCompete,
    items: gd.events,
    keyOf: (g) => String(g.id),
    messageFor: (g) => {
      if (g.user_id === session.user.id) return null // mine → board, no narration
      const member = memberById(gd.players, g.user_id)
      const { outcome, text } = peerAnswerMessage(g)
      return FeedbackMessage.peer(member, outcome, text)
    },
    globalFeedbackSlot,
  })

  // Compete: RLS hides opponents' guesses, so the peer event this mode can
  // surface is a SOLVE — a player's public `solved_at` being set. It wears the
  // word a solving guess wears anywhere, the outcome following the event rather
  // than my stake in it (docs/ui.md → Feedback pill). My own solve is excluded,
  // being covered by the terminal feedback.
  usePeerFeedback({
    enabled: gd.isCompete,
    items: solvedIds,
    keyOf: (id) => id,
    messageFor: (id) => {
      if (id === session.user.id) return null // my own solve → terminal handling
      const member = memberById(gd.players, id)
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

  // Stop / Concede / Replay — the shared handlers, identical across games
  // (`useStandardGameActions`). New game and Reveal are below, their paths
  // being wordle's own.
  const { actStopGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId: gd.gameId,
    isTerminal: gd.isGameEnded,
    mode: gd.mode,
    isLocallyTerminal: gd.standing.isPlayerEnded,
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
      if (gd.standing.isStillPlaying && asker === 'button') return 'hidden'
      return describeReveal({
        noun: 'solution', revealed: answerShown, impliedBySolve, isTerminal: gd.isGameEnded,
      })
    },
    run: toggleAnswer,
  })

  // New game — a FRESH game (new id, new random target) with THIS game's setup,
  // roster and mode, in the same club. wordle's `create_game` is a direct RPC —
  // no edge function, since picking a random target is one SQL line — so this
  // mirrors the manifest's `startGameInClub`. Nothing is destroyed: the club's
  // current-view flag moves, leaving this game resumable from the club list.
  // The creator jumps in via `goToFollowUpGame`, peers arrive by invitation toast.
  async function createNewGame() {
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        p_club_handle: clubHandle,
        p_setup: gd.setup,
        p_player_user_ids: gd.players.map((p) => p.user_id),
        p_mode: gd.mode,
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
      goToFollowUpGame(res.data.id)
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
    terminal: gd.isGameEnded,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !gd.isGameEnded ? 'hidden' : 'active'),
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
          gameTitle: gd.title,
          date: new Date().toLocaleDateString(),
          mode: gd.mode,
          isTerminal: gd.isGameEnded,
          maxGuesses: gd.readout.maxGuesses,
          wordLength: WORD_LENGTH,
          guesses: gd.events,
          players: gd.players,
          selfId: session.user.id,
          target: gd.target,
          answerShown,
          solvedBy: new Set(solvedIds),
          setupRows: gd.setupRows,
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
        exits: [actConcede, actStopGame],
        extra: [
          // The same three the terminal action row offers, reachable mid-game
          // too — Reveal grayed until the game is over.
          { items: [actReveal, actRestart, actNewGame] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actStopGame, actRestart, actNewGame, actReveal, actPrintBoard])

  // ─── Render ────────────────────────────────────────────
  // Everything below is derived fresh each render and read only by the JSX —
  // nothing here is a hook, which is why it may sit after the menu effect.

  const rows = gd.boardGuesses.map((g) => ({ guess: g.word, colors: g.colors }))

  // When a past turn is open, `historySnap` is that turn's board (the rows up to
  // it, the last one ringed); else null = live.
  //
  // WHOSE board it replays is the row author's. Mid-game compete that is always
  // me, RLS showing me nothing else — but at TERMINAL every player's rows
  // arrive, and a `#N` on one of theirs replays THEIR board, which is the point
  // of opening it. Coop is one shared board, so the filter is a no-op there.
  const historyRow = historyId !== null ? gd.events.find((g) => g.id === historyId) : undefined
  const historyRows =
    gd.isCompete && historyRow
      ? gd.events.filter((g) => g.user_id === historyRow.user_id)
      : gd.events
  const historySnap =
    isViewingHistory && historyId !== null
      ? historySnapshot(historyRows, historyId, historyN)
      : null
  // Named only when the board on screen is not the viewer's own — which only
  // compete can be. Coop is one shared board, so a teammate's row replays the
  // board you are already looking at.
  const historyActor =
    gd.isCompete && historyRow && historyRow.user_id !== session.user.id
      ? memberById(gd.players, historyRow.user_id)
      : undefined

  // The ending that applies to me: the game's once it has ended, else mine.
  const endingMessage = gameEndingMessage ?? playerEndingMessage

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        // ── Board to render (live rows + the history snapshot) ──
        rows={rows}
        historySnap={historySnap}
        historyActor={historyActor}
        maxGuesses={gd.readout.maxGuesses}
        brand={brand}
        // ── History viewer ──
        onExitHistory={exitHistory}
        // ── Guess dispatch (BoardCol owns submit_guess) ──
        gameId={gd.gameId}
        isBoardInteractive={gd.standing.isBoardInteractive}
        // ── The below-board slot: BoardCol shows rejects into it and draws it ──
        localFeedbackSlot={localFeedbackSlot}
        // ── Board-scope marks ──
        // The ended board wears its ending, and the keyboard goes with it:
        // `endingMessage` is the same one the slot shows, so the two can't
        // disagree about how this game went.
        terminalOutcome={endingMessage?.outcome ?? null}
        isWaitingForTurn={gd.standing.isWaitingForTurn}
        myTurnJustStarted={turnFlash}
      />
      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
        // ── Mode + phase ──
        isCompete={gd.isCompete}
        isTerminal={gd.isGameEnded}
        endingMessage={endingMessage}
        isStillPlaying={gd.standing.isStillPlaying}
        isPlayer={gd.standing.isPlayer}
        isTurnBased={gd.isTurnBased}
        turnHolderId={gd.turnHolderId}
        // ── State ──
        guessesUsed={gd.readout.guessesUsed}
        maxGuesses={gd.readout.maxGuesses}
        // ── Opponent strip (compete) ──
        players={gd.players}
        selfId={session.user.id}
        // ── Action row — the same bindings, in the order the menu lists them ──
        actReveal={actReveal}
        actRestart={actRestart}
        actNewGame={actNewGame}
        actConcede={actConcede}
        actStopGame={actStopGame}
        actBackToClub={menu.actBackToClub}
        // ── Setup disclosure ──
        setupRows={gd.setupRows}
        // ── Terminal answer reveal (null while hidden — incl. on a loss) ──
        solution={answerShown ? gd.target : null}
        // ── Event log ──
        guesses={gd.events}
        mode={gd.mode}
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
          body={gd.isCompete ?'You solved it in the fewest guesses.' : 'The team found the word.'}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
