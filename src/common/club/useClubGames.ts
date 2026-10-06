// cs-blessed-club-page

import { useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { db as commonDb } from '../supabase/db'
import { readRows } from '../supabase/dbResult'
import { supabase } from '../supabase/supabase'
import { channelLeaving, releaseChannel } from '../realtime/channelTeardown'
import { manifestFor } from '@/gametypes'
import { reportUnknownGametypes } from '../manifest/unknownGametype'
import type { GameManifest } from '../manifest/gameManifest'
import type { SummaryData } from '../manifest/summaryData'
import { FeedbackMessage } from '../feedback/FeedbackMessage'
import type { FeedbackSlot } from '../feedback/useFeedbackSlot'
import type { Member } from '../members/member'

/**
 * Display shape for one game in the club's games list: what this page shows
 * of the game's `summary_data`, plus the manifest of the gametype it belongs
 * to.
 *
 * Anything about the GAMETYPE is reached through `manifest` rather than copied
 * flat — the filter's family and brand, the row's mode and logo. `summary`
 * is the exception because it isn't a field at all: it's `summaryFor(data,
 * members)`, a call that needs the game as well as the gametype.
 */
export type ListedGame = {
  gameId: string
  // The gametype's manifest, resolved once when the row is built — a gametype
  // this FE doesn't know never becomes a `ListedGame`, so everything downstream
  // takes it as given instead of looking it up again.
  manifest: GameManifest
  title: string
  // When the game's status last changed: a create, a Restart, a move or the
  // end. The card dates by it and the list orders by it, so a long-suspended
  // game reads by when it was last played rather than when it began.
  statusChangedAt: string
  isTerminal: boolean
  // The club's current game: its `common.games.is_current_view`.
  isCurrent: boolean
  summary: string
}

/** One `common.games` row as the listing selects it — the select string in
 *  `useClubGames` names these columns. Everything shown is in the blob; the
 *  pointer is read beside it because common flips it without the game's
 *  builder, and the id is the row's key. */
type ClubGamesRow = {
  id: string
  is_current_view: boolean
  summary_data: unknown
}

/**
 * One listing row's display entry, or null for a row the list cannot show: a
 * gametype this bundle doesn't know (the caller reports those), or a game
 * whose builder does not write `summary_data` yet (plans/seat-view.md → The
 * page is written, not assembled). `members` is the club's, for the summary
 * to name a user id with.
 */
function makeListedGame(r: ClubGamesRow, members: readonly Member[]): ListedGame | null {
  if (r.summary_data === null) return null
  const data = r.summary_data as SummaryData
  const manifest = manifestFor(data.gametype)
  if (!manifest) return null
  return {
    gameId: data.id,
    manifest,
    title: data.title,
    statusChangedAt: data.statusChangedAt,
    isTerminal: data.ended,
    isCurrent: r.is_current_view,
    summary: manifest.summaryFor(data, members),
  }
}

/**
 * A club's games, kept fresh: one read of `common.games`, and another on
 * every `changed` Broadcast `common._nudge_club_page` sends the club's room.
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
 * where that delete was the nudge, so no second one is coming.
 *
 * Takes the club's handle, its members — which each row's `summaryFor` names a
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

  // Load games for this club + the current-view game id: on mount, on every
  // join of the club's room, and on every `changed` nudge — a new game, a move
  // or an ending, a set_current_view / unset_current_view pointer flip, a
  // delete.
  useEffect(function joinClubGamesRoom() {
    let mounted = true
    // Monotonic generation for out-of-order protection: loadGames fires on
    // mount + on-SUBSCRIBED + every nudge, and these overlapping loads can
    // resolve out of order. Commit only the newest, so a slow initial load
    // can't clobber a fresher nudge-load's listing. Same fix as
    // useRealtimeRefetch / useCommonGame.
    let generation = 0

    async function loadGames() {
      const myGen = ++generation
      // One read into common.games: everything a summary needs is in the
      // game's `summary_data`, so each row's summary is the matching
      // manifest's pure `summaryFor`. A gametype this bundle's registry
      // doesn't have is skipped and then REPORTED — see
      // `reportUnknownGametypes`; it means this tab predates a deploy, and the
      // list it draws is quietly short until the player reloads.
      const res = await readRows(
        commonDb
          .from('games')
          .select('id, is_current_view, summary_data')
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
      // is the refetch that follows your OWN delete — where that delete was the
      // nudge, so no second one is coming and the game sits in the list looking
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
        .filter((r) => r.summary_data !== null)
        .map((r) => (r.summary_data as SummaryData).gametype)
        .filter((gametype) => !manifestFor(gametype))
      setCurrentGameId(currentId)
      setGames(listed)
      reportUnknownGametypes(unknownGametypes)
    }

    // The club's room, which hears its games change. It navigates NOBODY. Being
    // added to a game pops a join invitation globally (`useGameInvitations`,
    // mounted in App.tsx), so a player joins on their own terms wherever they
    // are; a member here just sees the new game appear and gets the invite. The
    // game waits, paused, until they join.
    //
    // The name is the topic the trigger sends to, so it takes no suffix, and a
    // quick remount waits out the previous mount's leave (channelTeardown.ts).
    const room = `club-games:${clubHandle}`
    let canceled = false
    let ch: RealtimeChannel | null = null

    function joinRoom() {
      // The effect may have torn down while the join waited.
      if (canceled) return
      ch = supabase
        .channel(room)
        .on('broadcast', { event: 'changed' }, () => loadGames())
        // On every join, reconnects included: a nudge sent while the socket was
        // down is not replayed.
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') loadGames()
        })
    }

    const pending = channelLeaving(room)
    if (pending) void pending.then(joinRoom)
    else joinRoom()

    loadGames()

    return () => {
      mounted = false
      canceled = true
      if (ch) void releaseChannel(ch)
    }
    // `globalFeedbackSlot` is created once and keeps its identity across
    // renders (`useFeedbackSlot`), and `members` is fixed for the page's life
    // (`ClubPageLoader`), so listing them rejoins nothing.
  }, [clubHandle, members, globalFeedbackSlot])

  const currentGame = games.find((g) => g.isCurrent) ?? null

  return { games, currentGame, currentGameId, hasReadFailed }
}
