import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase/supabase'
import { channelDedupSuffix } from '../../lib/supabase/channelDedup'
import { db as commonDb } from '../../db'
import type { Database } from '../../../types/db'

/**
 * A raw chat row keyed by club. Display names are resolved by the
 * consumer (ClubChatPanel) from the member roster it already has.
 *
 * Narrower than Database[...]['Row'] — see code-conventions.md's "Avoid
 * SELECT *". Adding a new column to common.messages requires
 * explicitly listing it here AND in the select() below. `sent_at`
 * is included as the unread bookmark — the chat-unread badge compares
 * each message's `sent_at` against a per-club last-seen timestamp
 * (see lib/chatUnread).
 */
export type ClubMessage = Pick<
  Database['common']['Tables']['messages']['Row'],
  'id' | 'user_id' | 'content' | 'sent_at'
>

/**
 * How far back a fresh load reaches. Club chat is read as "what's been said
 * recently," not "the complete archive," so we bound the initial fetch by a
 * recency WINDOW rather than a row count — a row limit is an implementation
 * detail that would leak into the UX (drop the 501st message but keep a
 * years-old one). This also keeps the query safely under PostgREST's
 * `max_rows` cap without a paging loop: even a chatty club won't send 10k
 * messages in a week. Live INSERTs still append during the session, so the
 * panel keeps growing past the window as new messages arrive; the window only
 * bounds the backlog a fresh mount pulls in. The composite index
 * `messages (club_handle, sent_at)` already serves the filter.
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
 * The shape: an initial fetch, append-on-INSERT via Realtime, and
 * a refetch on every SUBSCRIBED event to recover from missed
 * events during a reconnect. Same pattern as the rest of the
 * Realtime hooks in this repo (see useGame for the rationale on
 * the unique channel-name suffix that makes StrictMode safe).
 */
export function useClubChat(clubHandle: string) {
  const [messages, setMessages] = useState<ClubMessage[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch + realtime-subscribe to this club's messages. INSERT
  // events append directly via setMessages; the SUBSCRIBED refetch
  // closes any reconnect gap. Re-runs only on clubHandle change.
  useEffect(function subscribeToClubMessages() {
    // No club yet — e.g. the GamePage feedback bridge runs this before the game
    // row (and its `club_handle`) has loaded. Skip the fetch + subscribe and
    // LEAVE `loading` true, so a consumer gating on `!loading` (useChatFeedback)
    // doesn't seed an empty backlog and then replay the real one when it arrives.
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
      const { data } = await commonDb
        .from('messages')
        .select('id, user_id, content, sent_at')
        .eq('club_handle', clubHandle)
        .gte('sent_at', cutoff)
        .order('sent_at', { ascending: true })
      if (!mounted) return
      // Merge, don't replace: a refetch must not clobber messages appended via
      // INSERT while its query was in flight (see mergeSnapshot).
      if (data) setMessages((prev) => mergeSnapshot(prev, data))
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load()
      })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [clubHandle])

  return { messages, loading }
}
