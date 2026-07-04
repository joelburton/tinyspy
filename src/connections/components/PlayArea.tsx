import { useCallback, useState } from 'react'
import { cls } from '../../common/lib/util/cls'
import type { GamePageCtx } from '../../common/lib/games'
import { colorByUserIdMap, colorVarFor } from '../../common/lib/color/memberColor'
import { TerminalModal } from '../../common/components/game/terminal/TerminalModal'
import { useLocalFeedback } from '../../common/hooks/feedback/useLocalFeedback'
import { useDismissLocalFeedbackOnKey } from '../../common/hooks/feedback/useDismissLocalFeedbackOnKey'
import { useGlobalFeedback } from '../../common/hooks/feedback/useGlobalFeedback'
import { useHistoryViewer } from '../../common/hooks/game/useHistoryViewer'
import { useGlobalKeyHandler } from '../../common/hooks/input/useGlobalKeyHandler'
import { memberById } from '../../common/lib/game/peers'
import { endedCopy, type TerminalCopy } from '../../common/lib/game/terminalCopy'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import type { ConnectionsSetup } from '../lib/setup'
import { turnSnapshot } from '../lib/history'
import { stickyPill } from '../../common/lib/game/localPills'
import { BoardCol } from './BoardCol'
import { InfoCol } from './InfoCol'
import shared from '../../common/components/game/PlayArea.module.css'
import styles from './PlayArea.module.css'
import '../theme.css'  // connections-specific color tokens (lazy with this chunk)

/** Four categories to find, four mistakes allowed — the NYT Connections
 *  constants, shown in the setup disclosure + the "N/4 found" state line. */
const CATEGORY_COUNT = 4
const MISTAKE_BUDGET = 4

/**
 * connections's play surface, shared between the coop and compete
 * manifests. The mode is read from `game.mode` (set at create-
 * game time and never changes); rendering branches on it for:
 *
 *   - **Selection**: coop shares via Broadcast (the Board
 *     shows per-tile peer attribution); compete keeps selections
 *     local (every tile reads as "mine" because the broadcast
 *     send is suppressed in useGame).
 *   - **Mistakes**: coop shows a single shared dot row; compete
 *     shows an OpponentStrip with everyone's per-player
 *     counts.
 *   - **Eliminated state** (compete only, non-terminal): caller's
 *     mistake_count >= 4 → render the unmatched categories
 *     revealed + a "you're out" indicator; let the game continue
 *     for the survivors (opponents' counts keep ticking via the
 *     realtime players-row subscription).
 *   - **Terminal copy**: coop says "you win/lose" (team verdict);
 *     compete distinguishes "you won the race" from "beaten to
 *     the punch" using the caller's matched-count.
 *   - **Feedback split** (docs/deferred.md → Feedback channels;
 *     mirrors psychicnum): my OWN guess result flashes green/red
 *     in the commit slot below the board (local — near my eyes,
 *     about what I just did); a teammate's guess is narrated in
 *     the GamePage header pill (group). Compete reaches neither
 *     header branch — the guesses log is RLS-scoped to the caller,
 *     so there are no peer events to announce.
 *
 * Submission flow:
 *   1. FE evaluates the guess locally against board.categories
 *      (FE-knows-the-answer; see docs/games/connections.md).
 *   2. Dup detection (sameTileSet on the existing guess log) —
 *      in compete the log is RLS-filtered to caller, so dup-
 *      detection only catches the caller's own repeats. Good.
 *   3. Fire submit_guess RPC with (tiles, result, rank).
 *   4. Realtime postgres-changes propagate to every player; the
 *      hook refetches automatically (players + guesses + games).
 *   5. On a CORRECT guess only, broadcast a `clear` (no-op in
 *      compete because broadcast is local-only there; coop drops
 *      everyone's selection). A wrong / one-away guess keeps the
 *      selection so the player can tweak it and resubmit.
 *
 * **Pause behavior**: PauseBoundary in GamePage unmounts this
 * component on pause and remounts on resume. The shared selection
 * state lives in `useGame` (component-local + broadcast); the
 * unmount drops it automatically.
 */
