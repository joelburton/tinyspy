// cs-blessed-pause-suspend

import type { ReactNode } from 'react'
import type { Member } from '../members/member'
import { PauseOverlay, type PauseActions } from './PauseOverlay'
import type { GamePause } from './pause'

type Props = {
  // The pause; the boundary reads only `paused`, the overlay the rest.
  pause: GamePause
  // Who the pause waits for, drawn by the overlay.
  players: Member[]
  // The ways out of a pause that won't clear.
  actions: PauseActions
  // The play surface. Rendered only while not paused.
  children: ReactNode
}

/**
 * Renders either the play surface or the pause banner, from one `paused` flag —
 * wrap a game's play area in it and pass the page's `cg.pause`.
 *
 * Paused children are UNMOUNTED, not hidden, and that is the contract callers
 * depend on: per-game state inside the play area (pending input, tile
 * selections, transient banners) goes away with it and rebuilds clean on
 * resume, so no game writes pause cleanup of its own. The realtime channel in
 * the game's `useGame` tears down and resubscribes with it; the gap is covered
 * by the on-SUBSCRIBED refetch. Anything that must survive a pause therefore
 * belongs above this boundary or in the database — `doc.md` → Details, and
 * docs/states.md → paused for the wider pattern.
 */
export function PauseBoundary({ pause, players, actions, children }: Props) {
  if (pause.paused) return <PauseOverlay pause={pause} players={players} actions={actions} />
  return <>{children}</>
}
