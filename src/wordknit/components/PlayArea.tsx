import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { cls } from '../../common/lib/cls'
import { GamePage } from '../../common/components/GamePage'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { evaluateGuess, sameTileSet } from '../lib/evaluate'
import { colorForUserId } from '../lib/peerColor'
import type { CategoryRank } from '../lib/board'
import styles from './PlayArea.module.css'

type Props = {
  session: Session
  gameId: string
}

const RANK_TOKEN: Record<CategoryRank, string> = {
  0: 'var(--wordknit-rank-0)',
  1: 'var(--wordknit-rank-1)',
  2: 'var(--wordknit-rank-2)',
  3: 'var(--wordknit-rank-3)',
}

/**
 * Wordknit's play surface — the bands, the tile grid, the
 * action row, transient feedback. Cross-cutting chrome (title,
 * timer, pause, chat) lives on the common `<GamePage>`.
 *
 * Submission flow:
 *   1. FE evaluates the guess locally against board.categories
 *      (FE-knows-the-answer; see docs/wordknit.md).
 *   2. Dup detection (sameTileSet on the existing guess log) —
 *      if duplicate, show banner, skip RPC.
 *   3. Fire submit_guess RPC with (tiles, result, rank).
 *   4. Realtime postgres-changes propagate the new state to
 *      every player; this hook refetches automatically.
 *   5. Broadcast a `clear` to drop everyone's selection.
 *
 * Pause handling is concentrated in GamePage's PauseBoundary —
 * this component doesn't thread `disabled={paused}` props through
 * click handlers because the boundary hides children with
 * `visibility: hidden` during a pause (non-interactive by virtue
 * of being invisible to layout-clicks). `onPauseTransition` on
 * GamePage fires `sendClear` on the pause-transition so
 * reconnecting peers land in an empty selection state.
 */
export function PlayArea({ session, gameId }: Props) {
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

  return (
    <GamePage
      gameId={gameId}
      session={session}
      gametype="wordknit"
      onPauseTransition={sendClear}
    >
      {({ timer }) => {
        if (loading) return <p>Loading board…</p>
        if (!game) return <p>Game not found.</p>

        const matchedTiles = new Set<string>()
        for (const mc of matchedCategories) {
          for (const t of mc.tiles) matchedTiles.add(t)
        }
        const remainingTiles = game.board.tileOrder.filter(
          (t) => !matchedTiles.has(t),
        )

        // Per-tile contributor for visual attribution: at most
        // one owner under the union semantics, but `selections`
        // is the map of `userId → tiles[]` so we look up by tile.
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
                <>Mistakes left: {4 - game.mistake_count}</>
              )}
            </div>

            {matchedCategories
              .slice()
              .sort((a, b) => a.rank - b.rank)
              .map((mc) => (
                <div
                  key={mc.rank}
                  className={styles.band}
                  style={{ background: RANK_TOKEN[mc.rank] }}
                >
                  <strong>{mc.name}</strong>
                  <div className={styles.bandMembers}>
                    {mc.tiles.join(' · ')}
                  </div>
                </div>
              ))}

            {unmatched.map((c) => (
              <div
                key={c.rank}
                className={cls(styles.band, styles.bandRevealed)}
                style={{ background: RANK_TOKEN[c.rank] }}
              >
                <strong>{c.name}</strong>
                <div className={styles.bandMembers}>{c.tiles.join(' · ')}</div>
              </div>
            ))}

            {!gameOver && (
              <div className={styles.grid}>
                {remainingTiles.map((tile) => {
                  // Distinct treatments for self vs peer:
                  //   - Mine: strong dark-fill (the NYT "selected"
                  //     look). No border — the fill alone reads as
                  //     "this is yours."
                  //   - Peer's: regular tile background + a thick
                  //     inset frame in the peer's color.
                  //   - Unowned: plain tile.
                  const ownerId = ownerByTile.get(tile)
                  const isMine = ownerId === session.user.id
                  const isPeer = ownerId !== undefined && !isMine
                  return (
                    <button
                      key={tile}
                      type="button"
                      className={cls(
                        styles.tile,
                        isMine && styles.tileSelected,
                      )}
                      style={
                        isPeer && ownerId
                          ? {
                              boxShadow: `inset 0 0 0 4px ${colorForUserId(ownerId)}`,
                            }
                          : undefined
                      }
                      onClick={() => toggleTile(tile)}
                    >
                      {tile}
                    </button>
                  )
                })}
              </div>
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
      }}
    </GamePage>
  )
}
