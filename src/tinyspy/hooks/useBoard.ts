import { useEffect, useState } from 'react'
import { supabase } from '../../common/lib/supabase'
import { db } from '../db'
import type { Database } from '../../types/db'
import type { KeyLabel } from '../lib/labels'

type WordRow = Database['tinyspy']['Tables']['words']['Row']

/**
 * Subscribes to a game's board state for the current player.
 *
 * Returns the 25 word rows, the caller's own key view (`myKey`), and
 * optionally the partner's key view (`peerKey`) for post-game review.
 *
 * Why this hook is separate from `useGame`:
 *   - The board only needs words + the caller's key, not the whole roster.
 *   - The peer key is sensitive during play (it would leak the partner's
 *     view) and is only fetched when `revealPeer` is true. Even though the
 *     RLS policy on `game_players` would technically allow reading the
 *     partner's row during play (see CODE_REVIEW.md item 13), we don't
 *     ask for it until the game ends.
 *
 * Realtime: subscribes to `words` UPDATE/INSERT events for this game. On
 * any event, the whole load() runs again — wasteful for a chatty table
 * but trivial at 25 rows and a few events per turn. Same trade-off as the
 * other useGame/useClues hooks.
 *
 * Channel-name suffix: see useGame for the reason we append a UUID.
 */
export function useBoard(gameId: string, userId: string, revealPeer: boolean) {
  const [words, setWords] = useState<WordRow[]>([])
  const [myKey, setMyKey] = useState<KeyLabel[] | null>(null)
  const [peerKey, setPeerKey] = useState<KeyLabel[] | null>(null)
  const [loading, setLoading] = useState(true)

  // Words + own key. Re-runs only on game/user change (not when revealPeer
  // flips), so the realtime channel stays attached across game-over transitions.
  useEffect(() => {
    let mounted = true

    async function load() {
      const [wordsRes, keyRes] = await Promise.all([
        db.from('words').select('*').eq('game_id', gameId).order('position'),
        db
          .from('game_players')
          .select('key_card')
          .eq('game_id', gameId)
          .eq('user_id', userId)
          .single(),
      ])
      if (!mounted) return
      if (wordsRes.data) setWords(wordsRes.data)
      // key_card is `jsonb` in the schema and typed as `Json | null` here;
      // start_game guarantees it's a length-25 array of KeyLabels by the time
      // we're rendering the board.
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
        { event: '*', schema: 'tinyspy', table: 'words', filter: `game_id=eq.${gameId}` },
        load,
      )
      // Refetch on every SUBSCRIBED — recovers from any missed reveals
      // during a reconnect. See useGame for the pattern.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load()
      })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [gameId, userId])

  // Peer key for post-game review. Fetched lazily — only loaded once the
  // game is in a terminal state and the board switches to the "show both
  // keys" rendering. When `revealPeer` flips back off (e.g. a new game),
  // the peer key is dropped so it can't leak into a future render.
  useEffect(() => {
    if (!revealPeer) {
      setPeerKey(null)
      return
    }
    let mounted = true
    db
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
