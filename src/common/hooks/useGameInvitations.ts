import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { db as commonDb } from '../db'
import { navigate, usePath } from '../lib/router'
import { channelDedupSuffix } from '../lib/channelDedup'
import { games } from '../../games'
import {
  loadSeenInvites,
  markInviteSeen,
  newInviteCandidates,
  type GameInvite,
  type InviteCandidate,
} from '../lib/gameInvites'

/** Pull the game id out of a `/g/<gametype>/<id>` path, else null. */
function currentGameIdFromPath(path: string): string | null {
  const m = path.match(/^\/g\/[a-z0-9_]+\/([0-9a-f-]+)/i)
  return m ? m[1] : null
}

/**
 * Global game-invitation watcher — mounted once on every authenticated
 * page (App.tsx, after the claim-handle gate). When the caller is added
 * to a game (a `common.game_players` INSERT), it surfaces a "join this
 * game" invitation; the popup component renders the result.
 *
 * Two trigger paths, mirroring the realtime data-hook pattern:
 *   - **realtime** — a stable subscription to `game_players` INSERTs
 *     filtered to my user_id, so an invite pops instantly while I'm
 *     online.
 *   - **refetch on (re)subscribe** — `SUBSCRIBED` fires on first connect
 *     AND on reconnect, so we re-scan for non-terminal games I'm a player
 *     in. This recovers invitations sent while I was offline / before my
 *     tab loaded (rare, but the realtime INSERT alone would miss them).
 *
 * Dedup is the `seen` set (localStorage): a game's invite surfaces once,
 * then is marked seen so a reload / refetch won't re-nag. Dismissed
 * invites are recovered via the club page (the game shows up there as the
 * active game), not by re-popping. The currently-viewed game is filtered
 * from the returned list so you're never invited to the game you're in.
 *
 * `join` navigates to the game (leaving any game you're mid-play in,
 * which simply pauses it for the others). `dismiss` just hides the popup.
 */
export function useGameInvitations(session: Session): {
  invites: GameInvite[]
  dismiss: (gameId: string) => void
  join: (invite: GameInvite) => void
} {
  const selfId = session.user.id
  const currentGameId = currentGameIdFromPath(usePath())
  // All surfaced-and-not-yet-acted-on invitations (across pages).
  const [pending, setPending] = useState<GameInvite[]>([])

  // Scan for new invitations: the games I'm a player in that are
  // non-terminal, not mine, and not already seen — resolve their display
  // name + inviter, mark them seen, and append. Stable across renders
  // (depends only on selfId) so the subscription effect doesn't churn.
  const load = useCallback(async () => {
    const { data: rows } = await commonDb
      .from('game_players')
      .select('game_id')
      .eq('user_id', selfId)
    const ids = (rows ?? []).map((r) => r.game_id)
    if (ids.length === 0) return

    const { data: gs } = await commonDb
      .from('games')
      .select('id, gametype, club_handle, created_by')
      .in('id', ids)
      .eq('is_terminal', false)
    const candidates = (gs ?? []) as InviteCandidate[]

    const fresh = newInviteCandidates(candidates, {
      selfId,
      seen: loadSeenInvites(),
    }).filter((c) => games.some((g) => g.gametype === c.gametype))
    if (fresh.length === 0) return

    // Resolve inviter usernames (the game's creator).
    const creatorIds = [...new Set(fresh.map((c) => c.created_by))]
    const { data: profs } = await commonDb
      .from('profiles')
      .select('user_id, username')
      .in('user_id', creatorIds)
    const nameById = new Map((profs ?? []).map((p) => [p.user_id, p.username]))

    const built: GameInvite[] = fresh.map((c) => ({
      gameId: c.id,
      gametype: c.gametype,
      gameName: games.find((g) => g.gametype === c.gametype)!.name,
      clubHandle: c.club_handle,
      inviterName: nameById.get(c.created_by) ?? 'Someone',
    }))
    for (const inv of built) markInviteSeen(inv.gameId)
    setPending((prev) => {
      const have = new Set(prev.map((i) => i.gameId))
      const add = built.filter((i) => !have.has(i.gameId))
      return add.length ? [...prev, ...add] : prev
    })
  }, [selfId])

  // Subscribe once: game_players INSERTs for me + a (re)connect rescan.
  useEffect(
    function watchInvitations() {
      const ch = supabase.channel(`game-invites:${selfId}:${channelDedupSuffix()}`)
      ch.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'common',
          table: 'game_players',
          filter: `user_id=eq.${selfId}`,
        },
        () => void load(),
      )
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') void load()
      })
      return () => {
        supabase.removeChannel(ch)
      }
    },
    [selfId, load],
  )

  const dismiss = useCallback((gameId: string) => {
    setPending((prev) => prev.filter((i) => i.gameId !== gameId))
  }, [])

  const join = useCallback((invite: GameInvite) => {
    markInviteSeen(invite.gameId)
    setPending((prev) => prev.filter((i) => i.gameId !== invite.gameId))
    navigate(`/g/${invite.gametype}/${invite.gameId}`)
  }, [])

  // Never invite someone to the game they're already looking at.
  const invites = pending.filter((i) => i.gameId !== currentGameId)
  return { invites, dismiss, join }
}
