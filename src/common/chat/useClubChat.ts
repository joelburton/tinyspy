// cs-blessed-chat

import { useEffect, useState } from 'react'
import { supabase } from '../supabase/supabase'
import { channelDedupSuffix } from '../realtime/channelDedup'
import { onPostgresAttached } from '../realtime/postgresAttached'
import { db as commonDb } from '../supabase/db'
import { readRows } from '../supabase/dbResult'
import type { Database } from '@/types/db'

/**
 * A raw chat row keyed by club. The sender is a `user_id`; whoever shows it —
 * the transcript, the pill, the badge — resolves it from the club roster the
 * page already has.
 *
 * Narrower than Database[...]['Row'] — see code-conventions.md's "Avoid
 * SELECT *". Adding a new column to common.messages requires explicitly
 * listing it here AND in the select() below. `sent_at` is the unread
 * bookmark — `chatUnread` compares each message's `sent_at` against a
 * per-club last-seen timestamp.
 */
export type ClubMessage = Pick<
  Database['common']['Tables']['messages']['Row'],
  'id' | 'user_id' | 'content' | 'sent_at'
>

/**
 * How far back a fresh load reaches. A recency window rather than a row count,
 * so what is dropped is old rather than merely numerous, and the query stays
 * under PostgREST's `max_rows` cap without paging. Live INSERTs still append
 * past it; the window only bounds the backlog a fresh mount pulls in.
 */
const CHAT_HISTORY_WINDOW_DAYS = 7

/**
 * Merge a full-snapshot refetch into the current list without dropping messages
 * appended since the refetch's query ran.
 *
 * The SUBSCRIBED refetch SELECTs every message for the club (ordered). But a
 * message that arrived via INSERT *after* that query took its snapshot — yet
 * before it resolved — won't be in `snapshot`. Blindly `setMessages(snapshot)`
 * would DROP it: the rapid-message / reconnect race where two messages sent in
 * quick succession leave the unread count stuck at 1 (and a real message missing
 * from the panel). So keep any current rows the snapshot lacks. They were
 * inserted after the snapshot, so by construction they're the newest → append
 * them after it, preserving order. (Chat is append-only — no delete path — so a
 * row absent from a fresh snapshot is always "newer", never "deleted".)
 */
function mergeSnapshot(
  current: ClubMessage[],
  snapshot: ClubMessage[],
): ClubMessage[] {
  const snapshotIds = new Set(snapshot.map((m) => m.id))
  const appendedSinceSnapshot = current.filter((m) => !snapshotIds.has(m.id))
  return appendedSinceSnapshot.length === 0
    ? snapshot
    : [...snapshot, ...appendedSinceSnapshot]
}

/**
 * Subscribes to a club's chat log.
 *
 * The shape: an initial fetch, append-on-INSERT via Realtime, and a refetch on
 * every SUBSCRIBED event to recover from missed events during a reconnect. The
 * board hooks get that shape from `useRealtimeRefetch`; this one is wired by
 * hand because it appends each INSERT instead of refetching on it, which the
 * factory does not do — a refetch per message would re-pull the whole backlog
 * window for one new line. `channelDedup` says why the channel name carries a
 * suffix.
 */
export function useClubChat(clubHandle: string) {
  const [messages, setMessages] = useState<ClubMessage[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch + realtime-subscribe to this club's messages. INSERT
  // events append directly via setMessages; the SUBSCRIBED refetch
  // closes any reconnect gap. Re-runs only on clubHandle change.
  useEffect(function subscribeToClubMessages() {
    // No club, nothing to subscribe to. `loading` stays true rather than
    // clearing on nothing, so a reader gating on `!loading` (useChatFeedback)
    // never seeds an empty backlog.
    if (!clubHandle) return

    let mounted = true

    // Compute the recency cutoff ONCE per subscription, not per refetch:
    // every load() in this session shares this stable window. Recomputing it
    // inside load() would make day-old messages visibly evaporate as the
    // session aged past a boundary and a SUBSCRIBED refetch fired.
    const cutoff = new Date(
      Date.now() - CHAT_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()

    async function load() {
      const res = await readRows(
        commonDb
          .from('messages')
          .select('id, user_id, content, sent_at')
          .eq('club_handle', clubHandle)
          .gte('sent_at', cutoff)
          .order('sent_at', { ascending: true }),
      )
      if (!mounted) return
      // A failed load leaves the transcript alone — `readRows` has already said
      // so, and this re-runs on every reconnect, so what is on screen is the
      // best answer until the next one lands. `loading` still clears: the
      // "Loading…" line would otherwise stay up forever.
      if (res.type === 'not-ok') {
        setLoading(false)
        return
      }
      // Merge, don't replace: a refetch must not clobber messages appended via
      // INSERT while its query was in flight (see mergeSnapshot).
      setMessages((prev) => mergeSnapshot(prev, res.data))
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`club-chat:${clubHandle}:${channelDedupSuffix()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'common',
          table: 'messages',
          filter: `club_handle=eq.${clubHandle}`,
        },
        (payload) => {
          const row = payload.new as ClubMessage
          // Append the live message — but guard against a duplicate if a refetch
          // already picked it up (the INSERT and a SUBSCRIBED load can overlap).
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row],
          )
        },
      )
    // Deaf-window closer: reload once the postgres_changes attach is
    // confirmed — an INSERT committed between SUBSCRIBED (the join ack) and
    // the attach is dropped, and mergeSnapshot makes the extra load safe.
    // See postgresAttached.ts.
    onPostgresAttached(channel, () => load())
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') load()
    })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [clubHandle])

  return { messages, loading }
}
