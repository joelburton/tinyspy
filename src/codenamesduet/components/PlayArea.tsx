import { failureMessage } from '../../common/lib/game/serverError'
import { callRpc } from '../../common/lib/game/callRpc'
import { useCallback, useEffect, useRef, useState, type ReactNode, useMemo } from 'react'
import { IconNewGame, IconPrint, IconRestart, IconReveal } from '../../common/components/icons'
import type { GenericFeedbackApi, GenericFeedbackMsg, GenericFeedbackTone, GamePageCtx } from '../../common/lib/games'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import { cls } from '../../common/lib/util/cls'
import { db } from '../db'
import { db as commonDb } from '../../common/db'
import { CelebrationDialog } from '../../common/components/game/CelebrationDialog'
import { useCelebration } from '../../common/hooks/game/useCelebration'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useDismissLocalFeedbackOnKey } from '../../common/hooks/feedback/useDismissLocalFeedbackOnKey'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, END_GAME_CONFIRM, NEW_GAME_CONFIRM, RESTART_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { useSingleFlight } from '../../common/hooks/ui/useSingleFlight'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { buildDuetPrintModel } from '../pdf/model'
import { printCodenamesduetPdf } from '../pdf/printCodenamesduetPdf'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
import { setupRows } from '../lib/setupSummary'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import type { ClueRow } from '../hooks/useClues'
import type { Player } from '../hooks/useGame'
import { useGame } from '../hooks/useGame'
import { useBoard } from '../hooks/useBoard'
import { useClues } from '../hooks/useClues'
import { derivePhase, type GameStatus, type Seat } from '../lib/phase'
import { turnSnapshot } from '../lib/history'
import type { CodenamesduetSetup } from '../lib/setup'
import { ClueSuggestionModal, type SuggestState } from './CluePanel'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import { StateLine } from './StateLine'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // codenamesduet-specific color tokens (lazy-loaded with this chunk)

/**
 * codenamesduet's play surface — two-column viewport-bound composition:
 *
 *   - **Board column** (left, flex) — the 5×5 Board, with the fixed-height
 *     `belowBoard` slot under it (the CluePanel during play, a local
 *     `<GenericFeedbackPill>` for an own-action error or the terminal verdict).
 *   - **Info column** (fixed-width):
 *       - Status: "{greenFound}/15 agents · {turn-1}/{turns} turns spent"
 *       - Action row: the EndGameButton while playing; at terminal the bold
 *         outcome line + a compact Back-to-club button. Fixed minimum height so
 *         swapping between them doesn't shift the log below.
 *       - GameTurnLog: the shared TurnLog table, scrolls internally.
 *
 * Cross-cutting chrome (logo, chat, pause, timer, the players strip)
 * lives on `<GamePage>` above this component.
 *
 * **Terminal handling.** No modal carries the verdict (docs/ui.md → Terminal
 * results): a dialog saying what the below-board pill already says — same
 * string, same moment — would only cost a dismiss. So it's two in-page
 * surfaces plus one celebration:
 *
 *   1. The below-board slot swaps the CluePanel for a permanent
 *      outcome-colored pill carrying `over.verdict`, and the info-column
 *      action row swaps the End button for a bold `over.message` line + a
 *      compact Back-to-club button (wired to `ctx.goToClub`). Both persist
 *      until the user navigates away.
 *   2. A **win** — and only a win — also pops `<CelebrationDialog>`, at the
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

/* `ownAction` lived here — a TIMED own-move pill builder. Every caller was a
 * failed RPC, and those now come from `failureMessage`, which returns `sticky`
 * for a rejection and `manual` for a fault. So codenamesduet's errors stopped
 * auto-clearing after a beat; they wait for the next move like every other
 * game's. That's the roster convention this file was the last to hold out
 * against, and losing the builder is how it joined. */

