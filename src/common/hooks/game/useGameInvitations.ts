import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/supabase'
import { db as commonDb } from '../../db'
import { navigate, usePath } from '../../lib/routing/router'
import { channelDedupSuffix } from '../../lib/supabase/channelDedup'
import { games } from '../../../games'
import {
  loadSeenInvites,
  markInviteSeen,
  newInviteCandidates,
  type GameInvite,
  type InviteCandidate,
} from '../../lib/game/gameInvites'

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
    // One inner-join embed, not two queries. The old shape fetched EVERY
    // game_players row for me (unordered — nondeterministic truncation at
    // `max_rows`, so a fresh invite could be silently dropped) and then
    // filtered those ids to non-terminal games. The `!inner` embed pushes
    // the `is_terminal = false` filter into the same query, so the row set
    // is bounded to my *active* games — a handful, never near the cap.
    const { data: rows } = await commonDb
      .from('game_players')
      .select('games!inner(id, gametype, club_handle, created_by)')
      .eq('user_id', selfId)
      .eq('games.is_terminal', false)
    // The embed is to-one (game_players.game_id → games.id), so each row's
    // `games` is a single game object.
    const candidates = (rows ?? []).map((r) => r.games) as InviteCandidate[]

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

  // Entering the invited game by ANY route is a real dismissal — the
  // club's active-game card (a plain <Link>), a shared URL, the
  // back/forward button, or the dialog's own Join. Without this, those
  // non-dialog paths leave the invite in `pending`; the render-time filter
  // below only HIDES it while the URL is exactly that game, so it pops
  // right back the moment you navigate away (back to the club, or the
  // auto-redirect when the game ends / suspends). Dropping it from
  // `pending` makes the suppression durable. It's already marked seen at
  // surface time, so a later refetch won't re-add it.
  //
  // This is React's "adjust state when a value changes *during render*"
  // pattern (you-might-not-need-an-effect) rather than an effect: we store
  // the last-seen game id and prune `pending` the render the path first
  // resolves to a pending invite's game. No effect → no extra commit, and
  // it can't lag a frame behind the navigation.
  const [enteredGameId, setEnteredGameId] = useState<string | null>(null)
  if (currentGameId && currentGameId !== enteredGameId) {
    setEnteredGameId(currentGameId)
    setPending((prev) =>
      prev.some((i) => i.gameId === currentGameId)
        ? prev.filter((i) => i.gameId !== currentGameId)
        : prev,
    )
  }

  const dismiss = useCallback((gameId: string) => {
    setPending((prev) => prev.filter((i) => i.gameId !== gameId))
  }, [])

  const join = useCallback((invite: GameInvite) => {
    markInviteSeen(invite.gameId)
    setPending((prev) => prev.filter((i) => i.gameId !== invite.gameId))
    navigate(`/g/${invite.gametype}/${invite.gameId}`)
  }, [])

  // Never invite someone to the game they're already looking at. This
  // suppresses the popup on the SAME render the path changes (no one-frame
  // flash); the effect above then removes the invite from `pending` so the
  // dismissal is durable once they navigate away.
  const invites = pending.filter((i) => i.gameId !== currentGameId)
  return { invites, dismiss, join }
}
