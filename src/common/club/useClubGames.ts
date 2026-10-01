// cs-blessed-club-page

import { useEffect, useState } from 'react'
import { db as commonDb } from '../supabase/db'
import { readRows } from '../supabase/dbResult'
import { supabase } from '../supabase/supabase'
import { channelDedupSuffix } from '../realtime/channelDedup'
import { onPostgresAttached } from '../realtime/postgresAttached'
import { manifestFor } from '@/gametypes'
import { reportUnknownGametypes } from '../manifest/unknownGametype'
import type { CommonGameListRow, GameManifest } from '../manifest/gameManifest'
import { readGameEnding, type GameEndingColumns } from '../terminal/readGameEnding'
import { FeedbackMessage } from '../feedback/FeedbackMessage'
import type { FeedbackSlot } from '../feedback/useFeedbackSlot'
import type { Member } from '../members/member'

/**
 * Display shape for one game in the club's games list: the fields of a
 * common.games row this page renders, plus the manifest of the gametype it
 * belongs to.
 *
 * Anything about the GAMETYPE is reached through `manifest` rather than copied
 * flat — the filter's family and brand, the row's mode and logo. `statusLabel`
 * is the exception because it isn't a field at all: it's `labelFor(row,
 * members)`, a call that needs the game as well as the gametype.
 */
export type ListedGame = {
  gameId: string
  // The gametype's manifest, resolved once when the row is built — a gametype
  // this FE doesn't know never becomes a `ListedGame`, so everything downstream
  // takes it as given instead of looking it up again.
  manifest: GameManifest
  title: string
  // `common.games.status_changed_at` — when the game's status last changed: a
  // create, a Restart, a move or the end. The card dates by it and the list
  // orders by it, so a long-suspended game reads by when it was last played
  // rather than when it began.
  statusChangedAt: string
  isTerminal: boolean
  // The club's current game: its `common.games.is_current_view`.
  isCurrent: boolean
  statusLabel: string
}

/** One `common.games` row as the listing selects it — the select string in
 *  `useClubGames` names these columns. */
type ClubGamesRow = GameEndingColumns & {
  id: string
  gametype: string
  title: string
  clubpage_info: unknown
  status_changed_at: string
  is_current_view: boolean
}

/**
 * One listing row's display entry, or null for a gametype this bundle doesn't
 * know — the caller drops those and reports them. `members` is the club's, for
 * the label to name a user id with.
 */
function makeListedGame(r: ClubGamesRow, members: readonly Member[]): ListedGame | null {
  const manifest = manifestFor(r.gametype)
  if (!manifest) return null
  const listRow: CommonGameListRow = {
    id: r.id,
    gametype: r.gametype,
    gameEnding: readGameEnding(r),
    clubpageInfo: r.clubpage_info as CommonGameListRow['clubpageInfo'],
  }
  return {
    gameId: r.id,
    manifest,
    title: r.title,
    statusChangedAt: r.status_changed_at,
    isTerminal: r.ended_at !== null,
    isCurrent: r.is_current_view,
    statusLabel: manifest.labelFor(listRow, members),
  }
}

/**
 * A club's games, kept fresh: one read of `common.games` plus a Realtime
 * subscription that re-reads on every change to a row of this club's.
 *
 * Returns the list in last-played order; the current game (the
 * `is_current_view` row), both as the listed game and as its id; and whether
 * the last read failed — which only the list's empty state needs, since a
 * failure keeps the list it already has. The id is there without the game when
 * the current game's gametype is one this bundle doesn't know.
 *
 * **It shows its own failure**, into the slot the caller hands it, because
 * nothing retries this read. It re-runs only when another `common.games` row
 * changes, and the commonest failure is the refetch after your OWN delete —
 * where that DELETE was the event, so no second one is coming.
 *
 * Takes the club's handle, its members — which each row's `labelFor` names a
 * user id from — and the page's global feedback slot; all three are stable, so
 * nothing here resubscribes on a render.
 */
