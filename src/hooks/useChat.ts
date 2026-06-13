import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/db'

/** A raw chat row. Display names are resolved by the consumer
 * (ChatPanel), which has the player roster from useGame. */
export type ChatMessage = Database['public']['Tables']['messages']['Row']

/**
 * Subscribes to a game's chat log.
 *
 * Returns the full chronological message list plus a `loading` flag.
 *
 * Sync strategy: one full fetch on mount, then append-on-INSERT from
 * the realtime payload — we do NOT refetch the whole table on each
 * new message. The realtime broadcast carries the inserted row as
 * `payload.new`, which we hand straight to setState. Cheap, and
 * stays correct because the only mutation on this table is INSERT
 * (no UPDATE/DELETE paths through send_message).
 *
 * Display names are NOT fetched here. Each message row has a
 * `user_id`, and the consumer (ChatPanel) looks the name up from
 * the `players` array it already has via useGame. This avoids the
 * "embed shape varies between initial-fetch and realtime-append"
 * problem — realtime payloads are raw table rows, not embeds.
 *
 * See useGame for the channel-name suffix rationale.
 */
export function useChat(gameId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('game_id', gameId)
        .order('sent_at', { ascending: true })
      if (!mounted) return
      if (data) setMessages(data)
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`chat:${gameId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `game_id=eq.${gameId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage])
        },
      )
      // Refetch on every SUBSCRIBED. Recovers any messages we missed during
      // a reconnect, by overwriting the appended state with the canonical
      // server view. See useGame for the pattern.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load()
      })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [gameId])

  return { messages, loading }
}
