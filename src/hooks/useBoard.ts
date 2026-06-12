import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/db'

type WordRow = Database['public']['Tables']['words']['Row']
export type KeyLabel = 'G' | 'N' | 'A'

export function useBoard(gameId: string, userId: string, revealPeer: boolean) {
  const [words, setWords] = useState<WordRow[]>([])
  const [myKey, setMyKey] = useState<KeyLabel[] | null>(null)
  const [peerKey, setPeerKey] = useState<KeyLabel[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function load() {
      const [wordsRes, keyRes] = await Promise.all([
        supabase
          .from('words')
          .select('*')
          .eq('game_id', gameId)
          .order('position'),
        supabase
          .from('game_players')
          .select('key_card')
          .eq('game_id', gameId)
          .eq('user_id', userId)
          .single(),
      ])
      if (!mounted) return
      if (wordsRes.data) setWords(wordsRes.data)
      if (keyRes.data?.key_card) {
        setMyKey(keyRes.data.key_card as unknown as KeyLabel[])
      }
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`board:${gameId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'words', filter: `game_id=eq.${gameId}` },
        load,
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [gameId, userId])

  // Fetch the peer's key only when game is over (for post-game review).
  useEffect(() => {
    if (!revealPeer) {
      setPeerKey(null)
      return
    }
    let mounted = true
    supabase
      .from('game_players')
      .select('key_card')
      .eq('game_id', gameId)
      .neq('user_id', userId)
      .single()
      .then(({ data }) => {
        if (!mounted) return
        if (data?.key_card) setPeerKey(data.key_card as unknown as KeyLabel[])
      })
    return () => {
      mounted = false
    }
  }, [gameId, userId, revealPeer])

  return { words, myKey, peerKey, loading }
}
