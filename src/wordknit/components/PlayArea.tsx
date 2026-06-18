import { useEffect, useState } from 'react'
import type { FeedbackTone, GamePageCtx } from '../../common/lib/games'
import { colorByUserIdMap } from '../../common/lib/memberColor'
import { GameOverModal } from '../../common/components/GameOverModal'
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
 * Wordknit's play surface — composes the in-game pieces. The
 * cross-cutting chrome (logo, chat, players-strip / feedback-pill,
 * pause, timer) lives on `<GamePage>` above this component in
 * the route tree; here we just stitch together the gametype-
 * specific pieces (status line, `<CategoryBands>`, `<TileGrid>`,
 * action row). Transient feedback flows out via `ctx.feedback`
 * → the GamePage header's status slot.
 *
 * Submission flow:
 *   1. FE evaluates the guess locally against board.categories
 *      (FE-knows-the-answer; see docs/wordknit.md).
 *   2. Dup detection (sameTileSet on the existing guess log) —
 *      if duplicate, show banner, skip RPC.
 *   3. Fire submit_guess RPC with (tiles, result, rank).
 *   4. Realtime postgres-changes propagate the new state to every
 *      player; this hook refetches automatically.
 *   5. Broadcast a `clear` to drop everyone's selection.
 *
 * **Pause behavior**: PauseBoundary in GamePage unmounts this
 * component on pause and remounts on resume. The shared selection
 * state lives in `useGame` (component-local + broadcast); the
 * unmount drops it automatically, so reconnecting peers land in
 * an empty-selection state without an explicit `sendClear`-on-
 * pause wiring. The realtime channel teardown + re-subscribe gap
 * is covered by the on-SUBSCRIBED refetch.
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
  // gives this client its own view; doesn't broadcast. See
  // src/wordknit/lib/localOrder.ts for the reconciliation rule
  // when categories get matched mid-game.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)
  // Tiles currently playing the wrong-guess shake. PlayArea sets
  // this for ~500ms after `submit_guess` returns 'wrong', then
  // the cleanup effect below clears it. TileGrid reads the set
  // and applies its shake class.
  const [shakingTiles, setShakingTiles] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  // Auto-clear the shake set ~500ms after we set it (just past
  // the animation's 400ms duration). Effect-based so the timeout
  // is cleaned up on unmount / re-shake correctly.
  useEffect(function autoClearShakeAfterAnimation() {
    if (shakingTiles.size === 0) return
    const t = setTimeout(() => setShakingTiles(new Set()), 500)
    return () => clearTimeout(t)
  }, [shakingTiles])

  // Register the per-game menu items. Today there's one: "Hints,"
  // which opens the HintModal. The cleanup return resets to []
  // so PlayArea-unmount (pause, route change) clears the per-game
  // section of the menu — common items (Help, Back to club) stay.
  //
  // Disabled when the game is over: the hints no longer help with
  // a guess; the categories are already on the board by then.
  useEffect(function syncMenuItems() {
    menu.setGameItems([
      {
        id: 'hints',
        label: 'Hints',
        onClick: () => setHintsOpen(true),
        disabled: isTerminal,
      },
    ])
    return () => menu.setGameItems([])
  }, [menu, isTerminal])

  // Terminal modal state. Initialized to `isTerminal` so navigating
  // into an already-solved/lost game pops the modal on first
  // render. The effect below flips this true if isTerminal
  // transitions during play (last-correct match or game-end timeout).
  // No reopen after dismiss — the in-action-row indicator below
  // carries the lasting cue.
  const [showModal, setShowModal] = useState(isTerminal)
  useEffect(function popOnTerminal() {
    if (isTerminal) setShowModal(true)
  }, [isTerminal])

  // Local helper: every wordknit feedback today is `closeable` —
  // a guess outcome should stay on screen until the player either
  // makes another guess (which fires a fresh `show()` and replaces
  // the pill) or explicitly dismisses it via the × button. No
  // self-vanishing timer; misclicked dismiss → next guess brings
  // it back.
  function showFeedback(tone: FeedbackTone, text: string) {
    feedback.show({ tone, text, dismiss: { kind: 'closeable' } })
  }

  async function handleSubmit() {
    if (submitting) return
    if (unionTiles.length !== 4 || !game) return

    // Dup detection (FE-side per the FE-knows model). If this
    // exact set has already been submitted, surface a transient
    // feedback toast and skip the RPC.
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
      // Capture the just-submitted tiles into the shake set
      // BEFORE sendClear drops the selection — once cleared,
      // unionTiles will be empty on the next render. The cleanup
      // effect above clears the set ~500ms later, matching the
      // animation duration.
      setShakingTiles(new Set(unionTiles))
    }
    sendClear()
  }

  function handleClear() {
    sendClear()
  }

  function handleShuffle() {
    // Compute the shuffle off the CURRENTLY-DISPLAYED tiles, not
    // the upstream `remainingTiles`. That way a click on Shuffle
    // re-randomizes what the player is looking at right now,
    // rather than reverting-and-reshuffling — feels natural for
    // "I want a fresh take on this set."
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

  // Apply the local-shuffle overlay if the player has shuffled.
  // The reconcile helper drops any tiles that just got matched
  // while preserving the player's chosen order for the rest.
  // Without a localOrder, the upstream order is the display.
  const displayedTiles = localOrder
    ? reconcileLocalOrder(localOrder, remainingTiles)
    : remainingTiles

  // tile → user_id: at most one owner under the union semantics,
  // but `selections` is the map of userId → tiles[] so we invert
  // here for per-tile lookup inside the grid.
  const ownerByTile = new Map<string, string>()
  for (const [userId, list] of selections) {
    for (const t of list) ownerByTile.set(t, userId)
  }

  // Pre-resolve each player's profile color to a CSS var string,
  // built once per players-array reference change so TileGrid can
  // look up by user_id at render time without re-walking the
  // roster per tile. See common/lib/memberColor.ts for the helper.
  const colorByUserId = colorByUserIdMap(players)

  const canSubmit =
    unionTiles.length === 4
    && !submitting
    && !isTerminal
  const gameOver = isTerminal
  const matchedRanks = new Set(matchedCategories.map((m) => m.rank))
  const unmatched = gameOver
    ? game.board.categories.filter((c) => !matchedRanks.has(c.rank))
    : []

  // Modal + indicator copy. `playState === 'solved'` is the only
  // win path; otherwise the game ended via out-of-mistakes or
  // out-of-time (distinguished by timer.expired).
  const matchedCount = matchedCategories.length
  const over = gameOver ? buildOver({
    playState,
    timerExpired: timer.expired,
    matchedCount,
    mistakeCount: game.mistake_count,
    unmatchedNames: unmatched.map((c) => c.name),
  }) : null

  return (
    <div className={styles.boardArea}>
      <div className={styles.layout}>
        {/* Board column (left): all the gameplay UI that was the
            entire PlayArea before the history sidebar landed.
            Wrapping in a column so the history sits beside it on
            wide screens (and stacks below on narrow ones — see
            the CSS media query). */}
        <div className={styles.boardCol}>
          <HintModal
            categories={game.board.categories}
            open={hintsOpen}
            onClose={() => setHintsOpen(false)}
          />

          <CategoryBands matched={matchedCategories} unmatched={unmatched} />

          {!gameOver && (
            <TileGrid
              tiles={displayedTiles}
              ownerByTile={ownerByTile}
              selfUserId={session.user.id}
              onToggle={toggleTile}
              shakingTiles={shakingTiles}
              colorByUserId={colorByUserId}
            />
          )}

          {gameOver && over ? (
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
          ) : (
            <div className={styles.actions}>
              {/* Mistakes-remaining on the left, baseline-aligned
                  with the action buttons on the right. The mistakes
                  dots are the at-a-glance "how many wrong guesses
                  can we still afford" indicator; sitting next to
                  the Submit button makes the cost of a bad guess
                  visible the instant the player thinks about
                  hitting Submit. */}
              <div className={styles.actionsLeft}>
                Mistakes remaining{' '}
                <MistakeDots used={game.mistake_count} />
              </div>
              <button
                type="button"
                className="secondary"
                onClick={handleShuffle}
                disabled={displayedTiles.length === 0}
              >
                Shuffle
              </button>
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

        {/* History sidebar (right): per-guess outcome log. Shows
            during play and after the game ends (the trail matters
            for post-game review). */}
        <GuessHistory
          guesses={guesses}
          matchedCategories={matchedCategories}
          players={players}
        />
      </div>

      {showModal && over && (
        <GameOverModal
          outcome={over.outcome}
          title={over.title}
          detail={over.detail}
          onClose={() => setShowModal(false)}
          onBackToClub={goToClub}
        />
      )}
    </div>
  )
}

/** Per-status modal + indicator copy. `playState === 'solved'` is
 *  the only positive terminal state; otherwise the game ended
 *  via out-of-mistakes or out-of-time (distinguished by
 *  timer.expired). */
function buildOver({
  playState,
  timerExpired,
  matchedCount,
  mistakeCount,
  unmatchedNames,
}: {
  playState: string
  timerExpired: boolean
  matchedCount: number
  mistakeCount: number
  unmatchedNames: string[]
}): {
  outcome: 'won' | 'lost'
  title: string
  status: string
  detail: string
} {
  if (playState === 'solved') {
    return {
      outcome: 'won',
      title: 'Solved!',
      status: 'solved',
      detail: `Matched all four categories with ${mistakeCount}/4 mistakes used.`,
    }
  }
  // Lost — either time ran out or all 4 mistakes spent. Both end
  // with the same matched-count line + the names of whichever
  // categories the friends didn't get to.
  const lossLine = timerExpired
    ? 'Clock ran out.'
    : 'All four mistakes used.'
  const remainingLine = unmatchedNames.length > 0
    ? ` Categories left unmatched: ${unmatchedNames.join(', ')}.`
    : ''
  return {
    outcome: 'lost',
    title: timerExpired ? 'Out of time' : 'Out of guesses',
    status: timerExpired ? 'out of time' : 'out of guesses',
    detail: `${lossLine} Matched ${matchedCount}/4 categories.${remainingLine}`,
  }
}
