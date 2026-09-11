// cs-blessed-floating-panels

import { useEffect } from 'react'
import { ConfirmationBlockingModal } from './ConfirmationBlockingModal'
import {
  registerConfirmationHost,
  settleConfirmation,
  usePendingConfirmation,
} from './confirmationService'

/**
 * Draws whatever question `askConfirmation` is currently asking. Mounted once,
 * at the app root — there is nothing to configure and nothing to pass.
 *
 * At the root rather than in a page because the code that asks is often not in
 * a page at all: an action's shared run asks before it fires, wherever the
 * action was bound. Renders nothing when no question is pending.
 */
export function ConfirmationHost() {
  const pending = usePendingConfirmation()

  // Claim the host slot for as long as this is mounted, so a question asked
  // with nowhere to appear is refused rather than left hanging.
  useEffect(registerConfirmationHost, [])

  if (!pending) return null
  return (
    <ConfirmationBlockingModal
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      alternativeLabel={pending.alternativeLabel}
      cancelLabel={pending.cancelLabel}
      primaryButton={pending.primaryButton}
      onConfirm={() => settleConfirmation('confirm')}
      onAlternative={pending.alternativeLabel ? () => settleConfirmation('alternative') : undefined}
      onCancel={() => settleConfirmation(null)}
    />
  )
}
