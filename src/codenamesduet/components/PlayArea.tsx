import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { GenericFeedbackApi, GenericFeedbackMsg, GenericFeedbackTone, GamePageCtx } from '../../common/lib/games'
import { ActorDot } from '../../common/components/game/lists/ActorMention'
import { cls } from '../../common/lib/util/cls'
import { db } from '../db'
import { TerminalModal } from '../../common/components/game/terminal/TerminalModal'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useDismissLocalFeedbackOnKey } from '../../common/hooks/feedback/useDismissLocalFeedbackOnKey'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { useInfoSheet } from '../../common/hooks/game/useInfoSheet'
import { useConfirmDialog, END_GAME_CONFIRM } from '../../common/hooks/ui/useConfirmDialog'
import { InfoSheet } from '../../common/components/game/InfoSheet'
import { buildGameMenu } from '../../common/lib/game/gameMenu'
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
 *       - Status: "{greenFound}/15 agents · {turn}/{turns} turns"
 *       - Action row: the EndGameButton while playing; at terminal the bold
 *         outcome line + a compact Back-to-club button. Fixed minimum height so
 *         swapping between them doesn't shift the log below.
 *       - GameTurnLog: the shared TurnLog table, scrolls internally.
 *
 * Cross-cutting chrome (logo, chat, pause, timer, the players strip)
 * lives on `<GamePage>` above this component.
 *
 * **Terminal handling.** Two pieces:
 *
 *   1. `<GameOverModal>` (shared) pops on terminal entry. State is
 *      a local boolean initialized to `isTerminal` (true if the
 *      user navigated into an already-won/lost game), bumped to
 *      true by an effect when `isTerminal` flips during play. No
 *      reopen after close — review mode takes over.
 *   2. The action slot shows the indicator below until the user
 *      navigates away. Same status label as the modal's title;
 *      same Back-to-club button as the modal's primary action,
 *      both wired to `ctx.goToClub`.
 *
 * Most of the game logic is server-side (in plpgsql RPCs); this
 * component's job is to load the row + board + clues via the three
 * hooks, derive phase (who clicks what, when) via `derivePhase`, and
 * hand each piece to the right sub-component. Realtime keeps
 * everything in sync.
 */

/** Build codenamesduet's own-action local pill: outline + TIMED (auto-clears
 *  after a beat — the only own-move feedback is a rejected guess / failed End /
 *  clue-panel error). A pure msg-builder over the shared `useLocalFeedback`. */
const ownAction = (tone: GenericFeedbackTone, text: string): GenericFeedbackMsg => ({
  tone,
  text,
  variant: 'outline',
  dismiss: { kind: 'timed' },
})

/** Per-status terminal copy for codenamesduet. `playState` is the authoritative
 *  input — only terminal states appear here. Returns the shared `TerminalCopy`
 *  shape (the same psychicnum/connections use): `outcome` + `verdict` drive the
 *  GameOverModal and the permanent below-board pill; `message` + `tone` drive the
 *  short, bold, color-coded line in the info-column action row (won = green,
 *  lost = red, manual end = neutral). Detail-on-page intentionally: the
 *  agents-found counter sits in the info-column state line, the board carries the
 *  revealed tiles. */
