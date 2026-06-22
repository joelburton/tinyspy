import { useCallback, useEffect, useState } from 'react'
import type { FeedbackTone, GamePageCtx } from '../../common/lib/games'
import { colorByUserIdMap, colorVarFor } from '../../common/lib/memberColor'
import { GameOverModal } from '../../common/components/GameOverModal'
import { ShuffleButton } from '../../common/components/ShuffleButton'
import { useTerminalModal } from '../../common/hooks/useTerminalModal'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { evaluateGuess, sameTileSet } from '../lib/evaluate'
import { reconcileLocalOrder, shuffleTiles } from '../lib/localOrder'
import { CategoryBands } from './CategoryBands'
import { GuessHistory } from './GuessHistory'
import { HintModal } from './HintModal'
import { MistakeDots } from './MistakeDots'
import { TileGrid } from './TileGrid'
import styles from './PlayArea.module.css'
import '../theme.css'  // wordknit-specific color tokens (lazy with this chunk)

/**
 * wordknit's play surface, shared between the coop and compete
 * manifests. The mode is read from `game.mode` (set at create-
 * game time and never changes); rendering branches on it for:
 *
 *   - **Selection**: coop shares via Broadcast (the TileGrid
 *     shows per-tile peer attribution); compete keeps selections
 *     local (every tile reads as "mine" because the broadcast
 *     send is suppressed in useGame).
 *   - **Mistakes**: coop shows a single shared dot row; compete
 *     shows an OpponentMistakesStrip with everyone's per-player
 *     counts.
 *   - **Eliminated state** (compete only, non-terminal): caller's
 *     mistake_count >= 4 → render the unmatched categories
 *     revealed + a "you're out" indicator; let the game continue
 *     for the survivors (opponents' counts keep ticking via the
 *     realtime players-row subscription).
 *   - **Terminal copy**: coop says "you win/lose" (team verdict);
 *     compete distinguishes "you won the race" from "beaten to
 *     the punch" using the caller's matched-count.
 *
 * Submission flow (unchanged from baseline):
 *   1. FE evaluates the guess locally against board.categories
 *      (FE-knows-the-answer; see docs/games/wordknit.md).
 *   2. Dup detection (sameTileSet on the existing guess log) —
 *      in compete the log is RLS-filtered to caller, so dup-
 *      detection only catches the caller's own repeats. Good.
 *   3. Fire submit_guess RPC with (tiles, result, rank).
 *   4. Realtime postgres-changes propagate to every player; the
 *      hook refetches automatically (players + guesses + games).
 *   5. Broadcast a `clear` (no-op in compete because broadcast is
 *      local-only there; coop drops everyone's selection).
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
  feedback,
  menu,
  goToClub,
}: GamePageCtx) {
  const {
    game,
    guesses,
    matchedCategories,
    mistakeCount,
    opponentMistakes,
    isEliminated,
    selections,
    unionTiles,
    toggleTile,
    sendClear,
    loading,
  } = useGame(session, gameId)
  const [submitting, setSubmitting] = useState(false)
  const [hintsOpen, setHintsOpen] = useState(false)
  // Per-player local tile order. NULL = use upstream
  // `remainingTiles` as-is (the shuffle the create_game RPC
  // baked in, same for every player). Setting to a permutation
  // gives this client its own view; doesn't broadcast.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  // Tiles currently playing the wrong-guess shake. PlayArea sets
  // this for ~500ms after `submit_guess` returns 'wrong', then
  // the cleanup effect below clears it. TileGrid reads the set
  // and applies its shake class.
  const [shakingTiles, setShakingTiles] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  // Auto-clear the shake set ~500ms after we set it (just past
  // the animation's 400ms duration).
  useEffect(function autoClearShakeAfterAnimation() {
    if (shakingTiles.size === 0) return
    const t = setTimeout(() => setShakingTiles(new Set()), 500)
    return () => clearTimeout(t)
  }, [shakingTiles])

  // Local helper: every wordknit feedback today is `closeable`.
  //
  // NOTE the arg order is (tone, text) — the OPPOSITE of freebee's
  // showFeedback(text, tone). Don't copy a freebee call site verbatim.
  //
  // Defined here (above the menu-sync effect) because handleEndGame
  // below closes over it, and that closure is in turn referenced by
  // the syncMenuItems effect. Keeping the declaration order
  // feedback-helper → handleEndGame → effect avoids any
  // temporal-dead-zone / hooks-order problem.
  // Memoized (like freebee's showFeedback) so handleEndGame's dep
  // array stays stable across renders — an un-memoized function here
  // would make the useCallback below rebuild every render.
  const showFeedback = useCallback(
    (tone: FeedbackTone, text: string) => {
      feedback.show({ tone, text, dismiss: { kind: 'closeable' } })
    },
    [feedback],
  )

  // ─── End-game action (per-game menu item) ──────────────
  // Available in both modes. Manual end terminates the game with
  // everyone {won:false} and a NEUTRAL green "Game ended" modal —
  // friends agreeing to stop is a valid outcome, not a "you lose"
  // punishment. Mirrors freebee.handleEndGame; the only difference
  // is showFeedback's (tone, text) arg order (see note above).
  const handleEndGame = useCallback(async () => {
    if (isTerminal) return
    if (!window.confirm('End the game now? You can\'t undo this.')) return
    const { error } = await db.rpc('end_game', { target_game: gameId })
    if (error) {
      showFeedback('error', `End game failed: ${error.message}`)
    }
  }, [gameId, isTerminal, showFeedback])

  // Register the per-game menu items: "Hints" (opens the HintModal)
  // and "End game" (this is the only place that fires end_game).
  //
  // setGameItems REPLACES the whole per-game list, so both items
  // must be registered in this single effect — a second effect
  // would clobber the first.
  //
  // Hints is disabled when the game is over OR (in compete) when the
  // caller is eliminated — hints don't help a player who can't submit
  // anymore. End game is disabled once the game is terminal (nothing
  // left to end).
  useEffect(function syncMenuItems() {
    menu.setGameItems([
      {
        id: 'hints',
        label: 'Hints',
        onClick: () => setHintsOpen(true),
        disabled: isTerminal || isEliminated,
      },
      {
        id: 'end-game',
        label: 'End game',
        onClick: () => void handleEndGame(),
        disabled: isTerminal,
      },
    ])
    return () => menu.setGameItems([])
  }, [menu, isTerminal, isEliminated, handleEndGame])

  // Shared terminal-modal scaffold: open on mount if already-
  // terminal, re-pop when isTerminal flips during play, no re-pop
  // after dismiss.
  const { showModal, closeModal } = useTerminalModal(isTerminal)

  async function handleSubmit() {
    if (submitting) return
    if (unionTiles.length !== 4 || !game) return

    // Dup detection (FE-side per the FE-knows model).
    if (guesses.some((g) => sameTileSet(g.tiles, unionTiles))) {
      showFeedback('error', 'You already tried that')
      return
    }

    const verdict = evaluateGuess(unionTiles, game.board.categories)
    setSubmitting(true)
    const { error } = await db.rpc('submit_guess', {
      target_game: gameId,
      tiles: unionTiles,
      result: verdict.kind,
      ...(verdict.kind === 'correct'
        ? { matched_category_rank: verdict.rank }
        : {}),
    })
    setSubmitting(false)
    if (error) {
      showFeedback('error', error.message)
      return
    }
    if (verdict.kind === 'oneAway') showFeedback('neutral', 'One away!')
    else if (verdict.kind === 'wrong') {
      showFeedback('error', 'Incorrect')
      setShakingTiles(new Set(unionTiles))
    }
    sendClear()
  }

  function handleClear() {
    sendClear()
  }

  function handleShuffle() {
    setLocalOrder(shuffleTiles(displayedTiles))
  }

  if (loading) return <p>Loading board…</p>
  if (!game) return <p>Game not found.</p>

  const matchedTiles = new Set<string>()
  for (const mc of matchedCategories) {
    for (const t of mc.tiles) matchedTiles.add(t)
  }
  const remainingTiles = game.board.tileOrder.filter(
    (t) => !matchedTiles.has(t),
  )

  const displayedTiles = localOrder
    ? reconcileLocalOrder(localOrder, remainingTiles)
    : remainingTiles

  // tile → user_id mapping. In coop this carries every peer's
  // contribution; in compete it only ever has the caller's tiles
  // (broadcast is local-only there) so every tile reads as "mine"
  // and the peer-frame logic in TileGrid never activates.
  const ownerByTile = new Map<string, string>()
  for (const [userId, list] of selections) {
    for (const t of list) ownerByTile.set(t, userId)
  }

  const colorByUserId = colorByUserIdMap(players)

  // Eliminated-but-not-terminal: caller hit 4 mistakes in compete
  // but the game continues for survivors. Treat the reveal +
  // input-freeze like a personal game-over while the rest play on.
  const showReveal = isTerminal || isEliminated
  const showInput = !isTerminal && !isEliminated

  const canSubmit =
    unionTiles.length === 4
    && !submitting
    && showInput

  const matchedRanks = new Set(matchedCategories.map((m) => m.rank))
  const unmatched = showReveal
    ? game.board.categories.filter((c) => !matchedRanks.has(c.rank))
    : []

  // Modal copy. Compete distinguishes "you won the race" from
  // "beaten to the punch" using the caller's own matched count —
  // RLS hides peer matches, so caller-with-4-matched is the
  // server-confirmed winner; anyone else terminal-with-fewer-matches
  // got beaten. Coop verdicts are team-wide.
  const over = isTerminal ? buildOver({
    mode: game.mode,
    playState,
    timerExpired: timer.expired,
    selfMatched: matchedCategories.length,
  }) : null

  return (
    <div className={styles.boardArea}>
      <div className={styles.layout}>
        <div className={styles.boardCol}>
          <HintModal
            categories={game.board.categories}
            open={hintsOpen}
            onClose={() => setHintsOpen(false)}
          />

          <CategoryBands matched={matchedCategories} unmatched={unmatched} />

          {showInput && (
            <TileGrid
              tiles={displayedTiles}
              ownerByTile={ownerByTile}
              selfUserId={session.user.id}
              onToggle={toggleTile}
              shakingTiles={shakingTiles}
              colorByUserId={colorByUserId}
            />
          )}

          {/* Compete: opponent-mistakes strip above the action row.
              Visible during play and after the game ends (post-game
              review still benefits from the per-player snapshot).
              Hidden in coop where the single shared dot row covers
              everything. */}
          {game.mode === 'compete' && (
            <OpponentMistakesStrip
              players={players}
              selfId={session.user.id}
              selfMistakes={mistakeCount}
              opponentMistakes={opponentMistakes}
            />
          )}

          {isTerminal && over ? (
            <div className={styles.gameOverIndicator}>
              <span>
                <span className="muted">Game over:</span> {over.status}
              </span>
              <button
                type="button"
                className="secondary"
                onClick={goToClub}
              >
                Back to club
              </button>
            </div>
          ) : isEliminated ? (
            // Compete spectator state: caller's out, others race on.
            // No "back to club" button here — leaving while the game
            // is non-terminal triggers the suspend-confirm flow via
            // the GamePage menu, which is the right path. Sitting
            // and watching is the intended UX.
            <div className={styles.gameOverIndicator}>
              <span>
                <span className="muted">You're out:</span> the rest are
                still racing
              </span>
            </div>
          ) : (
            <div className={styles.actions}>
              {/* Coop: shared mistakes dots. In compete the
                  OpponentMistakesStrip above carries the caller's
                  count alongside opponents', so this slot stays
                  blank for visual focus on the buttons. */}
              <div className={styles.actionsLeft}>
                {game.mode === 'coop' && (
                  <>
                    Mistakes remaining{' '}
                    <MistakeDots used={mistakeCount} />
                  </>
                )}
              </div>
              <ShuffleButton
                onShuffle={handleShuffle}
                disabled={displayedTiles.length === 0}
                label="Shuffle tiles"
              />
              <button
                type="button"
                className="secondary"
                onClick={handleClear}
                disabled={unionTiles.length === 0}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          )}

        </div>

        {/* History sidebar: in coop shows every player's guesses;
            in compete RLS already filters to caller's own so the
            FE doesn't need to do anything special. */}
        <GuessHistory
          guesses={guesses}
          matchedCategories={matchedCategories}
          players={players}
        />
      </div>

      {showModal && over && (
        <GameOverModal
          outcome={over.outcome}
          verdict={over.verdict}
          onClose={closeModal}
          onBackToClub={goToClub}
        />
      )}
    </div>
  )
}

