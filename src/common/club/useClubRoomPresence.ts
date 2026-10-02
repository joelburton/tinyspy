// cs-unmet

import { useMemo } from 'react'
import type { GameManifest } from '../manifest/gameManifest'
import type { Member } from '../members/member'
import { useClubPresence } from '../realtime/useClubPresence'
import { useClubSetupPresence } from '../realtime/useClubSetupPresence'
import { useHealAbandonedCurrentGame } from './useHealAbandonedCurrentGame'

type ClubRoomPresenceOptions = {
  clubHandle: string
  myId: string
  members: Member[]
  // The `is_current_view` game's id, or null.
  currentGameId: string | null
  // The game my setup dialog is open on, or null.
  setupManifest: GameManifest | null
}

/**
 * The club page's side of the club's presence — what `useClubWhileInGame` is
 * for a game page. Tells the club I'm in the club room, announces a setup
 * dialog of mine while it is open (and hears a peer's), and heals a current
 * game nobody is in (`useHealAbandonedCurrentGame`).
 *
 * Returns who is here, for the members strip.
 */
export function useClubRoomPresence({
  clubHandle,
  myId,
  members,
  currentGameId,
  setupManifest,
}: ClubRoomPresenceOptions): Set<string> {
  const presence = useClubPresence(clubHandle, null, myId)
  useHealAbandonedCurrentGame(currentGameId, presence)

  // I'm a member of any club whose page I can load: `get_club_page` refuses
  // anyone else.
  const selfUsername = members.find((m) => m.id === myId)!.username
  useClubSetupPresence({
    clubHandle,
    myId,
    mySetup: setupManifest
      ? { brand: setupManifest.name, mode: setupManifest.mode, username: selfUsername }
      : null,
  })

  return useMemo(() => new Set(presence.map((e) => e.userId)), [presence])
}
