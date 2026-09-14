// cs-blessed-manifest

import { showFaultModal } from '../faults/faultStore'

/**
 * Tell the player their bundle is behind the server, and to reload.
 *
 * Called when a `common.games` row names a gametype `src/gametypes.ts` has no
 * manifest for. That row's `gametype` is `references common.gametypes(gametype)`,
 * so the server knows the game and this bundle does not — an open tab from
 * before a deploy that added one. Removing a game deletes its rows, so there is
 * no such thing as a leftover row with no game behind it (Joel, 2026-09-14).
 *
 * A fault rather than a silent skip: the row IS dropped from whatever list
 * asked, so without this a friend compares club pages with the person beside
 * them and finds a game missing from one of them, with nothing on screen or in
 * the console saying why. A modal because reloading is the fix and an
 * announcement in the corner is dismissable by not looking at it.
 *
 * Takes every unknown gametype from ONE load, because the fault store queues a
 * separate modal per call and does not dedupe — a club with three games of a
 * new gametype would otherwise stack three identical modals.
 */
export function reportUnknownGametypes(unknown: string[]): void {
  if (unknown.length === 0) return
  const names = [...new Set(unknown)].sort()
  showFaultModal({
    text: 'This page is out of date, so some games are missing from it. Reload to see them.',
    diagnostics: `unknown gametype(s): ${names.join(', ')} — not in this bundle's registry`,
  })
}
