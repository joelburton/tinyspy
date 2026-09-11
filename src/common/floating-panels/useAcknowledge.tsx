// cs-blessed-floating-panels

import { useCallback, useState, type ReactNode } from 'react'
import { AcknowledgeBlockingModal } from './AcknowledgeBlockingModal'

/** The words of a statement, in the form `acknowledge` takes: a title, a body,
 *  and what the one button says. */
export type AcknowledgeOptions = {
  title: string
  message: ReactNode
  // Omit for "OK".
  okLabel?: string
}

type Pending = AcknowledgeOptions & { resolve: () => void }

/**
 * `window.alert`, but the styled `<AcknowledgeBlockingModal>` — `askConfirmation`'s
 * counterpart for the case where there is nothing to decide:
 *
 *     const { acknowledge, acknowledgeModal } = useAcknowledge()
 *     if (!next) {
 *       await acknowledge({ title: 'No more puzzles', message: … })
 *       return
 *     }
 *     // and render {acknowledgeModal} anywhere in the tree
 *
 * **The promise resolves `void`, and that is the point.** A box with one way
 * out cannot report which way you left, so there is no answer to hand back.
 * Awaiting it still means something — the modal has been dismissed — so a
 * caller with something to do afterwards can.
 *
 * `acknowledge`'s identity is stable, so it is safe in `useCallback` deps. A
 * second call while one is pending replaces it (the first resolves), which
 * can't happen from a modal-blocked UI but beats a dangling promise. If the
 * component unmounts mid-modal the promise never settles; callers are
 * fire-and-forget async handlers, so nothing leaks or retries.
 */
export function useAcknowledge(): {
  acknowledge: (opts: AcknowledgeOptions) => Promise<void>
  acknowledgeModal: ReactNode
} {
  const [pending, setPending] = useState<Pending | null>(null)

  const acknowledge = useCallback(
    (opts: AcknowledgeOptions) =>
      new Promise<void>((resolve) => {
        setPending((prev) => {
          prev?.resolve() // a superseded statement is considered seen
          return { ...opts, resolve }
        })
      }),
    [],
  )

  const settle = () => {
    setPending((prev) => {
      prev?.resolve()
      return null
    })
  }

  const acknowledgeModal = pending ? (
    <AcknowledgeBlockingModal
      title={pending.title}
      message={pending.message}
      okLabel={pending.okLabel}
      onAcknowledge={settle}
    />
  ) : null

  return { acknowledge, acknowledgeModal }
}