/** Per-status terminal copy for codenamesduet. `playState` is the authoritative
 *  input — only terminal states appear here. Returns the shared `TerminalCopy`
 *  shape (the same psychicnum/connections use): `verdict` + `tone` drive the
 *  permanent below-board pill; `message` + `tone` drive the short, bold,
 *  color-coded line in the info-column action row (won = green, lost = red,
 *  manual end = neutral). Detail-on-page intentionally:
 *  the agents-found counter sits in the info-column state line, the board carries
 *  the revealed tiles.
 *
 *  The loss verdicts are terse ("Lost: assassin") rather than sentences: the pill
 *  is a fixed-height below-board slot, and on a phone a long verdict wraps and
 *  grows it. */
function buildOver(playState: string): TerminalCopy {
  if (playState === 'won') {
    return { verdict: 'You win!', message: 'You won!', tone: 'won' }
  }
  if (playState === 'lost_assassin') {
    return {
      verdict: 'Lost: assassin',
      message: 'Assassin revealed',
      tone: 'lost',
    }
  }
  if (playState === 'lost_clock') {
    return {
      verdict: 'Lost: out of turns',
      message: 'Out of turns',
      tone: 'lost',
    }
  }
  // Manual end (codenamesduet.end_game): the friends stopped the game on purpose
  // — the uniform neutral terminal shared with the other games, owned by the
  // shared endedCopy(). codenamesduet is coop-only.
  if (playState === 'ended') return endedCopy('coop')
  // lost_timeout (and any future terminal state that doesn't match above —
  // falls back to a generic timer-out message rather than crashing).
  return {
    verdict: 'Lost: out of time',
    message: 'Out of time',
    tone: 'lost',
  }
}

/**
 * Surface the current turn-state in the header feedback pill, firing once each
 * time it CHANGES. The header describes **what the PEER is doing** — never what
 * YOU should do (your own to-do is conveyed by the below-board clue UI). So all
 * four turn states read as "{peer} {doing}", neutral and sticky (they describe an
 * ongoing peer state, not a transient nudge, so they persist until it changes).
 *
 * **Telegraphic on purpose** ("waiting for you", not "is waiting for your turn to
 * complete"): the header pill shares its row with the logo and chat bubble, so on
 * a 390px phone it fits ~26 characters and silently ELLIPSISES the rest — and the
 * dot alone eats two of them. Anything longer than a few words is a message the
 * phone player never finishes reading. Keep additions this short.
 *
 * The one exception is **sudden death** — a standing danger warning, not a peer
 * action — which stays here in `error` tone (and is also shown, persistently, in
 * full, below the board via the CluePanel notice, which has room for it).
 *
 * Self-contained so it can be called unconditionally before PlayArea's loading
 * early-return.
 */
