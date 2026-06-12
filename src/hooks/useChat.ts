import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/db'

/**
 * A chat row joined to the sender's display_name from profiles.
 * The embed shape is what PostgREST returns from `select('*, profiles(display_name)')`.
 */
export type ChatMessage = Database['public']['Tables']['messages']['Row'] & {
  profiles: { display_name: string } | null
}

/**
 * Subscribes to a game's chat log.
 *
 * Returns the full chronological message list plus a `loading` flag.
 * Like the other hooks, any INSERT into the chat table triggers a full
 * refetch — fine for the volume we'll see in a 2-player game.
 *
 * The display name is fetched via PostgREST's embedded resource syntax
 * (`profiles(display_name)`) using the FK on messages.user_id → profiles.
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
        .select('*, profiles(display_name)')
        .eq('game_id', gameId)
        .order('sent_at', { ascending: true })
      if (!mounted) return
      if (data) setMessages(data as ChatMessage[])
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`chat:${gameId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `game_id=eq.${gameId}` },
        load,
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [gameId])

  return { messages, loading }
}