export function PlayArea({
  session,
  gameId,
  players,
  playState,
  isTerminal,
  timer,
  setup,
  globalFeedback,
  goToClub,
}: GamePageCtx) {
  const {
    game,
    guesses,
    matchedCategories,
    mistakeCount,
    opponentFound,
    isEliminated,
    selections,
    unionTiles,
    toggleTile,
    sendClear,
    loading,
  } = useGame(session, gameId)
  // Hints modal open/closed — set by InfoCol's Hints button, the modal renders in
  // BoardCol (it's about the board). (The guess dispatch, the local tile shuffle, and
  // the wrong-guess shake all moved into BoardCol.)
  const [hintsOpen, setHintsOpen] = useState(false)

  // ─── Commit-slot flash (own-action feedback, local) ─────
  // A transient message shown *in place of the commit buttons* for the
  // player's own guess: "Correct!" (green) / "One away!" (amber) /
  // "Incorrect" (red), or a validation/RPC error (red). It lives in the
  // commit row's already-reserved height (never a new line that would
  // reflow the board — docs/ui.md → Layout stability), and `clearLocalFeedback`
  // dismisses it the moment the player clicks a tile to start a fresh selection
  // (handleToggle below) — the tile-click analog of psychicnum's "typing
  // dismisses the flash". Local channel: near my eyes, about what I just did
  // (docs/deferred.md → Feedback channels). Shared machinery; the host owns
  // where it renders + when it clears early.
  const {
    localFeedback,
    showLocalFeedback,
    clearLocalFeedback,
  } = useLocalFeedback({ locked: isTerminal })
  // Any key is the player's next move → dismiss the own-move pill, even though
  // connections has no keyboard entry (guesses are tile clicks). No-op at
  // terminal (locked).
  useDismissLocalFeedbackOnKey(clearLocalFeedback)

  // ─── Turn-history viewer ───────────────────────────────
  // Click a turn-log #N to replay that turn (the bands matched before it + this
  // turn's 4 guessed tiles ringed in their outcome color, on the board as it was).
  // Keyed by log position. Exit is intrinsic to the hook (a click anywhere / the
  // banner ✕); a keystroke also exits (connections has no keyboard input to clash).
  const { viewing, viewingId, select: selectTurn, exitViewing, exitOnKey } =
    useHistoryViewer<number>()
  useGlobalKeyHandler(exitOnKey)

  // ─── Coop peer events (group feedback) ─────────────────
  // A teammate's guess is narrated in the GamePage header: correct →
  // "Bea found ANIMALS!" (green), one-away → "Bea was one away" (amber),
  // wrong → "Bea guessed wrong" (red). My own guesses are excluded — they
  // get the local commit flash above; my guess also already shows in the
  // turn log. Compete never reaches here: the guesses log is RLS-scoped to
  // the caller server-side, so no foreign rows arrive, and we gate on coop
  // besides. globalFeedback.show is a prop callback, so no local set-state here.
  useGlobalFeedback({
    enabled: game?.mode === 'coop',
    items: guesses,
    keyOf: (g) => g.id,
    messageFor: (g) => {
      if (g.user_id === session.user.id) return null // mine → local commit flash
      const member = memberById(players, g.user_id)
      const name = member?.username ?? 'Someone'
      const dot = colorVarFor(member?.color)
      if (g.result === 'correct') {
        // Name the solved category — coop reveals its band to everyone anyway,
        // so there's nothing to hide.
        const cat = game?.board.categories.find((c) => c.rank === g.matched_category_rank)
        return {
          tone: 'success',
          variant: 'outline',
          dot,
          text: cat ? `${name} found ${cat.name.toUpperCase()}!` : `${name} found a category!`,
          dismiss: { kind: 'timed', ms: 3000 },
        }
      }
      return {
        tone: g.result === 'oneAway' ? 'near' : 'error',
        variant: 'outline',
        dot,
        text: g.result === 'oneAway' ? `${name} was one away` : `${name} guessed wrong`,
        dismiss: { kind: 'timed', ms: 3000 },
      }
    },
    globalFeedback,
  })

  // ─── End-game action (info-column action-row button) ───
  // Available in both modes. Manual end terminates the game with
  // everyone {won:false} and a NEUTRAL green "Game ended" modal —
  // friends agreeing to stop is a valid outcome, not a "you lose"
  // punishment. Fired by the End button in the info column (like
  // psychicnum), not a GamePage-menu item.
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm('End the game now? You can\'t undo this.')) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) {
      showLocalFeedback(stickyPill('error', `End game failed: ${error.message}`))
    }
  }, [gameId, isTerminal, showLocalFeedback])

  // Hints + End now live in the info-column action row (buttons), not the
  // GamePage menu — see the .infoActions block below. Hints opens the HintModal
  // (disabled once the caller can't submit); End fires handleEndGame.

  // (The guess dispatch — submit_guess + dup detection + the wrong-guess shake — and
  // the local tile shuffle moved into BoardCol, beside the board + commit row.)

  if (loading) return <p>Loading board…</p>
  if (!game) return <p>Game not found.</p>

  // Concede lives on the common roster (ctx `players` = GamePlayer[]), not
  // connections.players. `myConceded` folds into the locally-terminal branch
  // below (same treatment as a 4-mistake elimination); `concededIds` marks a
  // dropped-out opponent 'out' in the strip.
  const myConceded =
    players.find((p) => p.user_id === session.user.id)?.conceded ?? false
  const concededIds = new Set(
    players.filter((p) => p.conceded).map((p) => p.user_id),
  )

  const matchedTiles = new Set<string>()
  for (const mc of matchedCategories) {
    for (const t of mc.tiles) matchedTiles.add(t)
  }
  const remainingTiles = game.board.tileOrder.filter(
    (t) => !matchedTiles.has(t),
  )

  // Turn-history: when a past turn is open, `snap` is that turn's board (else null =
  // live) — the bands matched STRICTLY BEFORE it + its own 4 guessed tiles (ringed in
  // the outcome color). Keyed by log position; a later realtime guess only grows the
  // log past viewingId, so a past turn holds.
  const snap = viewingId !== null ? turnSnapshot(guesses, game.board, viewingId) : null

  // tile → user_id mapping. In coop this carries every peer's
  // contribution; in compete it only ever has the caller's tiles
  // (broadcast is local-only there) so every tile reads as "mine"
  // and the peer-frame logic in Board never activates.
  const ownerByTile = new Map<string, string>()
  for (const [userId, list] of selections) {
    for (const t of list) ownerByTile.set(t, userId)
  }

  const colorByUserId = colorByUserIdMap(players)

  // Locally terminal (compete, not game-over): caller is out of the race but
  // the game continues for the survivors — either eliminated (hit 4 mistakes)
  // OR they conceded (dropped out). Both freeze this player's input + reveal
  // the unmatched bands, a personal game-over while the rest play on.
  const locallyDone = isEliminated || myConceded
  const showReveal = isTerminal || locallyDone
  const showInput = !isTerminal && !locallyDone

  const matchedRanks = new Set(matchedCategories.map((m) => m.rank))
  const unmatched = showReveal
    ? game.board.categories.filter((c) => !matchedRanks.has(c.rank))
    : []

  // Modal copy. Compete distinguishes the winner (caller hit 4 matches —
  // RLS hides peer matches, so caller-with-4-matched is the server-confirmed
  // winner) from two kinds of loser: eliminated (used all 4 mistakes) vs
  // "beaten to the punch" (still racing when an opponent solved it). Coop
  // verdicts are team-wide.
  const over = isTerminal ? buildOver({
    mode: game.mode,
    playState,
    timerExpired: timer.expired,
    selfMatched: matchedCategories.length,
    selfEliminated: mistakeCount >= MISTAKE_BUDGET,
  }) : null

  const connSetup = setup as ConnectionsSetup
  const found = matchedCategories.length

  // Concede — drop out of a compete race (a real loss; the others keep racing).
  // Distinct from End: connections.concede flips the caller's conceded flag then
  // re-runs the compete terminal check (which now counts them as done). A plain
  // function (not the useCallback handleEndGame is) because it reads `myConceded`,
  // which is derived after the hooks/loading guard. An RPC failure flashes in the
  // local commit slot.
  const handleConcede = async () => {
    if (isTerminal || myConceded) return
    if (!window.confirm('Concede the game? You drop out and the others keep playing.')) return
    const { error } = await db.rpc('concede', { target_game: gameId })
    if (error) showLocalFeedback(stickyPill('error', `Concede failed: ${error.message}`))
  }

  return (
    <div className={cls(shared.layout, styles.layout)}>
      <BoardCol
        // ── Board to render (live OR the historical snapshot via `snap`) ──
        game={game}
        matchedCategories={matchedCategories}
        remainingTiles={remainingTiles}
        unmatched={unmatched}
        snap={snap}
        viewing={viewing}
        showInput={showInput}
        onExitViewing={exitViewing}
        // ── Tile selection (state in useGame; rendered + committed here) ──
        ownerByTile={ownerByTile}
        toggleTile={toggleTile}
        sendClear={sendClear}
        unionTiles={unionTiles}
        selfId={session.user.id}
        colorByUserId={colorByUserId}
        // ── Own-guess feedback (channel owned by PlayArea) ──
        localFeedback={localFeedback}
        showLocalFeedback={showLocalFeedback}
        clearLocalFeedback={clearLocalFeedback}
        // ── Guess dispatch ──
        gameId={gameId}
        guesses={guesses}
        // ── Below-board readout / slot content ──
        mistakeCount={mistakeCount}
        mistakeBudget={MISTAKE_BUDGET}
        over={over}
        myConceded={myConceded}
        // ── Hints (state here; the modal renders in the board column) ──
        hintsOpen={hintsOpen}
        onCloseHints={() => setHintsOpen(false)}
      />

      <InfoCol
        // ── Mode + phase ──
        isCompete={game.mode === 'compete'}
        over={over}
        showInput={showInput}
        myConceded={myConceded}
        // ── State readout ──
        found={found}
        categoryCount={CATEGORY_COUNT}
        mistakeCount={mistakeCount}
        mistakeBudget={MISTAKE_BUDGET}
        // ── Players (OpponentStrip, compete) ──
        players={players}
        selfId={session.user.id}
        opponentFound={opponentFound}
        concededIds={concededIds}
        // ── Action row ──
        onHints={() => setHintsOpen(true)}
        onEndGame={() => void handleEndGame()}
        onConcede={() => void handleConcede()}
        onBackToClub={goToClub}
        // ── Setup disclosure ──
        setup={connSetup}
        puzzleDate={game.puzzleDate}
        tileCount={game.board.tileOrder.length}
        // ── Turn-history log ──
        guesses={guesses}
        matchedCategories={matchedCategories}
        viewingTurn={viewingId}
        onSelectTurn={selectTurn}
      />

      <TerminalModal isTerminal={isTerminal} over={over} onBackToClub={goToClub} />
    </div>
  )
}

