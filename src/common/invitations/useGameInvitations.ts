// cs-blessed-common-hosts

import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../supabase/supabase'
import { db as commonDb } from '../supabase/db'
import { readRows } from '../supabase/dbResult'
import { navigate, usePath } from '../routing/router'
import { gamePath, matchGameRoute } from '../routing/routes'
import { channelDedupSuffix } from '../realtime/channelDedup'
import { onPostgresAttached } from '../realtime/postgresAttached'
import { manifestFor } from '@/gametypes'
import { reportUnknownGametypes } from '../manifest/unknownGametype'
import {
  inviteCutoffIso,
  loadSeenInvites,
  markInviteSeen,
  newInviteCandidates,
  type GameInvite,
  type InviteCandidate,
} from './gameInvites'

/**
 * Global game-invitation watcher — mounted once on every authenticated
 * page (App.tsx, after the claim-handle gate). When the caller is added
 * to a game (a `common.game_players` INSERT), it surfaces a "join this
 * game" invitation; `<GameInvitations>` mirrors the result into the toast
 * store, which is what draws it.
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
 * That re-scan is bounded by AGE as well as by `is_terminal`, because
 * `is_terminal` alone lets the pool grow forever — see `INVITE_MAX_AGE_MS`.
 * The bound never delays a real invite: the realtime path runs the same query,
 * and a game seconds old clears the cutoff easily.
 *
 * Dedup is the `seen` set (localStorage): a game's invite surfaces once,
 * then is marked seen so a reload / refetch won't re-nag. Dismissed
 * invites are recovered via the club page (the game shows up there as the
 * active game), not by re-popping. The currently-viewed game is filtered
 * from the returned list so you're never invited to the game you're in.
 *
 * `join` navigates to the game (leaving any game you're mid-play in,
 * which simply pauses it for the others). `dismiss` just drops the invite from
 * the list, which retires its toast.
 */
export function useGameInvitations(session: Session): {
  invites: GameInvite[]
  dismiss: (gameId: string) => void
  join: (invite: GameInvite) => void
} {
  const selfId = session.user.id
  const currentGameId = matchGameRoute(usePath())?.gameId ?? null
  // All surfaced-and-not-yet-acted-on invitations (across pages).
  const [pending, setPending] = useState<GameInvite[]>([])

  // Scan for new invitations: the games I'm a player in that are
  // non-terminal, not mine, and not already seen — resolve their display
  // name + inviter, mark them seen, and append. Stable across renders
  // (depends only on selfId) so the subscription effect doesn't churn.
  const load = useCallback(async () => {
    // One inner-join embed, not two queries: `!inner` pushes the
    // `is_terminal = false` filter into this same query, so the row set is my
    // *active* games — a handful. That matters because the result is unordered
    // and PostgREST truncates at `max_rows`; a query over EVERY game_players
    // row I have could drop a fresh invite nondeterministically.
    const rowsRes = await readRows(
      commonDb
        .from('game_players')
        .select('games!inner(id, gametype, club_handle, created_by)')
        .eq('user_id', selfId)
        .eq('games.is_terminal', false)
        // …and recent, which is load-bearing: `is_terminal = false` is not a
        // staleness bound, so without this the scan returns every unfinished
        // game you have ever been seated in. See `INVITE_MAX_AGE_MS`.
        .gt('games.started_at', inviteCutoffIso()),
    )
    // A failed read means we do not learn about invites this round. Nothing to
    // recover: this refetches on every `game_players` INSERT and on every
    // reconnect rescan, so the next one that lands catches up. `readRows` has
    // logged it and raised the modal.
    if (rowsRes.type === 'not-ok') return

    // The embed is to-one (game_players.game_id → games.id), so each row's
    // `games` is a single game object.
    const candidates = rowsRes.data.map((r) => r.games) as InviteCandidate[]

    // Each candidate paired with its manifest in ONE pass. A candidate whose
    // gametype this bundle has no manifest for cannot be named in an invite —
    // and is reported rather than dropped quietly, because it means this tab
    // predates a deploy and the player is missing invitations until they
    // reload (`reportUnknownGametypes`).
    const unknownGametypes: string[] = []
    const fresh: { candidate: InviteCandidate; gameName: string }[] = []
    for (const c of newInviteCandidates(candidates, { selfId, seen: loadSeenInvites() })) {
      const manifest = manifestFor(c.gametype)
      if (!manifest) unknownGametypes.push(c.gametype)
      else fresh.push({ candidate: c, gameName: manifest.name })
    }
    reportUnknownGametypes(unknownGametypes)
    if (fresh.length === 0) return

    // Resolve inviter usernames (the game's creator).
    const creatorIds = [...new Set(fresh.map((f) => f.candidate.created_by))]
    const profsRes = await readRows(
      commonDb.from('profiles').select('user_id, username').in('user_id', creatorIds),
    )
    // A failed name lookup does NOT drop the invites — it only costs their
    // inviter's name, and the `?? 'Someone'` below already covers a creator
    // whose profile is missing. An invite that says "Someone started a game"
    // is worth more than no invite at all, which is what returning here would
    // produce.
    const nameById = new Map(
      profsRes.type === 'ok' ? profsRes.data.map((p) => [p.user_id, p.username]) : [],
    )

    const built: GameInvite[] = fresh.map(({ candidate: c, gameName }) => ({
      gameId: c.id,
      gametype: c.gametype,
      gameName,
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
      // Deaf-window closer: rescan once the postgres_changes attach is
      // confirmed — an invite INSERT committed between SUBSCRIBED (the join
      // ack) and the attach is dropped. See postgresAttached.ts
      // + docs/realtime-lost-events.md.
      onPostgresAttached(ch, () => void load())
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
  // back/forward button, or the toast's own Join. Without this, every route
  // but Join leaves the invite in `pending`; the render-time filter
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
    navigate(gamePath(invite.gametype, invite.gameId))
  }, [])

  // Never invite someone to the game they're already looking at. This
  // suppresses the invite on the SAME render the path changes (no one-frame
  // flash); the render-time prune above then drops it from `pending` so the
  // dismissal is durable once they navigate away.
  const invites = pending.filter((i) => i.gameId !== currentGameId)
  return { invites, dismiss, join }
}
