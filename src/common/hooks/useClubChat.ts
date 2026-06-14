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
 * The club-keyed counterpart of `useChat` (the per-game chat hook
 * that's currently still wired up inside Tinyspy). Both follow the
 * same shape: an initial fetch, append-on-INSERT via Realtime, and
 * a refetch on every SUBSCRIBED event to recover from missed events
 * during a reconnect.
 *
 * When commit 5 swaps Tinyspy's chat over to common.messages, the
 * old `useChat` hook is deleted and this becomes the only chat hook.
 * For now both coexist briefly — `useChat` writes to tinyspy.messages
 * inside a game; `useClubChat` writes to common.messages inside a
 * club. Different tables, different consumers, no overlap.
 *
 * Channel-name suffix follows the same StrictMode-safety pattern as
 * the other Realtime hooks in this repo — see useGame for the
 * rationale.
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