export function useClubGames(
  clubHandle: string,
  members: readonly Member[],
  globalFeedbackSlot: FeedbackSlot,
) {
  const [games, setGames] = useState<ListedGame[]>([])
  const [currentGameId, setCurrentGameId] = useState<string | null>(null)
  // Whether the last read failed. Only the list's empty state reads it: "No
  // games yet." is a lie when the read is what came back empty, and this is a
  // page the player is being told to reload.
  const [hasReadFailed, setHasReadFailed] = useState(false)

  // Load games for this club + the current-view game id.
  // Re-runs whenever realtime tells us a games row for this club
  // changed (new game inserted, a move or an ending ran the game's
  // status builder, set_current_view / unset_current_view flipped the
  // is_current_view pointer, etc.). Also fires on initial mount.
  useEffect(function subscribeToClubGames() {
    let mounted = true
    // Monotonic generation for out-of-order protection: loadGames fires on
    // initial + on-SUBSCRIBED + every common.games event, and these overlapping
    // loads can resolve out of order. Commit only the newest, so a slow initial
    // load can't clobber a fresher event-load's listing. Same fix as
    // useRealtimeRefetch / useCommonGame.
    let generation = 0

    async function loadGames() {
      const myGen = ++generation
      // One read into common.games: everything a label needs is on the
      // row, so each row's label is the matching manifest's pure
      // `labelFor`. A gametype this bundle's registry doesn't have is skipped
      // and then REPORTED — see `reportUnknownGametypes`; it means this tab
      // predates a deploy, and the list it draws is quietly short until the
      // player reloads.
      const res = await readRows(
        commonDb
          .from('games')
          .select(
            `id, gametype, title, ended_at, game_ended_reason, 
            game_ended_reason_detail, game_ended_outcome, game_ended_by_user_id, 
            clubpage_info, status_changed_at, is_current_view`,
          )
          .eq('club_handle', clubHandle)
          .order('status_changed_at', { ascending: false })
          // Explicit bound so a long-lived club can't drift into PostgREST's
          // silent `max_rows` truncation. Overflow past 200 is DELIBERATE — the
          // list shows everything it gets, and descending order means the drop
          // is the oldest games (nobody scrolls a club's full lifetime history;
          // the current game is always recently-active, so it's never cut).
          .limit(200),
      )
      if (!mounted || myGen !== generation) return
      // A failure here leaves the LIST alone — no error page, no cleared list.
      // Unlike the club load (ClubPageLoader), this runs against a page that is already on
      // screen and whose other half is fine, so a modal over it is the right
      // escalation and replacing it would not be (error-page/doc.md).
      //
      // What it must not be is silent. Nothing retries this read: it re-runs
      // only when another common.games row changes, and the commonest failure
      // is the refetch that follows your OWN delete — where that DELETE was the
      // event, so no second one is coming and the game sits in the list looking
      // undeleted. So the modal is escalated by a message that outlives
      // dismissing it, and the honest instruction is to reload.
      if (res.type === 'not-ok') {
        setHasReadFailed(true)
        globalFeedbackSlot.show(FeedbackMessage.notOk(res))
        return
      }
      setHasReadFailed(false)

      const rows = res.data
      // Read off every row, a gametype this bundle doesn't know included: the
      // club still has a current game when this tab can't draw it.
      const currentId = rows.find((r) => r.is_current_view)?.id ?? null
      const listed = rows
        .map((r) => makeListedGame(r, members))
        .filter((g): g is ListedGame => g !== null)
      // Collected across the whole load, not reported per row: one fault for
      // one stale bundle, however many of its games the club has.
      const unknownGametypes = rows
        .filter((r) => !manifestFor(r.gametype))
        .map((r) => r.gametype)
      setCurrentGameId(currentId)
      setGames(listed)
      reportUnknownGametypes(unknownGametypes)
    }

    loadGames()

    // Subscribe to common.games changes for this club purely to keep the
    // games list fresh: a new-game start, a set/unset_current_view pointer
    // flip, create_game's auto-vacate of the prior current game, a move
    // or an ending — all surface here and trigger a list reload.
    //
    // It navigates NOBODY. Being added to a game pops a join invitation
    // globally (`useGameInvitations`, mounted in App.tsx), so a player joins on
    // their own terms wherever they are; a member here just sees the new game
    // appear and gets the invite. The game waits, paused, until they join.
    const channel = supabase
      .channel(`club-games:${clubHandle}:${channelDedupSuffix()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'common',
          table: 'games',
          // A DELETE matches this only because common.games is REPLICA
          // IDENTITY FULL (see its migration).
          filter: `club_handle=eq.${clubHandle}`,
        },
        () => loadGames(),
      )
    // Deaf-window closer: reload once the postgres_changes attach is
    // confirmed — SUBSCRIBED below is only the join ack, and an event
    // committed before the attach is dropped. See postgresAttached.ts.
    onPostgresAttached(channel, () => loadGames())
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') loadGames()
    })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
    // `globalFeedbackSlot` is created once and keeps its identity across
    // renders (`useFeedbackSlot`), and `members` is fixed for the page's life
    // (`ClubPageLoader`), so listing them re-subscribes nothing.
  }, [clubHandle, members, globalFeedbackSlot])

  const currentGame = games.find((g) => g.isCurrent) ?? null

  return { games, currentGame, currentGameId, hasReadFailed }
}
