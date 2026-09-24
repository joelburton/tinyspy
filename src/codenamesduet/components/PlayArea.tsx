// cs-blessed-codenamesduet

import { runRpc } from '@/common/supabase/dbResult'
import { useEffect, useState, useMemo } from 'react'
import { describeReveal } from '@/common/reveal/describeReveal'
import { useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useTabRing } from '@/common/keyboard/useTabRing'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { useTurnBell } from '@/common/sounds/useTurnBell'
import { useTurnStartFlash } from '@/common/board-marks/useTurnStartFlash'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { cls } from '@/common/utils/cls'
import { db } from '../db'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { usePeerFeedback } from '@/common/feedback/usePeerFeedback'
import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { buildDuetPrintModel } from '../pdf/model'
import { printCodenamesduetPdf } from '../pdf/printCodenamesduetPdf'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { setupRows } from '../lib/setupSummary'
import type { GameRow } from '../hooks/useGame'
import { useGame } from '../hooks/useGame'
import type { WordRow } from '../hooks/useBoard'
import { useBoard } from '../hooks/useBoard'
import { cluesOf, guessesOf, type DuetEvent } from '../lib/events'
import { answerMessage, turnAnswer } from '../lib/answer'
import type { KeyLabel } from '../lib/labels'
import { derivePhase, type Seat } from '../lib/phase'
import { TOTAL_AGENTS } from '../lib/agents'
import { seatPlayers, type Player } from '../lib/seats'
import { historySnapshot } from '../lib/history'
import { buildTerminalMessage } from '../lib/terminal'
import type { CodenamesduetSetup } from '../lib/setup'
import { CodenamesduetAISuggestCompanion } from './CodenamesduetAISuggestCompanion'
import { type SuggestState } from './ClueStrip'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { StateLine } from './StateLine'
import shared from '@/common/game-page/playArea.module.css'
import { EnvelopeErrorPage } from '@/common/error-page/ErrorPage'
import { NoSuchGamePage } from '@/common/game-page/NoSuchGamePage'
import { Loading } from '@/common/loading/Loading'
import styles from './PlayArea.module.css'
import '../theme.css'  // codenamesduet-specific color tokens (lazy-loaded with this chunk)
import { reportUnhandled } from '@/common/supabase/dbEnvelope'

/**
 * codenamesduet's play surface — the coordinator under `PlayAreaLoader`. It
 * holds no board and draws no control of its own: `BoardCol` renders the 5×5
 * board with the below-board slot (the clue strip, or the local slot's pill),
 * and `InfoCol` the readout, the banners, the action row, the disclosures and
 * the event log. This component derives the phase (`derivePhase` — who may
 * click what, and when), binds the commands both columns place, and decides
 * what each column is handed: the live board or a viewed turn's snapshot, the
 * slots, the flags. Every move is judged by the server, and the columns own
 * their RPCs — `BoardCol` the guess, `ClueStrip` the clue and the pass — with
 * Realtime bringing the result back to every client. Cross-cutting chrome
 * (logo, chat, pause, timer, the players strip) is `<GamePage>`'s, above this.
 *
 * **The end of a game is in-page** (docs/ui.md → Terminal results): the
 * below-board slot carries `terminalMessage.pillText` and the action row its
 * `infoColText`, both until the player leaves. A win — only a win — also pops
 * `<CelebrationBlockingModal>` at the moment the last agent is contacted.
 */

/**
 * The play surface's loader: runs the two reads — the game row, and the board
 * with its events — seats the game's two players from the profiles the shell
 * holds, and renders `<PlayArea>` only once there is a game to draw. Named by
 * the manifest's lazy line.
 */
