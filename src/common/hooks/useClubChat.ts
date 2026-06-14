import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { db as commonDb } from '../db'
import type { Database } from '../../types/db'

/** A raw chat row keyed by club. Display names are resolved by the
 *  consumer (ClubChatPanel) from the member roster it already has. */
export type ClubMessage = Database['common']['Tables']['messages']['Row']

/**
 * Subscribes to a club's chat log.
 *
 * The shape: an initial fetch, append-on-INSERT via Realtime, and
 * a refetch on every SUBSCRIBED event to recover from missed
 * events during a reconnect. Same pattern as the rest of the
 * Realtime hooks in this repo (see useGame for the rationale on
 * the unique channel-name suffix that makes StrictMode safe).
 */
export function useClubChat(clubId: string) {
  const [messages, setMessages] = useState<ClubMessage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      const { data } = await commonDb
        .from('messages')
        .select('*')
        .eq('club_id', clubId)
        .order('sent_at', { ascending: true })
      if (!mounted) return
      if (data) setMessages(data)
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`club-chat:${clubId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'common',
          table: 'messages',
          filter: `club_id=eq.${clubId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ClubMessage])
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load()
      })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [clubId])

  return { messages, loading }
}