function buildOver(playState: string): TerminalCopy {
  if (playState === 'won') {
    return { outcome: 'won', verdict: 'You win!', message: 'You won!', tone: 'won' }
  }
  if (playState === 'lost_assassin') {
    return {
      outcome: 'lost',
      verdict: 'You lost: assassin revealed',
      message: 'Assassin revealed',
      tone: 'lost',
    }
  }
  if (playState === 'lost_clock') {
    return {
      outcome: 'lost',
      verdict: 'You lost: out of turns',
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
    outcome: 'lost',
    verdict: 'You lost: out of time',
    message: 'Out of time',
    tone: 'lost',
  }
}

/**
 * Surface the current turn-state in the header feedback pill, firing once each
 * time it CHANGES. The header describes **what the PEER is doing** — never what
 * YOU should do (your own to-do is conveyed by the below-board clue UI). So all
 * four turn states read as "{peer} is …", neutral and sticky (they describe an
 * ongoing peer state, not a transient nudge, so they persist until it changes).
 *
 * The one exception is **sudden death** — a standing danger warning, not a peer
 * action — which stays here in `error` tone (and is also shown, persistently,
 * below the board via the CluePanel notice).
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
  let outline = false // peer-status pills are transient/outline; sudden death is a filled warning
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
      node = 'Sudden death — any non-green reveal loses'
      tone = 'error'
    } else {
      outline = true
      // What the peer is doing — the sentence WITHOUT their name (the ActorDot
      // supplies "● moth" ahead of it).
      const rest = !isGuessPhase
        ? isClueGiver
          ? 'is waiting for your clue'
          : 'is writing a clue'
        : isClueGiver
          ? 'is making guesses'
          : 'is waiting for your turn to complete'
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
      ...(outline ? { variant: 'outline' as const } : {}),
      dismiss: { kind: 'sticky' },
    })
  }, [key, tone, node, outline, feedback])
}

export function PlayArea({
  session,
  gameId,
  playState,
  isTerminal,
  setup,
  globalFeedback,
  goToClub,
  menu,
}: GamePageCtx) {
  // Per-game setup blob — opaque on GamePageCtx, cast to codenamesduet's
  // shape here. Read-only at this layer; the only field we read
  // today is `turns` for the "X/Y turns" status counter.
  const codenamesduetSetup = setup as CodenamesduetSetup
  const { game, players } = useGame(gameId)

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
  // for the phase derivation and the GameOverModal copy.
  const gameOver = isTerminal
  const { words, guesses, myKey, peerKey, myAgentsDone, peerAgentsDone, loading } =
    useBoard(gameId, session.user.id, gameOver)
  const { clues } = useClues(gameId)

  // Shared terminal-modal scaffold: open on mount if already-
  // terminal, re-pop when isTerminal flips during play, no re-pop
  // after dismiss. See common/hooks/game/useTerminalModal.ts.

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
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!(await confirmAction(END_GAME_CONFIRM))) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) showLocalFeedback(ownAction('error', `End game failed: ${error.message}`))
  }, [gameId, isTerminal, showLocalFeedback, confirmAction])

  // ─── Header menu (each game owns its whole menu now) ────
  // codenamesduet is coop-only (fixed 2 seats, no compete sibling), so the menu
  // is Help + End game + Back to club — no `extra` sections. `buildGameMenu`
  // renders the End-game item (⌥⌫, disabled at terminal) wired to the same
  // `handleEndGame` the info-column button uses. `handleEndGame` is a stable
  // useCallback and `menu` is stable, so this effect re-runs only when
  // `isTerminal` flips — no setState loop. Placed above the loading early-return
  // to keep hook order stable.
  useEffect(() => {
    menu.setGameSections(
      buildGameMenu({
        menu,
        mode: 'coop',
        isTerminal,
        onEndGame: () => void handleEndGame(),
        // Mobile-only "Game info" item (off-canvas info column); empty on desktop.
        extra: infoSheet.menuSections,
      }),
    )
    return () => menu.setGameSections([])
  }, [menu, isTerminal, handleEndGame, infoSheet.menuSections])

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

  const me = players.find((p) => p.user_id === session.user.id)
  const mySeat = me?.seat
  const peer = players.find((p) => p.user_id !== session.user.id)
  const firstClueGiver = players.find(
    (p) => p.user_id === codenamesduetSetup.firstClueGiverUserId,
  )
  const greenFound = words.filter((w) => w.revealed_as === 'G').length

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
        onError={(m) => showLocalFeedback(ownAction('error', m))}
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
        onBackToClub={goToClub}
        // ── Setup disclosure ──
        setup={codenamesduetSetup}
        firstClueGiver={firstClueGiver}
        // ── Turn-history log ──
        clues={clues}
        guesses={guesses}
        players={players}
        gameOver={gameOver}
        viewingSeq={viewingId}
        onSelectTurn={selectTurn}
        />
      </InfoSheet>

      {/* The AI clue-suggestion dialog. Rendered HERE — a child of `.layout`
          (a flex row), like GameOverModal — so react-rnd places it on-screen.
          (Deep inside the flex-column board column it lands below the viewport.) */}
      {clueSuggestion && (
        <ClueSuggestionModal
          state={clueSuggestion}
          onClose={() => setClueSuggestion(null)}
        />
      )}

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
      {confirmDialog}
    </div>
  )
}