function useTurnPill(args: {
  game: { current_clue_giver: string | null; turn_number: number } | null | undefined
  players: Player[]
  clues: ClueRow[]
  playState: string
  gameOver: boolean
  sessionUserId: string
  feedback: GenericFeedbackApi
}) {
  const { game, players, clues, playState, gameOver, sessionUserId, feedback } = args

  // `key` is a stable STRING used only to dedup (fire the pill on real changes);
  // `node` is what's actually shown. Splitting them lets the peer's identity be an
  // <ActorDot> WIDGET in the text (dot-then-name) rather than a baked-in name — so
  // on a phone it collapses to just the dot, and a long username can't blow out
  // the header pill. (Previously the name was interpolated into the string and the
  // disc came from the pill's separate `dot` prop.)
  let key: string | null = null
  let node: ReactNode = null
  let tone: GenericFeedbackTone = 'neutral'
  // Peer-status pills are messages (sticky — "moth is writing a clue" is true
  // until it isn't). Sudden death is a CONDITION: once the turn budget is spent
  // you're in it for the rest of the game, and only the verdict replaces it —
  // which is what `permanent` means, and why it wears the filled background.
  // The KIND, not the object: an object literal is a new identity every render,
  // which would re-run the effect below on each one.
  let modeKind: GenericFeedbackMsg['mode']['kind'] = 'permanent'
  if (game && !gameOver) {
    const me = players.find((p) => p.user_id === sessionUserId)
    const peer = players.find((p) => p.user_id !== sessionUserId)
    const { isGuessPhase, isClueGiver, inSuddenDeath } = derivePhase({
      status: playState as GameStatus,
      currentClueGiver: game.current_clue_giver as Seat | null,
      mySeat: me?.seat,
      hasCurrentTurnClue: clues.some((c) => c.turn_number === game.turn_number),
    })
    if (inSuddenDeath) {
      key = 'sudden-death'
      node = 'Sudden death: wrong loses'
      tone = 'error'
    } else {
      modeKind = 'sticky'
      // What the peer is doing — the phrase WITHOUT their name (the ActorDot
      // supplies "● moth" ahead of it), and without a verb ("● moth guessing"):
      // see the phone-width note above.
      const rest = !isGuessPhase
        ? isClueGiver
          ? 'waiting for clue'
          : 'writing clue'
        : isClueGiver
          ? 'guessing'
          : 'waiting for you'
      key = `${peer?.user_id ?? 'partner'}:${rest}`
      node = (
        <>
          <ActorDot actor={peer} fallback="Your partner" /> {rest}
        </>
      )
    }
  }

  // Fire only on an actual change (the ref also absorbs StrictMode's double
  // effect-invoke). Dedup on `key` (a string); `node` is a fresh element each
  // render, so the early-return on an unchanged key is what prevents a re-show
  // loop. Clearing when there's no state (game over / loading) tidies the pill.
  // Every message is sticky — it's an ongoing state, not a nudge.
  const prev = useRef<string | null>(null)
  useEffect(() => {
    if (key === prev.current) return
    prev.current = key
    if (key === null) {
      feedback.clear()
      return
    }
    feedback.show({
      tone,
      text: node,
      mode: { kind: modeKind },
    })
  }, [key, tone, node, modeKind, feedback])
}

/** Every duet board has fifteen green agents (the StateLine prints the same
 *  fixed total); named so the print model and the readout can't disagree. */
const TOTAL_AGENTS = 15

