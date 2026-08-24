// cs-audited

import { useEffect, useState } from 'react'
import { cls } from '../../lib/util/cls'
import styles from './ClubGameDeleteButton.module.css'

type Props = {
  /** Called when the user confirms. The caller (ClubPage) owns the mechanics:
   *  for the club's current game, broadcasting a `suspend` so peers navigate
   *  out before the row vanishes; for any game, the `common.delete_game` RPC. */
  onDelete: () => Promise<void> | void
}

/**
 * The hover-revealed × in a game entry's top-right corner, and the two-step
 * confirmation behind it.
 *
 *   - **idle** — a small ×, invisible until the entry around it is hovered or
 *     holds focus, so it doesn't compete with the entry's content until you go
 *     looking for it.
 *   - **confirming** — expands into a red "Confirm delete?" pill, always
 *     visible, auto-reverting after 4 seconds. A misclicked × can simply be
 *     ignored; there is no Cancel to find.
 *   - **deleting** — "Deleting…" while the caller does its work.
 *
 * It is a `dismiss` (docs/ui.md → the fourteen kinds), so it takes the neutral
 * `<button>` and NOT `.button`.
 *
 * **It stops the click from propagating**, which is load-bearing now that a
 * game row is a `<SelectionList>` row: the row's own click activates it, so
 * without this, pressing × would open the game you were trying to delete.
 */
export function ClubGameDeleteButton({ onDelete }: Props) {
  const [state, setState] = useState<'idle' | 'confirming' | 'deleting'>('idle')

  // Auto-revert from confirming → idle after a beat. Cleared on unmount or on
  // the move to deleting, where the caller's RPC takes over the affordance.
  useEffect(function autoRevertConfirmingState() {
    if (state !== 'confirming') return
    const t = setTimeout(() => setState('idle'), 4000)
    return () => clearTimeout(t)
  }, [state])

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (state === 'idle') {
      setState('confirming')
      return
    }
    if (state === 'confirming') {
      setState('deleting')
      try {
        await onDelete()
        // No reset on success — the caller unmounts this via its realtime
        // refetch. If it somehow doesn't, the next render of the entry starts
        // fresh in `idle` anyway (the state is component-scoped).
      } catch {
        // The caller surfaces the error; this just backs out so you can retry.
        setState('idle')
      }
    }
  }

  return (
    <button
      type="button"
      className={cls(styles.deleteButton, state !== 'idle' && styles.deleteButtonActive)}
      onClick={handleClick}
      // A pointer press must not move focus here either: the list container is
      // the tab stop and owns the cursor, and a button that takes focus on click
      // blanks the ring and leaves a stray one behind. `click` still fires.
      onMouseDown={(e) => e.preventDefault()}
      disabled={state === 'deleting'}
      aria-label={
        state === 'idle'
          ? 'Delete game'
          : state === 'confirming'
            ? 'Confirm delete game'
            : 'Deleting game'
      }
    >
      {state === 'idle' && '×'}
      {state === 'confirming' && 'Confirm delete?'}
      {state === 'deleting' && 'Deleting…'}
    </button>
  )
}
