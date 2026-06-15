import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { cls } from '../../common/lib/cls'
import { ClubChatPanel } from '../../common/components/ClubChatPanel'
import { FrozenOverlay } from '../../common/components/FrozenOverlay'
import { db } from '../db'
import { useGame } from '../hooks/useGame'
import { evaluateGuess, sameTileSet } from '../lib/evaluate'
import { colorForUserId } from '../lib/peerColor'
import type { GroupLevel } from '../lib/board'
import styles from './BoardScreen.module.css'

type Props = {
  session: Session
  gameId: string
  onLeave: () => void
}

const LEVEL_TOKEN: Record<GroupLevel, string> = {
  0: 'var(--wordknit-level-0)',
  1: 'var(--wordknit-level-1)',
  2: 'var(--wordknit-level-2)',
  3: 'var(--wordknit-level-3)',
}

/**
 * Wordknit's main play surface.
 *
 * Layout (top → bottom):
 *   - header: title + leave-game link + mistakes indicator
 *   - found-group bands (one per resolved group, NYT-colored);
 *     on lose, additional bands for the un-found groups
 *   - 4×4 tile grid of remaining tiles; click toggles union
 *     membership across all connected players (see useGame's
 *     selection semantics)
 *   - action row: Submit (enabled iff union has 4 tiles), Clear
 *   - transient feedback banner ("One away!", "Already tried
 *     that", "Not quite")
 *   - FrozenOverlay over the play area when a peer disconnects
 *   - shared chat panel
 *
 * The submission flow:
 *   1. FE evaluates the guess locally against board.groups (FE-
 *      knows-the-answer; see docs/wordknit.md)
 *   2. Dup detection (sameTileSet on the existing guess log) —
 *      if duplicate, show banner, skip RPC
 *   3. Fire submit_guess RPC with (tiles, result, level)
 *   4. Realtime postgres-changes propagate the new state to
 *      every player; this hook refetches automatically
 *   5. Broadcast a `clear` to drop everyone's selection
 */
export function BoardScreen({ session, gameId, onLeave }: Props) {
  const {
    game,
    guesses,
    foundGroups,
    members,
    selections,
    unionTiles,
    toggleTile,
    sendClear,
    frozen,
    missing,
    loading,
  } = useGame(session, gameId)
  const [transient, setTransient] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Broadcast a selection-clear on the transition INTO frozen so
  // every connected client drops its current selection. Reconnect-
  // ing peers land in an empty-selection state.
  const wasFrozenRef = useRef(false)
  useEffect(() => {
    if (frozen && !wasFrozenRef.current) {
      wasFrozenRef.current = true
      sendClear()
    } else if (!frozen) {
      wasFrozenRef.current = false
    }
  }, [frozen, sendClear])

  // Auto-clear the transient banner after a beat.
  useEffect(() => {
    if (!transient) return
    const t = setTimeout(() => setTransient(null), 2200)
    return () => clearTimeout(t)
  }, [transient])

  if (loading) return <div className="card">Loading board…</div>
  if (!game) return <div className="card">Game not found.</div>

  const foundMembers = new Set<string>()
  for (const fg of foundGroups) {
    for (const m of fg.members) foundMembers.add(m)
  }
  const remainingTiles = game.board.tileOrder.filter(
    (t) => !foundMembers.has(t),
  )

  // Per-tile contributor for visual attribution: which user_id
  // currently has this tile in their contribution? At most one
  // owner under the union semantics, but `selections` is the
  // map of `userId → tiles[]` so we look up by tile.
  const ownerByTile = new Map<string, string>()
  for (const [userId, list] of selections) {
    for (const t of list) ownerByTile.set(t, userId)
  }

  async function handleSubmit() {
    if (frozen || submitting) return
    if (unionTiles.length !== 4 || !game) return

    // Dup detection (FE-side per the FE-knows model). If this
    // exact set has already been submitted, show the banner
    // and skip the RPC.
    if (guesses.some((g) => sameTileSet(g.tiles, unionTiles))) {
      setTransient('You already tried that')
      return
    }

    const verdict = evaluateGuess(unionTiles, game.board.groups)
    setSubmitting(true)
    // matched_level is omitted unless correct — the RPC's
    // parameter has `default null` and the SQL body only inspects
    // it inside the result='correct' branch.
    const { error } = await db.rpc('submit_guess', {
      target_game: gameId,
      tiles: unionTiles,
      result: verdict.kind,
      ...(verdict.kind === 'correct'
        ? { matched_level: verdict.level }
        : {}),
    })
    setSubmitting(false)
    if (error) {
      setTransient(error.message)
      return
    }
    if (verdict.kind === 'oneAway') setTransient('One away!')
    else if (verdict.kind === 'wrong') setTransient('Not quite')
    sendClear()
  }

  function handleClear() {
    if (frozen) return
    sendClear()
  }

  const canSubmit =
    !frozen && unionTiles.length === 4 && !submitting && game.status === 'in_progress'
  const gameOver = game.status !== 'in_progress'
  const foundLevels = new Set(foundGroups.map((f) => f.level))
  const unfound = gameOver
    ? game.board.groups.filter((g) => !foundLevels.has(g.level))
    : []

  return (
    <div className={styles.frame}>
      <header className={styles.boardHeader}>
        <div>
          <strong>Wordknit</strong>
          <div className="muted">
            {gameOver
              ? game.status === 'solved'
                ? 'Solved!'
                : 'Out of guesses.'
              : `Mistakes left: ${4 - game.mistakes}`}
          </div>
        </div>
        <button
          type="button"
          className={cls('link-button', styles.leave)}
          onClick={onLeave}
        >
          Leave game
        </button>
      </header>

      <div className={styles.boardArea}>
        {foundGroups
          .slice()
          .sort((a, b) => a.level - b.level)
          .map((fg) => (
            <div
              key={fg.level}
              className={styles.band}
              style={{ background: LEVEL_TOKEN[fg.level] }}
            >
              <strong>{fg.group_name}</strong>
              <div className={styles.bandMembers}>{fg.members.join(' · ')}</div>
            </div>
          ))}

        {unfound.map((g) => (
          <div
            key={g.level}
            className={cls(styles.band, styles.bandRevealed)}
            style={{ background: LEVEL_TOKEN[g.level] }}
          >
            <strong>{g.group}</strong>
            <div className={styles.bandMembers}>{g.members.join(' · ')}</div>
          </div>
        ))}

        {!gameOver && (
          <div className={styles.grid}>
            {remainingTiles.map((tile) => {
              const ownerId = ownerByTile.get(tile)
              const isSelected = ownerId !== undefined
              const borderColor = ownerId ? colorForUserId(ownerId) : undefined
              return (
                <button
                  key={tile}
                  type="button"
                  className={cls(
                    styles.tile,
                    isSelected && styles.tileSelected,
                    frozen && styles.tileDisabled,
                  )}
                  style={
                    isSelected && borderColor
                      ? { boxShadow: `inset 0 0 0 4px ${borderColor}` }
                      : undefined
                  }
                  onClick={() => !frozen && toggleTile(tile)}
                  disabled={frozen}
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
              disabled={frozen || unionTiles.length === 0}
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

        {gameOver && (
          <div className={styles.endActions}>
            <button type="button" onClick={onLeave}>
              Back to home
            </button>
          </div>
        )}

        {frozen && <FrozenOverlay missing={missing} />}
      </div>

      <ClubChatPanel clubId={game.club_id} members={members} />
    </div>
  )
}
