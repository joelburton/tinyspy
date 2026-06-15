import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { cls } from '../../common/lib/cls'
import { ClubChatPanel } from '../../common/components/ClubChatPanel'
import { FrozenOverlay } from '../../common/components/FrozenOverlay'
import { useGameFreeze } from '../../common/hooks/useGameFreeze'
import { db } from '../db'
import { useGame, type Member } from '../hooks/useGame'
import { useSharedSelection } from '../hooks/useSharedSelection'
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
 *   - found-group bands (one per resolved group, NYT-colored)
 *   - 4×4 tile grid (remaining tiles in board.tileOrder order);
 *     selected tiles show a contributor frame, click toggles
 *     union membership
 *   - action row: Submit (enabled iff union has 4 tiles), Clear
 *   - transient feedback banner ("one away!", "already tried
 *     that", "wrong")
 *   - end-of-game banner: solved / lost (with reveal of any
 *     unfound groups directly from the public board.groups)
 *   - shared chat panel
 *
 * Selection is shared across all connected players — see
 * `useSharedSelection` for the union-toggle semantics. Game
 * state (mistakes, found groups, status) is server-authoritative
 * via the `submit_guess` RPC; the FE evaluates the guess locally
 * first (FE-knows-the-answer pattern documented in the
 * migration header) and tells the RPC what to record.
 *
 * Freeze (transient pause on disconnect) is a layer over the
 * whole interactive area — see `FrozenOverlay`. Clicks under
 * the overlay are blocked at the CSS layer; the selection is
 * cleared via Broadcast when the freeze engages so reconnecting
 * peers see a fresh state.
 */
export function BoardScreen({ session, gameId, onLeave }: Props) {
  const { game, guesses, foundGroups, members, channel, loading } = useGame(gameId)
  const { unionTiles, toggleTile, sendClear } = useSharedSelection(
    channel,
    session.user.id,
  )
  const { frozen, missing } = useGameFreeze(channel, members)
  const [transient, setTransient] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Track this client's presence on the channel. Doing it here
  // (the leaf consumer) keeps the membership "I'm at the game"
  // tied to "this game-screen is actually mounted" rather than
  // "the data subscription is alive."
  useEffect(() => {
    if (!channel) return
    let active = true
    const onSubscribe = async () => {
      if (!active) return
      try {
        await channel.track({
          user_id: session.user.id,
        })
      } catch {
        // ignore — channel may have closed between subscribe + track
      }
    }
    // The channel might already be SUBSCRIBED by the time we
    // mount; track() works in that state. It also works mid-
    // subscribe — supabase-js will defer until ready.
    onSubscribe()
    return () => {
      active = false
      try {
        channel.untrack()
      } catch {
        // ignore on already-closed channels
      }
    }
  }, [channel, session.user.id])

  // When the game freezes (peer disconnected), broadcast a
  // selection clear so every connected client drops its current
  // selection. The reconnecting peer will land in an empty-
  // selection state. The ref tracks the prior frozen value so we
  // only fire the clear on the *transition* into frozen, not on
  // every render while frozen.
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

  // Build a `selectedBy` map for visual attribution. We display
  // each selected tile with the contributor's peer color.
  const selectedBy = new Map<string, Member | null>()
  // selections is hidden inside useSharedSelection — recompute
  // ownership by scanning unionTiles against the broadcast log.
  // The hook returns a Map; we work with a derived structure
  // here for simplicity.
  // Approach: rebuild the ownership view by querying the hook's
  // raw selections state. We expose it via a small re-derivation
  // below.

  // We don't have direct access to the selections map from the
  // hook's return — but we don't need it; the union-tiles list
  // is enough to drive `selected` state visually. Peer-color
  // attribution requires the ownership map, so we'd want to
  // expose it. Inline a simple ownership map by re-deriving
  // from broadcast state via React's render — the hook stores
  // ownership and we use a thin helper below.

  // For each remaining tile, decide:
  //   selected → in unionTiles?
  //   contributor color → first user_id that has it in their
  //     selection (currently we don't surface ownership — for
  //     the POC we color all union tiles with the SELF color
  //     when the tile is in MY contribution, peer color when
  //     it's in a peer's; we infer "mine" by whether this client
  //     was the one to add it, which we don't track. Simpler:
  //     color every selected tile uniformly until ownership is
  //     exposed by the hook. This sacrifices a bit of the visual
  //     spec but keeps POC scope tight.)

  // We expose ownership via the hook in a follow-up. For now,
  // all selected tiles share a neutral "selected" treatment.

  const isMember = (uid: string) => members.find((m) => m.user_id === uid)
  void isMember
  void selectedBy

  async function handleSubmit() {
    if (frozen || submitting) return
    if (unionTiles.length !== 4 || !game) return

    // Dup detection (FE-side per the FE-knows model). If this
    // exact set has already been submitted, show the banner
    // and don't fire the RPC.
    if (guesses.some((g) => sameTileSet(g.tiles, unionTiles))) {
      setTransient('You already tried that')
      return
    }

    const verdict = evaluateGuess(unionTiles, game.board.groups)
    setSubmitting(true)
    // matched_level is omitted unless correct — the RPC parameter
    // has `default null` and the SQL body only inspects it inside
    // the result='correct' branch.
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
    // Visual feedback. Realtime postgres-changes will pick up
    // the new state (mistakes, found_groups, status) so we just
    // narrate the result here.
    if (verdict.kind === 'oneAway') setTransient('One away!')
    else if (verdict.kind === 'wrong') setTransient('Not quite')
    sendClear()
  }

  function handleClear() {
    if (frozen) return
    sendClear()
  }

  const canSubmit = !frozen && unionTiles.length === 4 && !submitting && game.status === 'in_progress'
  const gameOver = game.status !== 'in_progress'

  // For the end-of-game reveal: walk board.groups and surface
  // the ones not yet in foundGroups. Public board — no extra
  // fetch needed.
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
        {/* Found-group bands. Sorted by level so they stack in
            NYT order (easy at top, hard at bottom). */}
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

        {/* End-of-game un-found bands, in a slightly different
            treatment so the player can tell which they got vs.
            which the game revealed. */}
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

        {/* 4×N grid of remaining tiles. We always render in
            tileOrder; the grid auto-flows. */}
        {!gameOver && (
          <div className={styles.grid}>
            {remainingTiles.map((tile) => {
              const isSelected = unionTiles.includes(tile)
              // Pick a peer color for the contributor of this
              // tile, when we have one. For the POC we colorize
              // any selected tile uniformly — see the inline
              // note above; ownership exposure is a follow-up.
              const borderColor = isSelected
                ? colorForUserId(session.user.id)
                : undefined
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