/**
 * Per-player mistakes strip for compete mode. Renders
 * "You: ●○○○ · Bea: ●●○○ · Cade: ●●●● out", with each name in
 * their profile color so the strip matches the rest of the
 * multiplayer chrome.
 *
 * The strip is the entire "opponent visibility" surface in
 * compete mode — you see mistake counts but never their guesses,
 * matched-category counts, or which categories they've matched.
 * Server-side RLS on `wordknit.guesses` enforces the latter;
 * this just renders what we're allowed to know.
 */
function OpponentMistakesStrip({
  players,
  selfId,
  selfMistakes,
  opponentMistakes,
}: {
  players: { user_id: string; username: string; color: string }[]
  selfId: string
  selfMistakes: number
  opponentMistakes: ReadonlyMap<string, number>
}) {
  // Sort: self first, then peers by username for stable order.
  const ordered = [...players].sort((a, b) => {
    if (a.user_id === selfId) return -1
    if (b.user_id === selfId) return 1
    return a.username.localeCompare(b.username)
  })
  return (
    <p className={styles.opponentStrip}>
      {ordered.map((p, i) => {
        const mistakes = p.user_id === selfId
          ? selfMistakes
          : (opponentMistakes.get(p.user_id) ?? 0)
        const label = p.user_id === selfId ? 'You' : p.username
        const eliminated = mistakes >= 4
        return (
          <span key={p.user_id} className={styles.opponentEntry}>
            {i > 0 && <span className={styles.opponentSep}>·</span>}
            <strong style={{ color: colorVarFor(p.color) }}>{label}</strong>:{' '}
            <MistakeDots used={mistakes} />
            {eliminated && <span className="muted"> out</span>}
          </span>
        )
      })}
    </p>
  )
}

