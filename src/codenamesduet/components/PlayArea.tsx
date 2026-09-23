// cs-met-codenamesduet

import { runRpc } from '@/common/supabase/dbResult'
import { useEffect, useState, useMemo } from 'react'
import { describeReveal } from '@/common/reveal/describeReveal'
import { useSolutionReveal } from '@/common/reveal/useSolutionReveal'
import type { CreatedGame } from '@/common/manifest/gameManifest'
import type { GamePageCtx } from '@/common/game-page/gamePageCtx'
import { useTabRing } from '@/common/keyboard/useTabRing'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { useFeedbackSlot } from '@/common/feedback/useFeedbackSlot'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { cls } from '@/common/utils/cls'
import { db } from '../db'
import { CelebrationBlockingModal } from '@/common/terminal/CelebrationBlockingModal'
import { useCelebration } from '@/common/terminal/useCelebration'
import { useDismissLocalFeedbackOnKey } from '@/common/feedback/useDismissLocalFeedbackOnKey'
import { useHistoryViewer } from '@/common/event-log/useHistoryViewer'
import { useInfoSheet } from '@/common/info-sheet/useInfoSheet'
import { InfoSheet } from '@/common/info-sheet/InfoSheet'
import { buildDuetPrintModel } from '../pdf/model'
import { printCodenamesduetPdf } from '../pdf/printCodenamesduetPdf'
import { buildGameMenu } from '@/common/menu/gameMenu'
import { useBoundAction } from '@/common/actions/useBoundAction'
import { useStandardGameActions } from '@/common/game-page/useStandardGameActions'
import { setupRows } from '../lib/setupSummary'
import { gameEndedTerminalMessage, type TerminalMessage } from '@/common/terminal/terminalMessage'
import type { ClueRow } from '../hooks/useClues'
import type { GameRow, Player } from '../hooks/useGame'
import { useGame } from '../hooks/useGame'
import type { GuessRow, WordRow } from '../hooks/useBoard'
import { useBoard } from '../hooks/useBoard'
import { useClues } from '../hooks/useClues'
import type { KeyLabel } from '../lib/labels'
import { derivePhase, type GameStatus, type Seat } from '../lib/phase'
import { historySnapshot } from '../lib/history'
import type { CodenamesduetSetup } from '../lib/setup'
import { CodenamesduetAISuggestCompanion } from './CodenamesduetAISuggestCompanion'
import { type SuggestState } from './CluePanel'
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
 * codenamesduet's play surface — two-column viewport-bound composition:
 *
 *   - **Board column** (left, flex) — the 5×5 Board, with the fixed-height
 *     `belowBoard` slot under it (the CluePanel during play, or the local
 *     feedback slot's pill — a not-ok, the terminal verdict).
 *   - **Info column** (fixed-width):
 *       - Status: "{greenFound}/15 agents · {turn-1}/{turns} turns spent"
 *       - Action row: End game while playing; at terminal the bold
 *         outcome line + a compact Back-to-club button. Fixed minimum height so
 *         swapping between them doesn't shift the log below.
 *       - GameEventLog: the shared EventLog table, scrolls internally.
 *
 * Cross-cutting chrome (logo, chat, pause, timer, the players strip)
 * lives on `<GamePage>` above this component.
 *
 * **Terminal handling.** No modal carries the verdict (docs/ui.md → Terminal
 * results): a dialog saying what the below-board verdict already says — same
 * string, same moment — would only cost a dismiss. So it's two in-page
 * surfaces plus one celebration:
 *
 *   1. The below-board slot swaps the CluePanel for the filled verdict
 *      carrying `over.pillText`, and the info-column action row swaps the
 *      End button for a bold `over.infoColText` line + a compact Back-to-club
 *      button (`ctx.menu.actBackToClub`). Both persist until the user
 *      navigates away.
 *   2. A **win** — and only a win — also pops `<CelebrationBlockingModal>`, at the
 *      MOMENT the 15th agent is contacted. `useCelebration` deliberately never
 *      fires on mount, so opening an already-won game is quiet review, not a
 *      re-run of the moment.
 *
 * Most of the game logic is server-side (in plpgsql RPCs); this
 * component's job is to load the row + board + clues via the three
 * hooks, derive phase (who clicks what, when) via `derivePhase`, and
 * hand each piece to the right sub-component. Realtime keeps
 * everything in sync.
 */

/** The per-status terminal message for codenamesduet. `playState` is the
 *  authoritative input — only terminal states appear here. Returns the shared
 *  `TerminalMessage` shape (the same psychicnum/connections use): `pillText` +
 *  `outcome` are the below-board verdict; `infoColText` + `outcome` the
 *  short, bold, color-coded line in the info-column action row (won = green,
 *  lost = red, manual end = neutral). Detail-on-page intentionally: the
 *  agents-found counter sits in the info-column state line, the board carries
 *  the revealed tiles.
 *
 *  The loss verdicts are terse ("Lost: assassin") rather than sentences: the pill
 *  is a fixed-height below-board slot, and on a phone a long verdict wraps and
 *  grows it. */
function buildOver(playState: string): TerminalMessage {
  if (playState === 'won') {
    return { pillText: 'You win!', infoColText: 'You won!', outcome: 'won' }
  }
  if (playState === 'lost_assassin') {
    return {
      pillText: 'Lost: assassin',
      infoColText: 'Assassin revealed',
      outcome: 'lost',
    }
  }
  if (playState === 'lost_clock') {
    return {
      pillText: 'Lost: out of turns',
      infoColText: 'Out of turns',
      outcome: 'lost',
    }
  }
  // Manual end (codenamesduet.end_game): the friends stopped the game on purpose
  // — the uniform neutral terminal shared with the other games, owned by the
  // shared gameEndedTerminalMessage(). codenamesduet is coop-only.
  if (playState === 'ended') return gameEndedTerminalMessage('coop')
  // lost_timeout (and any future terminal state that doesn't match above —
  // falls back to a generic timer-out message rather than crashing).
  return {
    pillText: 'Lost: out of time',
    infoColText: 'Out of time',
    outcome: 'lost',
  }
}

/**
 * Keep the current turn-state in the header — the global slot — for as long
 * as it holds. The header describes **what the PEER is doing** — never what
 * YOU should do (your own to-do is conveyed by the below-board clue UI). So
 * all four turn states read as "● {peer} {doing}", a `peerStatus` that stays
 * up until the state changes, when its owner effect swaps it.
 *
 * **Telegraphic on purpose** ("waiting for you", not "is waiting for your turn to
 * complete"): the header shares its row with the logo and chat bubble, so on
 * a 390px phone it fits ~26 characters and silently ELLIPSIZES the rest — and the
 * dot alone eats two of them. Anything longer than a few words is a message the
 * phone player never finishes reading. Keep additions this short.
 *
 * **Sudden death says nothing here.** It is not a peer action, and the header
 * is the wrong place to park a message that holds for the rest of the game:
 * while one sits there, chat lines and narrations are outranked and the
 * players strip stays hidden. The CluePanel notice below the board carries it
 * in full instead, and the info column leads its help with the red tag.
 */
function useTurnStatus(args: {
  game: { current_clue_giver: string | null; turn_number: number }
  players: Player[]
  clues: ClueRow[]
  playState: string
  gameOver: boolean
  sessionUserId: string
  globalFeedbackSlot: FeedbackSlot
}) {
  const { game, players, clues, playState, gameOver, sessionUserId, globalFeedbackSlot } = args

  // Derived to PRIMITIVES — the phrase, and the peer's name + color — so the
  // effect below re-runs only when one of them changes, not on every fresh
  // `players` array a realtime refetch brings.
  let doing: string | null = null
  const peer = players.find((p) => p.user_id !== sessionUserId)
  const peerName = peer?.username
  const peerColor = peer?.color
  if (!gameOver) {
    const me = players.find((p) => p.user_id === sessionUserId)
    const { isGuessPhase, isClueGiver, inSuddenDeath } = derivePhase({
      status: playState as GameStatus,
      currentClueGiver: game.current_clue_giver as Seat | null,
      mySeat: me?.seat,
      hasCurrentTurnClue: clues.some((c) => c.turn_number === game.turn_number),
    })
    // In sudden death there are no more clues, so none of the four phases
    // describes anything: `doing` stays null and the header shows nothing.
    if (!inSuddenDeath) {
      // What the peer is doing — the phrase WITHOUT their name (the pill draws
      // "● moth" ahead of it), and without a verb ("● moth guessing"): see
      // the phone-width note above.
      doing = !isGuessPhase
        ? isClueGiver
          ? 'waiting for clue'
          : 'writing clue'
        : isClueGiver
          ? 'guessing'
          : 'waiting for you'
    }
  }

  useEffect(function showTurnStatus() {
    if (doing === null) return
    const id = globalFeedbackSlot.show(
      FeedbackMessage.peerStatus(
        peerName === undefined ? undefined : { username: peerName, color: peerColor ?? '' },
        doing,
      ),
    )
    return () => globalFeedbackSlot.retract(id)
  }, [globalFeedbackSlot, doing, peerName, peerColor])
}

/** Every duet board has fifteen green agents (the StateLine prints the same
 *  fixed total); named so the print model and the readout can't disagree. */
const TOTAL_AGENTS = 15

/**
 * The play surface's loader: runs the three reads — the game row, the board,
 * the clues — and renders `<PlayArea>` only once all three have answered with
 * a game to draw. Named by the manifest's lazy line.
 */
export function PlayAreaLoader(ctx: GamePageCtx) {
  const { game, players, loading: gameLoading, failure: gameFailure } = useGame(ctx.gameId)
  // Showing the partner's key is a display choice, but `useBoard` is what turns
  // it into `peerKey`, so the choice is held here, above the read.
  const peerKeyReveal = useSolutionReveal()
  const board = useBoard(ctx.gameId, ctx.session.user.id, peerKeyReveal.revealed)
  const { clues, loading: cluesLoading, failure: cluesFailure } = useClues(ctx.gameId)

  if (gameLoading || board.loading || cluesLoading) return <Loading />
  // A failed read is NOT a missing game. Both leave the board with nothing to
  // draw, and saying "there's no game here" about a dead connection is a
  // confident wrong answer — this is what remains once the fault modal is
  // dismissed. The three reads are equally fatal, so the FIRST failure wins;
  // each envelope names its own read in `detail`.
  const failure = gameFailure ?? board.failure ?? cluesFailure
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // Reaching this means the COMMON row exists — `GamePageGate` and
  // `GamePageLoader` each checked. A missing duet row is a torn write or a game
  // deleted while open. A missing key card is also a viewer who holds no seat.
  // `detail` goes to the console, never to the page.
  if (!game || !board.myKey || board.words.length < 25) {
    return (
      <NoSuchGamePage
        detail={`rows=${game ? 1 : 0} table=codenamesduet.games key=${board.myKey ? 'seated' : 'none'} words=${board.words.length} game=${ctx.gameId}`}
      />
    )
  }

  return (
    <PlayArea
      {...ctx}
      game={game}
      seatedPlayers={players}
      words={board.words}
      guesses={board.guesses}
      myKey={board.myKey}
      peerKey={board.peerKey}
      myAgentsDone={board.myAgentsDone}
      peerAgentsDone={board.peerAgentsDone}
      clues={clues}
      peerKeyShown={peerKeyReveal.revealed}
      togglePeerKey={peerKeyReveal.toggle}
      // The one place the setup blob is narrowed. `GamePageCtx` types it
      // `Record<string, unknown>` for every game; below, it is this game's.
      setup={ctx.setup as unknown as CodenamesduetSetup}
    />
  )
}

type PlayAreaProps = Omit<GamePageCtx, 'setup'> & {
  // The loaded game row: the turn pointer, the budget, both seats and both key
  // cards. Non-null by construction — the loader holds the gates.
  game: GameRow
  // The two seated players, each with a `seat`. Distinct from the context's
  // `players`, the club roster the shell passes every game.
  seatedPlayers: Player[]
  // The 25 words with their reveal state, and every guess, for the log.
  words: WordRow[]
  guesses: GuessRow[]
  // My key card, and my partner's — null until I choose to see it.
  myKey: KeyLabel[]
  peerKey: KeyLabel[] | null
  // Whether each seat has contacted all its agents; drives the banners.
  myAgentsDone: boolean
  peerAgentsDone: boolean
  // Every clue given, one per turn.
  clues: ClueRow[]
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
  words,
  guesses,
  myKey,
  peerKey,
  myAgentsDone,
  peerAgentsDone,
  clues,
  peerKeyShown,
  togglePeerKey,
}: PlayAreaProps) {
  // The board is worked by clicks, so the page itself has nowhere for Tab to go
  // and an empty ring keeps it from walking out to the browser. While a clue is
  // being given, the clue form's own ring is innermost and Tab is its (CluePanel).
  useTabRing([])
  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (common/setup-form/doc.md → Setup rows).
  const summaryRows = useMemo(
    () => setupRows(setup, 'coop' as const, players),
    [setup, players],
  )

  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the board
  // fills the screen and the info column moves into an off-canvas <InfoSheet>,
  // reached by the header's page switch. The clue-giver's divergence —
  // the below-board clue input raises the OS keyboard, and the giver needs the
  // board's key colors visible while composing — is handled by NOT fighting it:
  // the board stays full-size and the page scrolls (scroll up to read the board,
  // down to the clue field). (An earlier attempt SHRANK the board to fit above
  // the keyboard; it crunched the board too small and scrolled badly.)
  const infoSheet = useInfoSheet()

  // `gameOver` mirrors common.games.is_terminal. `playState` carries the
  // gametype-specific value ('playing', 'sudden_death', 'won', ...)
  // for the phase derivation and the terminal copy.
  const gameOver = isTerminal

  // ─── Win celebration ───────────────────────────────────
  // Confetti at the MOMENT the pair contacts the 15th agent (the winning guess
  // flips playState to 'won' on every connected client via realtime, so both
  // players celebrate together); opening an already-won game stays quiet
  // (useCelebration never pops on mount). Gated on `playState` alone — duet is
  // coop-only, so 'won' is unambiguous. This is the ONLY terminal
  // modal duet shows: losses and the manual end land in-page only.
  const celebration = useCelebration(playState === 'won')

  // ─── Own-action feedback (local) ───────────────────────
  // The below-board slot — the LOCAL half of the feedback split (own action →
  // this slot; peer/turn-state news → the header via useTurnStatus). Born
  // HERE, in the coordinator, because BOTH columns show into it: BoardCol's
  // guess dispatch and clue panel (a rejected guess / clue / pass) AND
  // InfoCol's End (a failed end-game). It's NOT-OK-ONLY (a successful guess
  // shows on the board + event log), plus the terminal verdict.
  const localFeedbackSlot = useFeedbackSlot('local')
  // Any key is the player's next move → dismiss a gesture-cleared message. The
  // dispatcher's field gate keeps a keystroke aimed at the clue field from
  // reaching it — only a key with nothing focused does.
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // ─── Turn-history viewer ───────────────────────────────
  // Click an event-log row to replay that turn's board (the reveal state after that
  // turn's guesses, with those cells ringed in the history blue). Keyed by turn_number
  // — one clue per turn, a stable game-wide ordinal (like scrabble's seq). Feature
  // added on the still-monolithic PlayArea ahead of the BoardCol/InfoCol
  // decomposition; see docs/playarea.md.
  // Destructured (not `viewer.x`) to match the other games' PlayAreas and to keep
  // the effect deps honest: `exitHistory` is a stable useCallback, so the effect
  // below re-arms only when `isViewingHistory` flips.
  const { historyId, showHistory, exitHistory } =
    useHistoryViewer<number>()
  // A bare keystroke (nothing focused) returns to the live board — the shared
  // "type anywhere to exit" — the hook binds `act-exit-history` itself, and the
  // dispatcher never offers an action a keystroke aimed at a focused field, so
  // typing a clue can't kick you out of the viewer.

  // The AI clue-suggestion dialog. State lives HERE (not in the deep ClueForm)
  // so the <CodenamesduetAISuggestCompanion> renders at the `.layout` level — a panel
  // rendered deep in the flex-column board lands off-screen (react-rnd positions
  // from the static flow position). ClueForm drives it via onSuggestionChange.
  const [clueSuggestion, setClueSuggestion] = useState<SuggestState | null>(null)
  console.log('[ClueHint] PlayArea render — clueSuggestion:', clueSuggestion)

  // (The guess dispatch — submit_guess + the pending-tile state + the in-flight
  // guard — moved into BoardCol, beside the board it gates.)

  // ─── End / Restart — the shared pair ───────────────────
  // codenamesduet is coop-only, so Concede hides itself and only End is ever
  // placed. Restart runs the SAME board back with the same key cards — a
  // MULLIGAN, not a fresh puzzle: the second run is played knowing where the
  // assassin sits, which is the deliberate trade (a first-guess assassin ends a
  // game nobody got to play; a blind board is New game, below). Since duet's
  // whole board is the secret, the post-replay cleanup is covering the
  // partner's key again: nothing on the server remembers the reveal.
  const { actEndGame, actConcede, actRestart } = useStandardGameActions({
    db,
    gameId,
    isTerminal,
    mode: 'coop',
    myConceded: false,
    localFeedbackSlot,
  })

  // ─── New game ───────────────────────────────────────────
  // A FRESH game (new id, a newly sampled board) with THIS game's setup +
  // roster, in the same club — the "same again!" action after a solve, without
  // a trip through the club page's setup dialog. codenamesduet's create_game
  // samples its board inline, so this is a direct RPC (no edge function) and
  // takes no `mode` (the game is coop-only, one gametype). Non-destructive —
  // common.create_game un-currents THIS game into the club's list, so it stays
  // resumable; the registry still asks NEW_GAME_CONFIRM mid-game. The creator
  // jumps in via ctx.goToGame, the peer arrives via the game-invitation toast.
  //
  // A plain function, rebuilt every render: the binding below reads it at click
  // time, so the setup and roster are whatever the last realtime refetch left,
  // and the action's own identity doesn't move when they do.
  const createNewGame = async () => {
    const res = await runRpc<CreatedGame>(
      db.rpc('create_game', {
        target_club: clubHandle,
        setup,
        player_user_ids: members.map((m) => m.user_id),
      }),
    )
    if (res.type === 'not-ok') {
      // THE SAME ENVELOPE, READ DIFFERENTLY. On the setup form a validation is
      // an answer — fix the field and press Start again. Here there is no field
      // and no form, so whatever came back goes in the slot as it reads, over
      // the verdict, until its × is pressed. Shown even for a fault whose
      // modal has already fired centrally — the modal escalates, it does not
      // replace (docs/envelopes.md), so dismissing it must not leave the board
      // silent about why the game didn't start. Every answer this RPC can give
      // is a fault — there is no form-validation among them — so in practice
      // the modal has already been raised and this is what remains once it is
      // dismissed.
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

  // New game — its `+`, its menu row and its terminal button, from one binding.
  // The registry asks NEW_GAME_CONFIRM mid-play (starting one SHELVES this game:
  // create_game clears the club's current-view flag, so it stays resumable — the
  // copy says shelved, not ended) and goes straight through at terminal. The
  // shared run's single flight is what stops a second press sampling a second
  // board.
  const actNewGame = useBoundAction('act-new-game', {
    terminal: isTerminal,
    describe: () => 'active',
    run: createNewGame,
  })

  // ─── Terminal partner-key reveal ─────────────────────────────────
  // The partner's key card is NOT opened the instant the game ends. The seconds
  // right after an assassin are the best part of a Duet post-mortem — "wait, I
  // was about to pick APPLE" — and that conversation only happens while the card
  // is still covered. Reveal opens it, and the post-mortem continues with
  // everything on the table.
  //
  // Not about protecting a replay: Duet deliberately has none (its board IS the
  // secret — docs/ui.md → Restart).
  //
  // Not on a win either, where the pair contacted all fifteen and the card has
  // nothing left to say.
  //
  // The ask is LOCAL and reversible (useSolutionReveal). Sharing it — on the
  // reasoning that the partner is the person you're doing the post-mortem
  // WITH — cuts the other way: a Duet post-mortem is two people thinking out
  // loud, and one of them opening the card ends the other's thinking
  // mid-sentence. Each of you looks when you're ready, and Hide covers it up
  // again. Not a shield either way: both key columns are readable
  // by every club member under the friends trust model.
  //
  // Reveal the partner's key — a LOCAL display toggle: it shows their card to me
  // alone, writes nothing, and affects nobody else. Terminal-only, because
  // mid-game the partner's card IS the game.
  const actReveal = useBoundAction('act-reveal', {
    // "key cards" rather than the bare default: what this game withholds is not
    // a solution at all, it is the half of the key only your partner could see.
    describe: () => describeReveal({ noun: 'key cards', revealed: peerKeyShown, isTerminal }),
    run: togglePeerKey,
  })

  // Seat/roster derivations, read by the print model (built in the binding's
  // run) and the render alike, so both see the SAME values.
  const me = players.find((p) => p.user_id === session.user.id)
  const mySeat = me?.seat
  const peer = players.find((p) => p.user_id !== session.user.id)
  const greenFound = words.filter((w) => w.revealed_as === 'G').length

  // Print the board — a snapshot at CLICK time (common/pdf/doc.md). The peer's key is
  // a secret mid-game; `useBoard` only hands it over post-game and the model
  // refuses it before terminal regardless, so it can't reach paper early.
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

  // The FULL codenamesduet menu. `buildGameMenu` supplies the framing (Help +
  // chat above, Back to club below); the middle is this game's own rows, each
  // one a binding it already made. The game is coop-only, so Concede hides
  // itself and the exits list draws as End alone.
  useEffect(function publishGameMenu() {
    menu.setGameSections(
      buildGameMenu({
        menu,
        exits: [actConcede, actEndGame],
        extra: [
          // The same actions the terminal row offers, reachable mid-game too.
          { items: [actRestart, actNewGame, actReveal] },
          { items: [actPrintBoard] },
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, actConcede, actEndGame, actRestart, actNewGame, actReveal, actPrintBoard])

  // Keep the turn state in the header — it's easy to miss "the other player
  // ended their turn, it's your turn now" otherwise.
  useTurnStatus({
    game,
    players,
    clues,
    playState,
    gameOver: isTerminal,
    sessionUserId: session.user.id,
    globalFeedbackSlot,
  })

  // ─── The one standing condition of the local slot ───
  // The verdict, memoized on `playState` so the effect sees one object per
  // outcome, shown on the terminal edge and retracted by its owner on Restart
  // (a Duet mulligan un-terminals the game).
  const over = useMemo(() => (isTerminal ? buildOver(playState) : null), [isTerminal, playState])
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  const firstClueGiver = players.find(
    (p) => p.user_id === setup.first_clue_giver_user_id,
  )
  // Phase derivation: a turn is in "guess phase" iff a clue already
  // exists for games.turn_number. The submit_clue RPC enforces the
  // one-per-turn unique constraint, so we can trust this at the
  // client level.
  const currentTurnClue =
    clues.find((c) => c.turn_number === game.turn_number) ?? null

  // derivePhase is pure and unit-tested in src/lib/phase.test.ts —
  // see there for the full clickability / phase matrix.
  const { isGuessPhase, isClueGiver, inSuddenDeath, cellsClickable } =
    derivePhase({
      status: playState as GameStatus,
      currentClueGiver: game.current_clue_giver as Seat | null,
      mySeat,
      hasCurrentTurnClue: currentTurnClue !== null,
    })

  // When a past turn is open in the viewer, `historySnap` is that turn's board
  // (else null = live). `historySnapshot` folds the guess log up to the viewed
  // turn onto the fixed words and rings that turn's own cells; the turn's clue
  // feeds the banner label. Snapshots are stable — a later realtime guess only
  // grows turns > historyId, so viewing a past turn never shifts under you.
  const historyClue =
    historyId !== null
      ? clues.find((c) => c.turn_number === historyId) ?? null
      : null
  const historySnap =
    historyId !== null
      ? historySnapshot(
          words,
          guesses,
          historyClue ? { word: historyClue.word, count: historyClue.count } : null,
          historyId,
        )
      : null

  // Duet's finished-player rule, surfaced to BOTH players so neither
  // reads the lopsided turn flow as a bug (enforced server-side in
  // `_end_turn`): once a seat's agents are all contacted it gives no
  // more clues and its partner takes every remaining turn. The flags
  // come from `useBoard`. Only meaningful in normal play — not sudden
  // death (nobody clues then) nor once the game is over.
  //   - viewerFinished: I'm done → my partner now gives every clue.
  //   - peerFinished:   my partner's done → I now give every clue
  //     (so I'm always the clue-giver — without this banner, "why does
  //     the clue never come back to me to guess?" looks broken).
  const bannerEligible = !gameOver && !inSuddenDeath
  const viewerFinished = bannerEligible && myAgentsDone
  const peerFinished = bannerEligible && peerAgentsDone

  return (
    <div className={cls(shared.layout, shared.mobileFill, styles.layout)}>
      <BoardCol
        // ── Mobile-only status strip (the SAME StateLine the InfoCol renders;
        //    on a phone the info column is off-canvas in the InfoSheet) ──
        mobileStatus={
          <StateLine
            greenFound={greenFound}
            turnNumber={game.turn_number}
            turns={setup.turns}
            inSuddenDeath={inSuddenDeath}
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
        // ── History viewer ──
        historyLabel={historySnap?.historyLabel ?? null}
        onExitHistory={exitHistory}
        // ── Guess dispatch (BoardCol owns submit_guess) — and the slot its
        //    not-oks, the clue panel's, and the verdict show into ──
        gameId={gameId}
        localFeedbackSlot={localFeedbackSlot}
        // ── Clue panel ──
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
        over={over}
        inSuddenDeath={inSuddenDeath}
        // ── State readout ──
        greenFound={greenFound}
        turnNumber={game.turn_number}
        // ── Finished-player banners ──
        viewerFinished={viewerFinished}
        peerFinished={peerFinished}
        peer={peer}
        // ── Action row ──
        actEndGame={actEndGame}
        actConcede={actConcede}
        actRestart={actRestart}
        actReveal={actReveal}
        actNewGame={actNewGame}
        actBackToClub={menu.actBackToClub}
        // ── Setup disclosure ──
        setup={setup}
        setupRows={summaryRows}
        firstClueGiver={firstClueGiver}
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

      {/* The AI clue-suggestion dialog. Rendered HERE — a child of `.layout`
          (a flex row), like the other dialogs — so react-rnd places it on-screen.
          (Deep inside the flex-column board column it lands below the viewport.) */}
      {clueSuggestion && (
        <CodenamesduetAISuggestCompanion
          state={clueSuggestion}
          onClose={() => setClueSuggestion(null)}
        />
      )}

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board slot + the info-column outcome line, and a
          win gets the celebration instead — once, at the moment it happens. */}
      {celebration.show && (
        <CelebrationBlockingModal
          title="You win! 🎉"
          body="All 15 agents contacted."
          onClose={celebration.close}
        />
      )}
    </div>
  )
}
