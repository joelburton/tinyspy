import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../../types/db'

/**
 * Schemas this hook can talk to. Today only tinyspy has a `messages`
 * table; once clubs land and chat moves to `common.messages` keyed off
 * `club_id`, this type goes away and the hook hard-codes `common`.
 * Adding more pre-clubs games with chat would mean expanding this
 * union (and matching common's ChatPanel).
 */
export type ChatSchema = 'tinyspy'

/** A raw chat row. Display names are resolved by the consumer
 * (ChatPanel), which has the player roster from the game. */
export type ChatMessage = Database['tinyspy']['Tables']['messages']['Row']

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
export function useChat(gameSchema: ChatSchema, gameId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data } = await supabase
        .schema(gameSchema)
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
        { event: 'INSERT', schema: gameSchema, table: 'messages', filter: `game_id=eq.${gameId}` },
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
  }, [gameSchema, gameId])

  return { messages, loading }
}