/** Per-status modal + indicator copy. Coop verdicts are team-wide;
 *  compete distinguishes the racer who hit 4 matches (the winner)
 *  from everyone else (beaten to the punch). Detail-on-page
 *  intentionally: matched vs. unmatched categories show on the
 *  CategoryBands, mistake counts on the strip; the modal stays
 *  focused on the verdict. */
function buildOver({
  mode,
  playState,
  timerExpired,
  selfMatched,
}: {
  mode: 'coop' | 'compete'
  playState: string
  timerExpired: boolean
  selfMatched: number
}): {
  outcome: 'won' | 'lost'
  verdict: string
  status: string
} {
  // Manual end (wordknit.end_game) — NEUTRAL terminal in BOTH modes.
  // play_state='ended' means the friends chose to stop: nobody won,
  // nobody lost. We render the green "won"-style modal (outcome:'won')
  // with neutral copy, NOT the red loss modal. This branch must come
  // first because 'ended' is mode-independent.
  if (playState === 'ended') {
    return {
      outcome: 'won',
      verdict: mode === 'coop' ? 'Game ended.' : 'Game ended — no winner.',
      status: 'ended',
    }
  }
  if (mode === 'coop') {
    if (playState === 'solved') {
      return { outcome: 'won', verdict: 'You win!', status: 'won' }
    }
    return {
      outcome: 'lost',
      verdict: timerExpired
        ? 'You lost: out of time'
        : 'You lost: out of mistakes',
      status: timerExpired ? 'out of time' : 'out of mistakes',
    }
  }
  // compete
  if (playState === 'solved_compete') {
    return selfMatched >= 4
      ? { outcome: 'won', verdict: 'You won the race!', status: 'you won' }
      : {
          outcome: 'lost',
          verdict: 'Beaten to the punch.',
          status: 'opponent won',
        }
  }
  // lost_compete (everyone eliminated OR timeout)
  return {
    outcome: 'lost',
    verdict: timerExpired
      ? 'Out of time — nobody won.'
      : 'Everyone eliminated — nobody won.',
    status: timerExpired ? 'out of time' : 'all eliminated',
  }
}
