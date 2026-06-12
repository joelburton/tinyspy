import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/db'

type WordRow = Database['public']['Tables']['words']['Row']
export type KeyLabel = 'G' | 'N' | 'A'

export function useBoard(gameId: string, userId: string) {
  const [words, setWords] = useState<WordRow[]>([])
  const [myKey, setMyKey] = useState<KeyLabel[] | null>(null)
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

  return { words, myKey, loading }
}