/**
 * Per-status terminal copy. `outcome` + `verdict` drive the GameOverModal;
 * `message` + `tone` drive the short, bold, color-coded line in the info-column
 * action row (won = green, lost = red, manual end = neutral). Same shape as
 * psychicnum's buildOver. Coop verdicts are team-wide; compete distinguishes the
 * racer who hit 4 matches (the winner) from two losers — eliminated (used all 4
 * mistakes) vs beaten to the punch (an opponent solved it first). Detail-on-page
 * intentionally: the matched/unmatched categories show on the bands and mistake
 * counts on the strip; the modal + line stay focused on the verdict.
 */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfMatched,
  selfEliminated,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfMatched: number
  /** Compete: did the caller use all their mistakes? Distinguishes the
   *  out-of-mistakes loss from "beaten to the punch". */
  selfEliminated: boolean
}): TerminalCopy {
  // Manual end (connections.end_game) — NEUTRAL terminal in BOTH modes: the
  // friends chose to stop, nobody won or lost. The shared endedCopy() owns it
  // (green modal, neutral copy). Must come first — 'ended' is mode-independent.
  if (playState === 'ended') return endedCopy(mode)
  if (mode === 'coop') {
    if (playState === 'solved') {
      return { outcome: 'won', verdict: 'You win!', message: 'You won!', tone: 'won' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired
        ? 'You lost: out of time'
        : 'You lost: out of mistakes',
      message: timerExpired ? 'Out of time' : 'Out of mistakes',
      tone: 'lost',
    }
  }
  // compete
  if (playState === 'solved_compete') {
    if (selfMatched >= CATEGORY_COUNT) {
      return { outcome: 'won', verdict: 'You won the race!', message: 'You won!', tone: 'won' }
    }
    // I lost — but WHY matters. If I used all my mistakes I was eliminated
    // (out of mistakes); "beaten to the punch" is only for a still-racing player
    // whose opponent solved it first.
    if (selfEliminated) {
      return { outcome: 'lost', verdict: 'You lost: out of mistakes', message: 'Out of mistakes', tone: 'lost' }
    }
    return { outcome: 'lost', verdict: 'Beaten to the punch.', message: 'Opponent won', tone: 'lost' }
  }
  // lost_compete (everyone eliminated OR timeout)
  return {
    outcome: 'lost',
    verdict: timerExpired
      ? 'Out of time — nobody won.'
      : 'Everyone eliminated — nobody won.',
    message: timerExpired ? 'Out of time' : 'All eliminated',
    tone: 'lost',
  }
}
