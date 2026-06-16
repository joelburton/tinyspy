import { useEffect, useState } from 'react'
import type { GamePageCtx } from '../../common/lib/games'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { evaluateGuess, sameTileSet } from '../lib/evaluate'
import { CategoryBands } from './CategoryBands'
import { HintModal } from './HintModal'
import { TileGrid } from './TileGrid'
import styles from './PlayArea.module.css'
import '../theme.css'  // wordknit-specific color tokens (lazy with this chunk)

/**
 * Wordknit's play surface — composes the in-game pieces. The
 * cross-cutting chrome (title, timer, pause, chat) lives on
 * `<GamePage>` above this component in the route tree; here we
 * just stitch together the gametype-specific pieces (status line,
 * `<CategoryBands>`, `<TileGrid>`, action row, transient banner).
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
export function PlayArea({ session, gameId, timer }: GamePageCtx) {
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
  const [transient, setTransient] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [hintsOpen, setHintsOpen] = useState(false)

  // Auto-clear the transient banner after a beat.
  useEffect(() => {
    if (!transient) return
    const t = setTimeout(() => setTransient(null), 2200)
    return () => clearTimeout(t)
  }, [transient])

  async function handleSubmit() {
    if (submitting) return
    if (unionTiles.length !== 4 || !game) return

    // Dup detection (FE-side per the FE-knows model). If this
    // exact set has already been submitted, show the banner and
    // skip the RPC.
    if (guesses.some((g) => sameTileSet(g.tiles, unionTiles))) {
      setTransient('You already tried that')
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
      setTransient(error.message)
      return
    }
    if (verdict.kind === 'oneAway') setTransient('One away!')
    else if (verdict.kind === 'wrong') setTransient('Incorrect')
    sendClear()
  }

  function handleClear() {
    sendClear()
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

  // tile → user_id: at most one owner under the union semantics,
  // but `selections` is the map of userId → tiles[] so we invert
  // here for per-tile lookup inside the grid.
  const ownerByTile = new Map<string, string>()
  for (const [userId, list] of selections) {
    for (const t of list) ownerByTile.set(t, userId)
  }

  const canSubmit =
    unionTiles.length === 4
    && !submitting
    && game.status === 'in_progress'
  const gameOver = game.status !== 'in_progress'
  const matchedRanks = new Set(matchedCategories.map((m) => m.rank))
  const unmatched = gameOver
    ? game.board.categories.filter((c) => !matchedRanks.has(c.rank))
    : []

  return (
    <div className={styles.boardArea}>
      <div className="muted">
        {gameOver ? (
          game.status === 'solved'
            ? 'Solved!'
            : timer.expired
              ? 'Out of time.'
              : 'Out of guesses.'
        ) : (
          <>
            Mistakes left: {4 - game.mistake_count}
            {' · '}
            <button
              type="button"
              className="link-button"
              onClick={() => setHintsOpen(true)}
            >
              Hints
            </button>
          </>
        )}
      </div>

      <HintModal
        categories={game.board.categories}
        open={hintsOpen}
        onClose={() => setHintsOpen(false)}
      />

      <CategoryBands matched={matchedCategories} unmatched={unmatched} />

      {!gameOver && (
        <TileGrid
          tiles={remainingTiles}
          ownerByTile={ownerByTile}
          selfUserId={session.user.id}
          onToggle={toggleTile}
        />
      )}

      {!gameOver && (
        <div className={styles.actions}>
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

      {transient && (
        <div className={styles.transient}>{transient}</div>
      )}
    </div>
  )
}