export function PlayAreaLoader(ctx: GamePageCtx) {
  const { game, loading: gameLoading, failure: gameFailure } = useGame(ctx.gameId)
  // Showing the partner's key is a display choice, but `useBoard` is what turns
  // it into `peerKey`, so the choice is held here, above the read.
  const peerKeyReveal = useSolutionReveal()
  const board = useBoard(ctx.gameId, ctx.session.user.id, peerKeyReveal.revealed)

  if (gameLoading || board.loading) return <Loading />
  // A failed read is NOT a missing game. Both leave the board with nothing to
  // draw, and saying "there's no game here" about a dead connection is a
  // confident wrong answer — this is what remains once the fault modal is
  // dismissed. The reads are equally fatal, so the FIRST failure wins; each
  // envelope names its own read in `detail`.
  const failure = gameFailure ?? board.failure
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // Reaching this means the COMMON row exists — `GamePageGate` and
  // `GamePageLoader` each checked. A missing duet row is a torn write or a game
  // deleted while open. A missing key card or seat is also a viewer who holds
  // no seat. A seat id missing from the shell's players is a torn write too.
  // `detail` goes to the console, never to the page.
  const seated = game && seatPlayers(game, ctx.players)
  const mySeat = seated?.find((p) => p.user_id === ctx.session.user.id)?.seat
  if (!game || !seated || !mySeat || !board.myKey || board.words.length < 25) {
    return (
      <NoSuchGamePage
        detail={`rows=${game ? 1 : 0} table=codenamesduet.games seats=${seated ? 2 : 'missing'} key=${board.myKey ? 'seated' : 'none'} words=${board.words.length} game=${ctx.gameId}`}
      />
    )
  }

  return (
    <PlayArea
      {...ctx}
      game={game}
      seatedPlayers={seated}
      mySeat={mySeat}
      words={board.words}
      events={board.events}
      myKey={board.myKey}
      peerKey={board.peerKey}
      myAgentsDone={board.myAgentsDone}
      peerAgentsDone={board.peerAgentsDone}
      peerKeyShown={peerKeyReveal.revealed}
      togglePeerKey={peerKeyReveal.toggle}
      // The one place the setup blob is narrowed. `GamePageCtx` types it
      // `Record<string, unknown>` for every game; below, it is this game's.
      setup={ctx.setup as unknown as CodenamesduetSetup}
    />
  )
}

type PlayAreaProps = Omit<GamePageCtx, 'setup'> & {
  // The loaded game row: the turn pointer and the two seats. Non-null by
  // construction — the loader holds the gates.
  game: GameRow
  // The two seated players, A then B, each with a `seat`. The context's
  // `players` are the same two, with no seat; they are read as `members`.
  seatedPlayers: Player[]
  // The viewer's own seat. Always one — the loader shows the no-such-game page
  // to a viewer who holds none.
  mySeat: Seat
  // The 25 words with their reveal state.
  words: WordRow[]
  // Everything that has happened, in order: clues, guesses, passes, hints.
  events: DuetEvent[]
  // My key card, and my partner's — null until I choose to see it.
  myKey: KeyLabel[]
  peerKey: KeyLabel[] | null
  // Whether each seat has contacted all its agents; drives the banners.
  myAgentsDone: boolean
  peerAgentsDone: boolean
  // The partner-key reveal, held by the loader because `useBoard` reads it.
  peerKeyShown: boolean
  togglePeerKey: () => void
  // This game's setup, narrowed once by the loader.
  setup: CodenamesduetSetup
}

