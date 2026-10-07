// cs-unmet

import { useEffect } from 'react'
import { PawProtectionModal } from './PawProtectionModal'
import { dismissRefusal, registerPawProtectionHost, usePendingRefusal } from './pawProtectionService'

/**
 * Draws the paw-protection modal while `ensureCanStart` is refusing a start.
 * Mounted once, at the app root — there is nothing to configure and nothing
 * to pass.
 *
 * At the root rather than in a page because the code that asks is often not
 * in a page at all: an action's shared run asks before it fires, wherever the
 * action was bound. Renders nothing when no refusal is pending.
 */
export function PawProtectionHost() {
  const pending = usePendingRefusal()

  // Claim the host slot for as long as this is mounted, so a start asked with
  // nowhere to refuse it is refused outright rather than let through.
  useEffect(registerPawProtectionHost, [])

  if (!pending) return null
  return <PawProtectionModal gametype={pending.gametype} cap={pending.cap} onDismiss={dismissRefusal} />
}