export function PlayArea({
  session,
  gameId,
  playState,
  isTerminal,
  solutionRevealed,
  setup,
  globalFeedback,
  goToClub,
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

  const { game, players } = useGame(gameId)
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

  // The shared end-game confirm modal (replaces window.confirm — a true
  // modal: backdrop-blocked board, dialog-owned keyboard).
  const { confirm: confirmAction, confirmDialog } = useConfirmDialog()
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
  // The answer lives on the row — `common.games.solution_revealed`, the one
  // common "may they see it?" flag — so a win opens it automatically
  // (`end_game`), Reveal opens it for BOTH players at once (the partner is the
  // person you're doing the post-mortem with, so a one-sided reveal would be
  // the wrong shape), and there's no per-game state to keep in sync. Not a
  // shield: both key columns are readable by every club member under the
  // friends trust model.
  const peerKeyShown = solutionRevealed

  const { words, guesses, myKey, peerKey, myAgentsDone, peerAgentsDone, loading } =
    useBoard(gameId, session.user.id, peerKeyShown)
  const { clues } = useClues(gameId)

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
  // The below-board local-feedback channel — the LOCAL half of the feedback split
  // (own action → this pill; peer/turn-state news → the header pill via useTurnPill).
  // It lives HERE, in the coordinator, because BOTH columns write it: BoardCol's
  // guess dispatch (a rejected guess) AND InfoCol's End (a failed end-game). It's
  // ERROR-ONLY (a successful guess shows on the board + turn log), plus the terminal
  // verdict. PlayArea passes `localFeedback` down to BoardCol to render + an `onError`
  // that wraps it; the guess RPC + pending-tile state moved into BoardCol.
  const { localFeedback, showLocalFeedback, clearLocalFeedback } =
    useLocalFeedback({ locked: isTerminal })
  // Any key is the player's next move → dismiss the own-move pill. Guarded by
  // useGlobalKeyHandler, so typing in the clue field (a focused input) never
  // triggers it — only a key with nothing focused does. No-op at terminal (locked).
  useDismissLocalFeedbackOnKey(clearLocalFeedback)

  // ─── Turn-history viewer ───────────────────────────────
  // Click a turn-log row to replay that turn's board (the reveal state after that
  // turn's guesses, with those cells ringed history-yellow). Keyed by turn_number
  // — one clue per turn, a stable game-wide ordinal (like scrabble's seq). Feature
  // added on the still-monolithic PlayArea ahead of the BoardCol/InfoCol
  // decomposition; see docs/playarea-decomposition-plan.md.
  // Destructured (not `viewer.x`) to match the other games' PlayAreas and to keep
  // the effect deps honest: `exitViewing` is a stable useCallback, so the effect
  // below re-arms only when `viewing` flips.
  const { viewing, viewingId, select: selectTurn, exitViewing, exitOnKey } =
    useHistoryViewer<number>()
  // A bare keystroke (nothing focused) returns to the live board — the shared
  // "type anywhere to exit". useGlobalKeyHandler ignores keys aimed at the clue
  // input, so typing a clue never kicks you out; exitOnKey no-ops when not viewing.
  useGlobalKeyHandler(exitOnKey)
  // (Click-anywhere-to-exit is intrinsic to useHistoryViewer now — no per-game wiring.)

  // The AI clue-suggestion dialog. State lives HERE (not in the deep ClueForm)
  // so the <ClueSuggestionModal> renders at the `.layout` level — a panel
  // rendered deep in the flex-column board lands off-screen (react-rnd positions
  // from the static flow position). ClueForm drives it via onSuggestionChange.
  const [clueSuggestion, setClueSuggestion] = useState<SuggestState | null>(null)
  console.log('[ClueHint] PlayArea render — clueSuggestion:', clueSuggestion)

  // (The guess dispatch — submit_guess + the pending-tile state + the in-flight
  // guard — moved into BoardCol, beside the board it gates.)

  // ─── End-game action (info-column action-row button) ───
  // The friends' explicit "we're done" affordance — an action-row button (like
  // psychicnum/connections) rather than a GamePage menu item. codenamesduet has
  // automatic terminals (won / lost_*), but this lets them abandon an in-progress
  // game early — fires codenamesduet.end_game, a neutral terminal
  // (play_state='ended', everyone {won:false}). Always confirmed via the shared
  // modal (ending is harmful for the whole group, even coop/solo); it's
  // irreversible. An error is an own-action error → the same local flash as a
  // rejected guess.
  /** Open the partner's key for BOTH players — the terminal RevealButton and
   *  its menu twin. Common RPC, because the flag is common
   *  (`common.games.solution_revealed`); terminal-only server-side. */
  const revealPeerKey = useCallback(async () => {
    const bad = await callRpc(commonDb, 'reveal_solution', { target_game: gameId })
    if (bad) showLocalFeedback(bad)
  }, [gameId, showLocalFeedback])

  /** Restart — run this board back with the same key cards (2026-08-03).
   *  A MULLIGAN, not a fresh puzzle: you keep the cards, so the second run is
   *  played knowing where the assassin sits. That's the deliberate trade — a
   *  first-guess assassin ends a game nobody got to play, and "let's just run
   *  it back" is what the friends actually say. Someone who wants a blind board
   *  has New game, the next item down. Confirmed mid-game like everywhere. */
  const handleRestart = useCallback(async () => {
    if (!isTerminal && !(await confirmAction(RESTART_CONFIRM))) return
    const bad = await callRpc(db, 'replay_board', { target_game: gameId })
    if (bad) showLocalFeedback(bad)
  }, [gameId, isTerminal, confirmAction, showLocalFeedback])

  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!(await confirmAction(END_GAME_CONFIRM))) return
    const bad = await callRpc(db, 'end_game', { target_game: gameId })
    if (bad) showLocalFeedback(bad)
  }, [gameId, isTerminal, showLocalFeedback, confirmAction])

  // ─── New game ───────────────────────────────────────────
  // A FRESH game (new id, a newly sampled board) with THIS game's setup +
  // roster, in the same club — the "same again!" action after a solve, without
  // a trip through the club page's setup dialog. codenamesduet's create_game
  // samples its board inline, so this is a direct RPC (no edge function) and
  // takes no `mode` (the game is coop-only, one gametype). Non-destructive —
  // common.create_game un-currents THIS game into the club's list — so no
  // confirm; the creator jumps in via ctx.goToGame, the peer arrives via the
  // game-invitation toast.
  //
  // NOTE there is deliberately no "Restart" twin here (Joel's call). The
  // other games' replay re-runs the SAME puzzle; duet's whole board — including
  // which words are the assassin — is the secret, so replaying it would hand
  // both players a board they'd already learned. A new sample is the only
  // meaningful "again".
  const createNewGame = useCallback(async () => {
    // Starting a new game mid-play SHELVES this one (create_game clears the
    // club's current-view flag; it stays resumable from the club page). Confirm
    // anyway so an accidental `+` doesn't read as "I just lost my game" — the
    // copy says shelved, not ended. At terminal there's nothing to interrupt.
    if (!isTerminal && !(await confirmAction(NEW_GAME_CONFIRM))) return
    const { data, error } = await db
      .rpc('create_game', {
        target_club: clubHandle,
        setup: codenamesduetSetup,
        player_user_ids: members.map((m) => m.user_id),
      })
      .single()
    if (error || !data) {
      showLocalFeedback(failureMessage(error, 'new game'))
      return
    }
    goToGame('codenamesduet', (data as { id: string }).id)
  }, [clubHandle, codenamesduetSetup, members, goToGame, showLocalFeedback, confirmAction, isTerminal])

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

  // ─── Header menu (each game owns its whole menu now) ────
  // codenamesduet is coop-only (fixed 2 seats, no compete sibling), so the menu
  // is Help + End game + Back to club — no `extra` sections. `buildGameMenu`
  // renders the End-game item (⌥⌫, disabled at terminal) wired to the same
  // `handleEndGame` the info-column button uses. `handleEndGame` is a stable
  // useCallback and `menu` is stable, so this effect re-runs only when
  // `isTerminal` flips — no setState loop. Placed above the loading early-return
  // to keep hook order stable.
  // Seat/roster derivations, hoisted above the early return so the print model
  // (built in the menu effect, a hook) reads the SAME values the render does.
  const me = players.find((p) => p.user_id === session.user.id)
  const mySeat = me?.seat
  const peer = players.find((p) => p.user_id !== session.user.id)
  const greenFound = words.filter((w) => w.revealed_as === 'G').length

  useEffect(() => {
    // "Print board (PDF)" — a snapshot at click time (docs/pdf.md). The peer's
    // key is a secret mid-game; useBoard only hands it over post-game and the
    // model refuses it before terminal regardless, so it can't reach paper early.
    const printModel =
      game && myKey && words.length >= 25
        ? buildDuetPrintModel({
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
          })
        : null
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: 'coop',
        isTerminal,
        onEndGame: () => void handleEndGame(),
        extra: [
          // Mobile-only "Game info" item (off-canvas info column); empty on desktop.
          // The same actions the terminal row offers, reachable mid-game too.
          {
            items: [
              { id: 'restart', icon: IconRestart, label: 'Restart', onClick: () => void handleRestart() },
              { id: 'new-game', icon: IconNewGame, label: 'New game', shortcut: '+', onClick: () => void handleNewGame() },
              // The menu twin of the terminal row's boxed-eye button. Inert
              // until the game's over — mid-game the partner's card is the
              // whole point of the game.
              {
                id: 'reveal',
            icon: IconReveal,
            label: "Reveal partner's key",
                disabled: !isTerminal || peerKeyShown,
                onClick: () => void revealPeerKey(),
              },
            ],
          },
          ...(printModel
            ? [{ items: [{ id: 'print', icon: IconPrint, label: 'Print board (PDF)', onClick: () => printCodenamesduetPdf(printModel) }] }]
            : []),
        ],
      }),
    )
    return () => menu.setGameSections([])
  }, [
    menu, isTerminal, handleEndGame, handleNewGame, handleRestart, revealPeerKey, peerKeyShown,
    // The print model's inputs — rebuilt whenever the printable state moves,
    // which is what keeps the snapshot current at click time.
    brand, title, game, words, myKey, peerKey, mySeat, clues, guesses, players,
    greenFound, codenamesduetSetup.turns,
    summaryRows,
  ])

  // Announce turn-state changes in the header feedback pill — it's easy to miss
  // "the other player ended their turn, it's your turn now" otherwise. Called
  // before the early return (hook order); it no-ops while the game is loading.
  useTurnPill({
    game,
    players,
    clues,
    playState,
    gameOver: isTerminal,
    sessionUserId: session.user.id,
    feedback: globalFeedback,
  })

  if (loading || !game || !myKey || words.length < 25) {
    return <p>Loading board…</p>
  }

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

  // Modal / indicator copy is derived once.
  const over = gameOver ? buildOver(playState) : null

  // Turn-history: when a past turn is open in the viewer, `snap` is that turn's
  // board (else null = live). `turnSnapshot` folds the guess log up to the viewed
  // turn onto the fixed words and rings that turn's own cells; the turn's clue
  // feeds the banner label. Snapshots are stable — a later realtime guess only
  // grows turns > viewingId, so viewing a past turn never shifts under you.
  const viewedClue =
    viewingId !== null
      ? clues.find((c) => c.turn_number === viewingId) ?? null
      : null
  const snap =
    viewingId !== null
      ? turnSnapshot(
          words,
          guesses,
          viewedClue ? { word: viewedClue.word, count: viewedClue.count } : null,
          viewingId,
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
        highlight={snap?.highlight}
        // ── History viewer ──
        viewing={viewing}
        viewingDescription={snap?.description ?? null}
        onExitViewing={exitViewing}
        // ── Guess dispatch (BoardCol owns submit_guess) ──
        gameId={gameId}
        onError={showLocalFeedback}
        clearLocalFeedback={clearLocalFeedback}
        // ── Below-board slot content ──
        over={over}
        localPill={localFeedback}
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
        onEndGame={() => void handleEndGame()}
        onRestart={() => void handleRestart()}
        onReveal={() => void revealPeerKey()}
        revealDisabled={peerKeyShown}
        onNewGame={handleNewGame}
        startingNewGame={startingNewGame}
        onBackToClub={goToClub}
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
        viewingSeq={viewingId}
        onSelectTurn={selectTurn}
        />
      </InfoSheet>

      {/* The AI clue-suggestion dialog. Rendered HERE — a child of `.layout`
          (a flex row), like the other dialogs — so react-rnd places it on-screen.
          (Deep inside the flex-column board column it lands below the viewport.) */}
      {clueSuggestion && (
        <ClueSuggestionModal
          state={clueSuggestion}
          onClose={() => setClueSuggestion(null)}
        />
      )}

      {/* No modal for the verdict (docs/ui.md → Terminal results): it's carried
          in-page by the below-board pill + the info-column outcome line, and a
          win gets the celebration instead — once, at the moment it happens. */}
      {celebration.show && (
        <CelebrationDialog
          title="You win! 🎉"
          body="All 15 agents contacted."
          onClose={celebration.close}
        />
      )}
      {confirmDialog}
    </div>
  )
}