export function PlayArea({
  session,
  gameId,
  playState,
  isTerminal,
  setup,
  globalFeedbackSlot,
  clubHandle,
  goToGame,
  players: members,
  menu,
  brand,
  title,
  game,
  seatedPlayers: players,
  mySeat,
  words,
  events,
  myKey,
  peerKey,
  myAgentsDone,
  peerAgentsDone,
  peerKeyShown,
  togglePeerKey,
}: PlayAreaProps) {
  // ─── Page hooks ─────────────────────────────────────
  // What this surface IS, before anything this game knows: where Tab may go,
  // where the info column sits on a phone, the one thing that fires at a moment
  // rather than describing a state — the win's confetti — and the AI dialog,
  // whose state lives here so its panel renders at the layout's level.

  // The board is worked by clicks, so the page itself has nowhere for Tab to go
  // and an empty ring keeps it from walking out to the browser. While a clue is
  // being given, the clue form's own ring is innermost and Tab is its (ClueStrip).
  useTabRing([])

  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the info
  // column is an off-canvas <InfoSheet>, reached from the header. The clue
  // field raises the OS keyboard, and the giver needs the board's key colors
  // while composing, so the board keeps its size and the page scrolls.
  const infoSheet = useInfoSheet()

  // The win's celebration — at the MOMENT the pair contacts the 15th agent, on
  // every client at once since the win arrives by realtime, and never on mount,
  // so an already-won game opens quietly (`useCelebration`). Gated on
  // `playState` alone: duet is coop-only, so 'won' is unambiguous.
  const celebration = useCelebration(playState === 'won')

  // The AI clue-suggestion dialog's state — held here, not in the clue form, so
  // its panel renders at the layout's level (see the render). The form drives
  // it through `onSuggestionChange`.
  const [clueSuggestion, setClueSuggestion] = useState<SuggestState | null>(null)
  console.log('[ClueHint] PlayArea render — clueSuggestion:', clueSuggestion)

  // ─── Derived ────────────────────────────────────────
  // Who I am in this game and what I may still do, read off the props and the
  // loader's rows. Named here because the sections below share them: the
  // standing condition, the bindings' `describe`s, the print model and both
  // columns all ask the same questions, and they must not answer them
  // differently.

  // The two views of the events the log, the history viewer, the clue strip and
  // the PDF read: every clue, and every guess with the word on its tile.
  const clues = useMemo(() => cluesOf(events), [events])
  const guesses = useMemo(() => guessesOf(events, words), [events, words])

  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (common/setup-form/doc.md → Setup rows).
  const summaryRows = useMemo(
    () => setupRows(setup, 'coop' as const, players),
    [setup, players],
  )

  // `gameOver` is the shell's `isTerminal`, the one answer to "is it over?";
  // `playState` carries this game's own value, read for sudden death and the
  // verdict.
  const gameOver = isTerminal

  // Seat/roster derivations, read by the print model (built in the binding's
  // run) and the render alike, so both see the SAME values.
  const peer = players.find((p) => p.user_id !== session.user.id)
  const greenFound = words.filter((w) => w.revealed_as === 'G').length

  // A turn is in its guess phase iff a clue exists for `games.turn_number`.
  // `submit_clue` and the one-clue-per-turn index keep that true, so the client
  // may read it off the events.
  const currentTurnClue =
    clues.find((c) => c.turn_number === game.turn_number) ?? null

  // Who may click what, and when — `lib/phase.ts` carries the matrix.
  const inSuddenDeath = playState === 'sudden_death'
  const { isGuessPhase, isClueGiver, cellsClickable } = derivePhase({
    gameOver,
    inSuddenDeath,
    currentClueGiver: game.current_clue_giver as Seat | null,
    mySeat,
    hasCurrentTurnClue: currentTurnClue !== null,
  })

  // My turn: there is something for me to do. This game never moves the shared
  // turn pointer `GamePage` rings from, so it marks its own — the bell and the
  // board's frame flash on the arrival, and the board dims while my partner
  // holds the move. Sudden death and a finished game have no turn at all.
  const cluesStillGiven = !gameOver && !inSuddenDeath
  const myClueToGive = isClueGiver && !isGuessPhase
  const myClueToGuess = !isClueGiver && isGuessPhase
  const myTurn = cluesStillGiven && (myClueToGive || myClueToGuess)
  const partnersTurn = cluesStillGiven && !myTurn
  useTurnBell(myTurn)
  const turnFlash = useTurnStartFlash(myTurn)

  // ─── The local slot, and its standing condition ─────
  // A condition is an effect on a primitive edge that shows on true and
  // retracts in its cleanup — the slot draws whichever ranks highest. The
  // local slot is the one for messages about ME; my partner's go in the
  // header's.

  // The below-board slot. Born here because BOTH columns show into it —
  // BoardCol's guess and clue strip (a refused guess / clue / pass) and
  // InfoCol's End — and while it holds anything the pill takes the clue
  // strip's place. Not-ok only, plus the terminal verdict: a guess that lands
  // shows on the board and in the log.
  const localFeedbackSlot = useFeedbackSlot('local')
  // Any key is the player's next move, so it dismisses a gesture-cleared
  // message; a keystroke aimed at the clue field never reaches it (see
  // `useDismissLocalFeedbackOnKey`).
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // The verdict, memoized on `playState` so the effect sees one object per
  // outcome, shown on the terminal edge.
  const terminalMessage = useMemo(
    () => (isTerminal ? buildTerminalMessage(playState) : null),
    [isTerminal, playState],
  )
  useEffect(function showTerminalVerdict() {
    if (!terminalMessage) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(terminalMessage))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, terminalMessage])

  // ─── Narration — what my PARTNER is doing, in the header slot ───
  // About somebody else, which is what puts it in the global slot rather than
  // the local one (docs/ui.md → Feedback pill).

  // What my partner is doing right now, in `lib/answer.ts`'s words, held while
  // it is true: news in the header covers it and it comes back as the news
  // fades. Derived to primitives so a realtime refetch's fresh `peer` object
  // does not re-show it.
  const partnerAnswer = turnAnswer({ isGuessPhase, isClueGiver, inSuddenDeath, gameOver })
  const partnerMessage = partnerAnswer === null ? null : answerMessage(partnerAnswer)
  const partnerText = partnerMessage?.text ?? null
  const partnerOutcome = partnerMessage?.outcome ?? null
  const peerName = peer?.username
  const peerColor = peer?.color

  useEffect(function showPartnerStatus() {
    if (partnerText === null || partnerOutcome === null) return
    const actor = peerName === undefined ? undefined : { username: peerName, color: peerColor ?? '' }
    const id = globalFeedbackSlot.show(
      FeedbackMessage.peerStatus(actor, partnerText, { outcome: partnerOutcome }),
    )
    return () => globalFeedbackSlot.retract(id)
  }, [globalFeedbackSlot, partnerText, partnerOutcome, peerName, peerColor])

  // My partner asking the AI for a clue is narrated in the header, once, as it
  // lands; my own hint is not, since the suggestion dialog is its feedback. Old
  // hints are not replayed on load; see `usePeerFeedback`.
  usePeerFeedback({
    enabled: true,
    items: events,
    keyOf: (e) => String(e.id),
    messageFor: (e) => {
      if (e.kind !== 'hint' || e.user_id === session.user.id) return null
      const member = players.find((p) => p.user_id === e.user_id)
      const { outcome, text } = answerMessage({ answerType: 'hint_peer' })
      return FeedbackMessage.peer(member, outcome, text)
    },
    globalFeedbackSlot,
  })

  // ─── The turn-history viewer ────────────────────────
  // Opening an event-log #N replays that turn's board, addressed by an event
  // id and folded by its turn. Exit is the hook's own.

  // Click a turn's `#N` in the event log to replay that turn's board. The id is
  // an EVENT's — the turn's clue, or a sudden-death guess — as every game's log
  // addresses a row; the fold below resolves it to its turn. The exits — a bare
  // keystroke, a click away from the log, the banner's ✕ — are the hook's own
  // (`useHistoryViewer`), and a keystroke aimed at the clue field is not one of
  // them.
  const { historyId, historyN, showHistory, exitHistory } =
    useHistoryViewer<number>()

  // When a past turn is open, `historySnap` is that turn's board (else null =
  // live): `historySnapshot` folds the guesses up to the viewed turn onto the
  // fixed words and rings that turn's own tiles, and the turn's clue feeds the
  // banner's label. A later realtime guess only grows later turns, so a viewed
  // turn never shifts under you.
  const historyTurn = historyId === null
    ? null
    : events.find((e) => e.id === historyId)?.turn_number ?? null
  const historyClue =
    historyTurn !== null
      ? clues.find((c) => c.turn_number === historyTurn) ?? null
      : null
  const historySnap =
    historyTurn !== null
      ? historySnapshot(words, guesses, historyClue, historyTurn, historyN)
      : null

  // ─── The commands, bound ────────────────────────────
  // Every command this game offers, in one order that three readers keep: this
  // block, the info column's prop list, and the menu's rows. A binding is what
  // the button, the menu row and the key all read, so none of them can drift
  // from another — and `pending` grays every surface of one for the length of
  // its run, so no handler keeps an in-flight flag of its own.

  // End / Restart — the shared pair. Duet is coop-only, so Concede hides itself
  // and only End is ever placed. Restart is a MULLIGAN: `replay_board` deals
  // the same board and key cards again (a blind board is New game, below), and
  // the reveal being local state, the remount a restart causes covers the
  // partner's key again.
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: 'coop',
    myConceded: false,
    localFeedbackSlot,
  })

  // Reveal the partner's key — a LOCAL display toggle (`useSolutionReveal`): it
  // shows their card to me alone and writes nothing, so the partner's own stays
  // covered until they ask. Terminal-only, because mid-game the partner's card
  // IS the game.
  const actReveal = useBoundAction('act-reveal', {
    // "key cards" rather than the bare default: what this game withholds is not
    // a solution at all, it is the half of the key only your partner could see.
    describe: (asker) => {
      // No BUTTON while the game runs; the menu row keeps it all game, grayed,
      // because the menu is where its glyph is taught.
      if (!isTerminal && asker === 'button') return 'hidden'
      return describeReveal({ noun: 'key cards', revealed: peerKeyShown, isTerminal })
    },
    run: togglePeerKey,
  })

  // New game — a FRESH game (a new id, a newly sampled board) with THIS game's
  // setup and roster, in the same club. `create_game` samples its board inline,
  // so this is a direct RPC, and it takes no `mode` (the game is coop-only).
  // `common.create_game` un-currents THIS game into the club's list, so it
  // stays resumable. The creator jumps in via `goToGame`; the partner arrives
  // via the game-invitation toast.
  const createNewGame = async () => {
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        setup,
        player_user_ids: members.map((m) => m.user_id),
      }),
    )
    if (res.type === 'not-ok') {
      // No field to land on here, so the answer goes in the slot as it reads,
      // over the verdict, until dismissed — even for a fault whose modal has
      // already fired, since the modal escalates and does not replace
      // (docs/envelopes.md).
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'created') {
      goToGame('codenamesduet', res.data.id)
      return
    } else {
      reportUnhandled('create_game', res)
      return
    }
  }

  // Its `+`, its menu row and its terminal button, from one binding. The
  // registry asks NEW_GAME_CONFIRM mid-play (starting one shelves this game,
  // not ends it) and goes straight through at the end. The shared run's single
  // flight is what stops a second press sampling a second board.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    // Reachable all game from the menu and `+`, but a BUTTON only at the end.
    describe: (asker) => (asker === 'button' && !isTerminal ? 'hidden' : 'active'),
    run: createNewGame,
  })

  // Print the board — a snapshot at CLICK time (common/pdf/doc.md). The peer's
  // key reaches the model only once revealed, and the model refuses it before
  // terminal regardless, so it cannot reach paper early.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => 'active',
    run: () => {
      printCodenamesduetPdf(
        buildDuetPrintModel({
          brand,
          gameTitle: title,
          date: new Date().toLocaleDateString(),
          words,
          myKey,
          peerKey,
          mySeat,
          isTerminal,
          clues,
          guesses,
          nameForSeat: (seat) =>
            (players.find((p) => p.seat === seat)?.username) ?? `Seat ${seat}`,
          greenFound,
          totalAgents: TOTAL_AGENTS,
          turnNumber: game.turn_number,
          turnCap: setup.turns,
          mode: 'coop' as const,
          setup: summaryRows,
        }),
      )
    },
  })

  // ─── The menu ───────────────────────────────────────
  // `buildGameMenu` supplies the framing (Help and chat above, Back to club
  // below); the middle is this game's own rows, each one a binding made above,
  // so a row's words, glyph, key and availability come from the action rather
  // than being typed a second time here.

  // The game is coop-only, so Concede hides itself and the exits list draws
  // as End alone.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        exits: [actConcede, actEndGame],
        extra: [
          // The same actions the info column's row offers, in its order,
          // reachable mid-game too.
          { items: [actReveal, actRestart, actNewGame] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actReveal, actRestart, actNewGame, actPrintBoard])

  // ─── Render ─────────────────────────────────────────
  // Everything below is derived fresh each render and read only by the JSX —
  // nothing here is a hook, which is why it may sit after the menu effect.

  // Duet's finished-player rule (enforced in `_end_turn`): once a seat's agents
  // are all contacted it gives no more clues, and its partner takes every
  // remaining turn. Both players are told, so the lopsided turn flow does not
  // read as a bug. Only in normal play — nobody clues in sudden death, and
  // nothing is owed once the game is over.
  const bannerEligible = !gameOver && !inSuddenDeath
  const viewerFinished = bannerEligible && myAgentsDone
  const peerFinished = bannerEligible && peerAgentsDone

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        // ── Mobile-only status strip — the SAME StateLine the InfoCol renders ──
        mobileStatus={
          <StateLine
            greenFound={greenFound}
            turnNumber={game.turn_number}
            turns={setup.turns}
          />
        }
        // ── Board to render (live OR the historical snapshot — picked here) ──
        words={historySnap ? historySnap.words : words}
        myKey={myKey}
        peerKey={peerKey}
        mySeat={mySeat}
        gameOver={gameOver}
        readOnly={!cellsClickable}
        historyLitTiles={historySnap?.historyLitTiles}
        // ── Board marks (tile-feedback): the turn, the move log, the ending ──
        notMyTurn={partnersTurn}
        myTurnJustStarted={turnFlash}
        moveCount={guesses.length}
        terminalOutcome={terminalMessage?.outcome ?? null}
        // ── History viewer ──
        historyLabel={historySnap?.historyLabel ?? null}
        onExitHistory={exitHistory}
        // ── Guess dispatch (BoardCol owns submit_guess) — and the slot its
        //    not-oks, the clue strip's, and the verdict show into ──
        gameId={gameId}
        localFeedbackSlot={localFeedbackSlot}
        // ── Clue strip ──
        isClueGiver={isClueGiver}
        isGuessPhase={isGuessPhase}
        currentClue={currentTurnClue}
        inSuddenDeath={inSuddenDeath}
        peer={peer}
        onSuggestionChange={setClueSuggestion}
      />

      {/* Info column — off-canvas sheet on mobile, flex child on desktop. */}
      <InfoSheet open={infoSheet.isOpen} onClose={infoSheet.close}>
        <InfoCol
        // ── Mode + phase ──
        terminalMessage={terminalMessage}
        inSuddenDeath={inSuddenDeath}
        // ── State readout ──
        greenFound={greenFound}
        turnNumber={game.turn_number}
        // ── Finished-player banners ──
        viewerFinished={viewerFinished}
        peerFinished={peerFinished}
        peer={peer}
        // ── Action row ──
        actReveal={actReveal}
        actRestart={actRestart}
        actNewGame={actNewGame}
        actConcede={actConcede}
        actEndGame={actEndGame}
        actBackToClub={menu.actBackToClub}
        // ── Key card + setup disclosures ──
        myKey={myKey}
        setup={setup}
        setupRows={summaryRows}
        // ── Turn-history log ──
        clues={clues}
        guesses={guesses}
        players={players}
        selfId={session.user.id}
        gameOver={gameOver}
        historyId={historyId}
        onShowHistory={showHistory}
        />
      </InfoSheet>

      {/* The AI clue-suggestion dialog — a child of `.layout`, like the other
          dialogs: react-rnd positions from the static flow position, and deep
          in the flex-column board column a panel lands below the viewport. */}
      {clueSuggestion && (
        <CodenamesduetAISuggestCompanion
          state={clueSuggestion}
          onClose={() => setClueSuggestion(null)}
        />
      )}

      {/* The win's celebration — the one modal this game shows at the end; the
          verdict itself is in-page. */}
      {celebration.show && (
        <CelebrationBlockingModal
          title="You win! 🎉"
          body={`All ${TOTAL_AGENTS} agents contacted.`}
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
