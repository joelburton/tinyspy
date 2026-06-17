import { useEffect, useState } from 'react'
import { games } from '../../games'
import { Link } from '../lib/Link'
import { cls } from '../lib/cls'
import styles from './ClubGameCard.module.css'

type State = 'active' | 'suspended' | 'completed'

type Props = {
  /** The id of this game (drives the routing target). */
  gameId: string
  /** The gametype — drives both the routing target and the
   *  gametype's header label. */
  gametype: string
  /** Algorithmic per-game title from `common.games.title`.
   *  Optional because the lookup map may not have populated by
   *  first render. */
  title?: string
  /** Gametype-rendered status string, e.g. "13/16 agents" or
   *  "lost (assassin)". Produced by the manifest's `labelFor`. */
  statusLabel: string
  /** Server-stamped game-start timestamp, ISO. Rendered as
   *  "Mar 5, 2026, 2:11 PM" via toLocaleString. */
  startedAt: string
  /** Where in the lifecycle this game sits. Drives both the
   *  action affordance (link vs not) and CSS treatment:
   *  prominent for current, regular for non-terminal-non-current,
   *  muted for terminal. */
  state: State
  /** Called when the user confirms the delete affordance. The
   *  parent (ClubPage) is responsible for the actual mechanics:
   *  for the active game, broadcasting a `suspend` event so peers
   *  navigate to the club page before the row vanishes; for any
   *  game, calling the `common.delete_game` RPC. Optional — when
   *  omitted, the delete button doesn't render at all (the card
   *  stays read-only). */
  onDelete?: () => Promise<void> | void
}

/**
 * One game's entry in a club's games list — the shared card shape
 * for the current game and every game in the merged "other games"
 * list on ClubPage.
 *
 * One component, three states. The fields are the same:
 *
 *   - **Gametype name** — small label above the title, from the
 *     manifest.
 *   - **Title** — the algorithmic per-game title from
 *     `common.games.title`. The card's biggest text.
 *   - **Status label** — the gametype's own free-form text,
 *     produced by `manifest.labelFor`.
 *   - **Started-at** date, smaller / muted.
 *
 * What varies by state, all in CSS:
 *   - `active` — larger font, accent treatment.
 *   - `suspended` — regular treatment.
 *   - `completed` — muted treatment.
 *
 * All three are clickable. Each game's PlayArea already handles
 * the terminal play_state as a "view the final state" mode — no
 * special review-page is needed; the same component renders both
 * the live and the post-game shape.
 *
 * **Delete affordance.** Two-step interaction:
 *   - hover (or keyboard focus) reveals a small × button at the
 *     top-right of the card
 *   - click it once → button expands into a red "Confirm delete?"
 *     pill, always visible, with an auto-revert to idle after
 *     4 seconds of no further action (safety: a misclicked × can
 *     be ignored, no explicit Cancel required)
 *   - click again → onDelete() fires, the button shows
 *     "Deleting…" while the parent does its mechanics
 *
 * The delete button sits OUTSIDE the Link so we don't have to
 * fight click-propagation. The card becomes a wrapper `<div
 * position: relative>` with the Link inside it and the button
 * absolute-positioned in the corner.
 */
export function ClubGameCard({
  gameId,
  gametype,
  title,
  statusLabel,
  startedAt,
  state,
  onDelete,
}: Props) {
  const gameTypeName =
    games.find((g) => g.gametype === gametype)?.name ?? gametype
  const startedAtLabel = new Date(startedAt).toLocaleString()
  const [deleteState, setDeleteState] = useState<
    'idle' | 'confirming' | 'deleting'
  >('idle')

  // Auto-revert from confirming → idle after a beat so a
  // misclicked × doesn't require an explicit cancel. Cleared on
  // unmount or transition to deleting (the parent's RPC call
  // takes over the affordance at that point).
  useEffect(() => {
    if (deleteState !== 'confirming') return
    const t = setTimeout(() => setDeleteState('idle'), 4000)
    return () => clearTimeout(t)
  }, [deleteState])

  async function handleDeleteClick() {
    if (deleteState === 'idle') {
      setDeleteState('confirming')
      return
    }
    if (deleteState === 'confirming') {
      setDeleteState('deleting')
      try {
        await onDelete?.()
        // No setDeleteState('idle') on success — the parent will
        // unmount this card via the realtime postgres-changes
        // refetch. If for some reason it doesn't, the next
        // render of a same-id card starts fresh in 'idle'
        // (state is component-scoped, not gameId-scoped).
      } catch {
        // Parent's responsibility to surface the error; here we
        // just back the affordance out so the user can retry.
        setDeleteState('idle')
      }
    }
  }

  return (
    <div className={styles.wrapper}>
      <Link to={`/g/${gametype}/${gameId}`} className={styles.link}>
        <div className={cls(styles.card, styles[state])}>
          <div className={styles.gametype}>{gameTypeName}</div>
          {title && <div className={styles.title}>{title}</div>}
          <div className={styles.statusRow}>
            <span className={styles.status}>{statusLabel}</span>
            <span className={styles.startedAt}>{startedAtLabel}</span>
          </div>
        </div>
      </Link>

      {onDelete && (
        <button
          type="button"
          className={cls(
            styles.deleteButton,
            deleteState !== 'idle' && styles.deleteButtonActive,
          )}
          onClick={handleDeleteClick}
          disabled={deleteState === 'deleting'}
          aria-label={
            deleteState === 'idle'
              ? 'Delete game'
              : deleteState === 'confirming'
                ? 'Confirm delete game'
                : 'Deleting game'
          }
        >
          {deleteState === 'idle' && '×'}
          {deleteState === 'confirming' && 'Confirm delete?'}
          {deleteState === 'deleting' && 'Deleting…'}
        </button>
      )}
    </div>
  )
}
