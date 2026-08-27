// cs-unmet

import { useEffect, useState } from 'react'
import { cls } from '../../lib/util/cls'
import { TrashButton } from '../buttons/TrashButton'
import styles from './ClubGameDeleteButton.module.css'

type Props = {
  /** Called when the user confirms. The caller (ClubPage) owns the mechanics:
   *  for the club's current game, broadcasting a `suspend` so peers navigate
   *  out before the row vanishes; for any game, the `common.delete_game` RPC. */
  onDelete: () => Promise<void> | void
}

/**
 * The hover-revealed trash can in a game entry's top-right corner, and the
 * two-step confirmation behind it.
 *
 *   - **idle** — a small trash can, invisible until the entry around it is
 *     hovered or
 *     holds focus, so it doesn't compete with the entry's content until you go
 *     looking for it.
 *   - **confirming** — expands into a "Confirm delete?" pill, always
 *     visible, auto-reverting after 4 seconds. A misclicked × can simply be
 *     ignored; there is no Cancel to find.
 *   - **deleting** — "Deleting…" while the caller does its work.
 *
 * **A DESTRUCTIVE button in every state**: the same tone at
 * rest, on hover and while confirming, so the affordance that says "this
 * deletes something" is there BEFORE the click rather than after it. Only the
 * SHAPE changes, from a square trash can to a labelled pill.
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

  const name =
    state === 'idle'
      ? 'Delete game'
      : state === 'confirming'
        ? 'Confirm delete?'
        : 'Deleting…'

  return (
    // A real `<TrashButton>`, not a hand-rolled button wearing borrowed classes.
    // Its tone, its glyph and its focus-suppression are the shared ones — this
    // file is left holding only what is genuinely its own: where the button
    // sits, when it is visible, and the two-step state.
    //
    // DRAWING THE LABEL IS THE SHAPE CHANGE. At rest the label is suppressed and
    // it is a trash can in a fixed square; once you press it the same button
    // draws its name beside the same glyph, so the thing that expands is visibly
    // the thing you clicked rather than a pill that replaced it.
    //
    // `small` brings the whole small button with it: tighter padding, smaller
    // type, a glyph that follows them both, and the 1.6rem icon-only box. One
    // prop rather than two loose classes whose padding fought on declaration
    // order — which is what crushes a trash can into a sliver.
    <TrashButton
      name={name}
      label={state === 'idle' ? null : undefined}
      small
      className={cls(styles.deleteButton, state !== 'idle' && styles.deleteButtonActive)}
      onClick={handleClick}
      disabled={state === 'deleting'}
    />
  )
}
