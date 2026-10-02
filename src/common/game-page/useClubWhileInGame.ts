// cs-unmet

import { useEffect } from 'react'
import { useClubRoster } from '../club/useClubRoster'
import { FeedbackMessage } from '../feedback/FeedbackMessage'
import type { FeedbackSlot } from '../feedback/feedbackSlotStore'
import type { Member } from '../members/member'
import { useClubPresence } from '../realtime/useClubPresence'
import { useClubSetupPresence } from '../realtime/useClubSetupPresence'

type ClubWhileInGameOptions = {
  clubHandle: string
  gameId: string
  myId: string
  // Where a failed roster read is said.
  globalFeedbackSlot: FeedbackSlot
}

/**
 * The club around a game page: tells the club page I'm in this game, hears
 * about a peer setting up a new one, and returns every member of the club —
 * not only this game's players, since chat names them all.
 *
 * A failed roster read has already raised its modal; the page carries on
 * without names, and the header keeps saying so.
 */
export function useClubWhileInGame({
  clubHandle,
  gameId,
  myId,
  globalFeedbackSlot,
}: ClubWhileInGameOptions): Member[] {
  useClubPresence(clubHandle, gameId, myId)
  useClubSetupPresence({ clubHandle, myId: myId, mySetup: null })
  const { members, failure } = useClubRoster(clubHandle)

  useEffect(function showRosterFailure() {
    if (!failure) return
    globalFeedbackSlot.show(
      FeedbackMessage.notOk({ ...failure, message: "Couldn't load. Refresh page." }),
    )
  }, [globalFeedbackSlot, failure])

  return members
}
