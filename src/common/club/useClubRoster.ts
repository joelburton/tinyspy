// cs-blessed-club-page

import { useEffect, useState } from 'react'
import { db as commonDb } from '../supabase/db'
import { readRows } from '../supabase/dbResult'
import type { NotOkEnvelope } from '../supabase/envelope'
import type { Member } from '../members/member'

/**
 * The FULL club membership (id + username + color), read in two steps:
 * `clubs_members` for the ids, then `profiles` for those ids.
 *
 * Exists because the GAME page only knows the current game's *players*, but chat
 * is club-wide — so naming a chat sender (in the chat window AND the global-
 * feedback pill) needs every club member, player or not. Without it a
 * non-player's messages have no name to render.
 *
 * One-shot fetch (roster changes are rare); a member who joins mid-session
 * resolves after a reload. Returns an empty list until the fetch resolves, and
 * a no-op when `clubHandle` is empty (e.g. before a game row has loaded).
 *
 * Nothing retries: a failed read comes back as `failure`, after its fault modal,
 * for the page to keep on screen — a reload is the recovery.
 */
export function useClubRoster(clubHandle: string): {
  members: Member[]
  failure: NotOkEnvelope | null
} {
  const [members, setMembers] = useState<Member[]>([])
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)

  useEffect(
    function loadClubRoster() {
      // No club yet (e.g. the game page before its row loads) — nothing to
      // fetch; `members` stays at its empty initial value.
      if (!clubHandle) return
      let mounted = true
      async function load() {
        const rowsRes = await readRows(
          commonDb.from('clubs_members').select('user_id').eq('club_handle', clubHandle),
        )
        if (!mounted) return
        // A failed read leaves `members` ALONE rather than emptying it. This
        // hook feeds names, colors and presence dots, so writing `[]` would
        // repaint the page as a club with nobody in it — a worse answer than a
        // stale one. `readRows` has already logged it and raised the modal.
        if (rowsRes.type === 'not-ok') {
          setFailure(rowsRes)
          return
        }

        // ZERO ROWS is a club with no members, which cannot happen — creating
        // one seats its creator. Nothing to look up either way.
        const userIds = rowsRes.data.map((r) => r.user_id)
        if (userIds.length === 0) {
          setMembers([])
          return
        }

        const profilesRes = await readRows(
          commonDb.from('profiles').select('user_id, username, color').in('user_id', userIds),
        )
        if (!mounted) return
        if (profilesRes.type === 'not-ok') {
          setFailure(profilesRes)
          return
        }
        setMembers(profilesRes.data as Member[])
      }
      load()
      return () => {
        mounted = false
      }
    },
    [clubHandle],
  )

  return { members, failure }
}
