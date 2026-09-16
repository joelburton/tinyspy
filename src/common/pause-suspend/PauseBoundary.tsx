// cs-blessed-pause-suspend

import type { ReactNode } from 'react'
import type { BoundAction } from '../actions/useBoundAction'
import type { Member } from '../members/member'
import { PauseOverlay } from './PauseOverlay'

type Props = {
  // Whether the game is currently paused — the union of every pause source
  // (presence, manual). The boundary does not care which; only the boolean.
  paused: boolean
  // The players the overlay draws, and the ids currently on the channel that
  // split them into present and away. See `PauseOverlay`, which is handed both.
  players: Member[]
  presentUserIds: Set<string>
  // Who pressed Pause — null when the pause is presence-only — and the handler
  // that releases it. Both pass straight through to `PauseOverlay`; its Props
  // say what they draw.
  manuallyPausedBy: Member | null
  onResume: () => void
  // The two escapes from a pause that will not clear, bound by `GamePage` —
  // which is above this boundary, so the bindings survive the unmount below.
  // `act-end-game` hides itself unless paused, so passing it always is right.
  actBackToClub: BoundAction
  actEndGame: BoundAction
  // The play surface. Rendered only when `paused === false`.
  children: ReactNode
}

/**
 * Renders either the play surface or the pause banner, from one `paused` flag —
 * wrap a game's play area in it and pass the flag `useCommonGame` computes.
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
export function PauseBoundary({
  paused,
  players,
  presentUserIds,
  manuallyPausedBy,
  onResume,
  actBackToClub,
  actEndGame,
  children,
}: Props) {
  if (paused) {
    return (
      <PauseOverlay
        players={players}
        presentUserIds={presentUserIds}
        manuallyPausedBy={manuallyPausedBy}
        onResume={onResume}
        actBackToClub={actBackToClub}
        actEndGame={actEndGame}
      />
    )
  }
  return <>{children}</>
}
