// cs-unmet

import { runRpc } from '@/common/supabase/dbResult'
import { useEffect, useState, useMemo } from 'react'
import { IconHideSolution } from '@/common/icons/icons'
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
import { useHistoryViewer } from '@/common/turn-log/useHistoryViewer'
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
import type { Player } from '../hooks/useGame'
import { useGame } from '../hooks/useGame'
import { useBoard } from '../hooks/useBoard'
import { useClues } from '../hooks/useClues'
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
 *       - GameTurnLog: the shared TurnLog table, scrolls internally.
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
 *
 * Self-contained so it can be called unconditionally before PlayArea's loading
 * early-return.
 */
function useTurnStatus(args: {
  game: { current_clue_giver: string | null; turn_number: number } | null | undefined
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
  if (game && !gameOver) {
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
}: GamePageCtx) {
  // Per-game setup blob — opaque on GamePageCtx, cast to codenamesduet's
  // shape here. Read-only at this layer; the only field we read
  // today is `turns` for the "X/Y turns" status counter.
  const codenamesduetSetup = setup as CodenamesduetSetup

  const { game, players, failure: gameFailure } = useGame(gameId)

  // The board is worked by clicks, so the page itself has nowhere for Tab to go
  // and an empty ring keeps it from walking out to the browser. While a clue is
  // being given, the clue form's own ring is innermost and Tab is its (CluePanel).
  useTabRing([])
  // The setup recap, built ONCE and handed to both consumers — the info column
  // renders it as <li>s, the print model prints the same array object
  // (docs/pdf.md → Setup rows).
  const summaryRows = useMemo(
    () => setupRows(codenamesduetSetup, 'coop' as const, players),
    [codenamesduetSetup, players],
  )

  // Mobile (docs/mobile.md → the shared recipe): below the breakpoint the board
  // fills the screen and the info column moves into an off-canvas <InfoSheet>,
  // opened from the hook's "Game info" menu item. The clue-giver's divergence —
  // the below-board clue input raises the OS keyboard, and the giver needs the
  // board's key colors visible while composing — is handled by NOT fighting it:
  // the board stays full-size and the page scrolls (scroll up to read the board,
  // down to the clue field). (An earlier attempt SHRANK the board to fit above
  // the keyboard; it crunched the board too small and scrolled badly.)
  const infoSheet = useInfoSheet()

  // `gameOver` mirrors common.games.is_terminal — derived early so
  // we can pass `revealPeer` into useBoard. `playState` carries the
  // gametype-specific value ('playing', 'sudden_death', 'won', ...)
  // for the phase derivation and the terminal copy.
  const gameOver = isTerminal

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
  const { revealed: peerKeyShown, toggle: togglePeerKey } =
    useSolutionReveal()

  const {
    words, guesses, myKey, peerKey, myAgentsDone, peerAgentsDone, loading,
    failure: boardFailure,
  } = useBoard(gameId, session.user.id, peerKeyShown)
  const { clues, failure: cluesFailure } = useClues(gameId)
  // The three hooks read six tables between them and each holds the envelope of
  // its own failure. FIRST one wins: they are equally fatal to the board, and
  // each envelope names its own read in `detail`, so the page says which one
  // died rather than "something didn't load".
  const failure = gameFailure ?? boardFailure ?? cluesFailure

  // ─── Win celebration ───────────────────────────────────
  // Confetti at the MOMENT the pair contacts the 15th agent (the winning guess
  // flips playState to 'won' on every connected client via realtime, so both
  // players celebrate together); opening an already-won game stays quiet
  // (useCelebration never pops on mount). Gated on `playState` alone — it's
  // available from the very first render, unlike anything read from useGame,
  // and duet is coop-only so 'won' is unambiguous. This is the ONLY terminal
  // modal duet shows: losses and the manual end land in-page only.
  const celebration = useCelebration(playState === 'won')

  // ─── Own-action feedback (local) ───────────────────────
  // The below-board slot — the LOCAL half of the feedback split (own action →
  // this slot; peer/turn-state news → the header via useTurnStatus). Born
  // HERE, in the coordinator, because BOTH columns show into it: BoardCol's
  // guess dispatch and clue panel (a rejected guess / clue / pass) AND
  // InfoCol's End (a failed end-game). It's NOT-OK-ONLY (a successful guess
  // shows on the board + turn log), plus the terminal verdict.
  const localFeedbackSlot = useFeedbackSlot('local')
  // Any key is the player's next move → dismiss a gesture-cleared message. The
  // dispatcher's field gate keeps a keystroke aimed at the clue field from
  // reaching it — only a key with nothing focused does.
  useDismissLocalFeedbackOnKey(localFeedbackSlot.dismiss)

  // ─── Turn-history viewer ───────────────────────────────
  // Click a turn-log row to replay that turn's board (the reveal state after that
  // turn's guesses, with those cells ringed in the history blue). Keyed by turn_number
  // — one clue per turn, a stable game-wide ordinal (like scrabble's seq). Feature
  // added on the still-monolithic PlayArea ahead of the BoardCol/InfoCol
  // decomposition; see docs/playarea.md.
  // Destructured (not `viewer.x`) to match the other games' PlayAreas and to keep
  // the effect deps honest: `exitHistory` is a stable useCallback, so the effect
  // below re-arms only when `isViewingHistory` flips.
  const { isViewingHistory, historyId, showHistory, exitHistory } =
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
        setup: codenamesduetSetup,
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

  // Reveal the partner's key — a LOCAL display toggle: it shows their card to me
  // alone, writes nothing, and affects nobody else. Terminal-only, because
  // mid-game the partner's card IS the game.
  const actReveal = useBoundAction('act-reveal', {
    describe: () => {
      if (peerKeyShown) {
        return { state: 'active', label: "Hide partner's key", icon: IconHideSolution }
      }
      // Named in the inert case too: the registry's bare "Reveal" would make the
      // row change its words as the game ended, which is not what it says.
      return { state: isTerminal ? 'active' : 'disabled', label: "Reveal partner's key" }
    },
    run: togglePeerKey,
  })

  // Seat/roster derivations, hoisted above the early return so the print model
  // (built in the binding's run, but reading these) sees the SAME values the
  // render does.
  const me = players.find((p) => p.user_id === session.user.id)
  const mySeat = me?.seat
  const peer = players.find((p) => p.user_id !== session.user.id)
  const greenFound = words.filter((w) => w.revealed_as === 'G').length

  // Print the board — a snapshot at CLICK time (docs/pdf.md). The peer's key is
  // a secret mid-game; `useBoard` only hands it over post-game and the model
  // refuses it before terminal regardless, so it can't reach paper early.
  const actPrintBoard = useBoundAction('act-print-board', {
    describe: () => (game && myKey && words.length >= 25 ? 'active' : 'hidden'),
    run: () => {
      if (!game || !myKey || words.length < 25) return
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
          turnCap: codenamesduetSetup.turns,
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
  // ended their turn, it's your turn now" otherwise. Called before the early
  // return (hook order); it no-ops while the game is loading.
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
  // (a Duet mulligan un-terminals the game). Above the early returns because
  // effects must be.
  const over = useMemo(() => (isTerminal ? buildOver(playState) : null), [isTerminal, playState])
  useEffect(function showTerminalVerdict() {
    if (!over) return
    const id = localFeedbackSlot.show(FeedbackMessage.terminalVerdict(over))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, over])

  if (loading) return <p>Loading board…</p>
  // A failed read is NOT a missing game. Both leave the board with nothing to
  // draw, and saying "Game not found." about a dead connection is a confident
  // wrong answer — this is what remains once the fault modal is dismissed.
  if (failure) return <EnvelopeErrorPage envelope={failure} />
  // `!myKey` and a short word list are DERIVED from the game row, so they can
  // only be missing when it is — one branch, not three.
  if (!game || !myKey || words.length < 25) return <p>Game not found.</p>

  const firstClueGiver = players.find(
    (p) => p.user_id === codenamesduetSetup.first_clue_giver_user_id,
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

  // Turn-history: when a past turn is open in the viewer, `snap` is that turn's
  // board (else null = live). `historySnapshot` folds the guess log up to the viewed
  // turn onto the fixed words and rings that turn's own cells; the turn's clue
  // feeds the banner label. Snapshots are stable — a later realtime guess only
  // grows turns > historyId, so viewing a past turn never shifts under you.
  const viewedClue =
    historyId !== null
      ? clues.find((c) => c.turn_number === historyId) ?? null
      : null
  const snap =
    historyId !== null
      ? historySnapshot(
          words,
          guesses,
          viewedClue ? { word: viewedClue.word, count: viewedClue.count } : null,
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
            turns={codenamesduetSetup.turns}
            inSuddenDeath={inSuddenDeath}
          />
        }
        // ── Board to render (live OR the historical snapshot — picked here) ──
        words={snap ? snap.words : words}
        myKey={myKey}
        peerKey={peerKey}
        mySeat={mySeat}
        gameOver={gameOver}
        readOnly={!cellsClickable}
        historyLitTiles={snap?.historyLitTiles}
        // ── History viewer ──
        isViewingHistory={isViewingHistory}
        historyLabel={snap?.description ?? null}
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
        setup={codenamesduetSetup}
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
