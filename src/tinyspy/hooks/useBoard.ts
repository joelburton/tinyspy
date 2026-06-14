import { useEffect, useState } from 'react'
import { supabase } from '../../common/lib/supabase'
import { db } from '../db'
import type { Database } from '../../types/db'
import type { KeyLabel } from '../lib/labels'

// Narrower than Database[...]['Row'] — see code-conventions.md's "Avoid
// SELECT *". Adding a new column to tinyspy.words requires
// explicitly listing it here AND in the select() below.
// Exported so GameLog can share the same narrowed shape rather
// than redeclaring its own (now-broader) version.
export type WordRow = Pick<
  Database['tinyspy']['Tables']['words']['Row'],
  'position' | 'word' | 'revealed_by' | 'revealed_as' | 'revealed_at' | 'revealed_in_turn'
>

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
 *     partner's row during play (the "Harden `game_players_select`" item
 *     in `docs/deferred.md`), we don't ask for it until the game ends.
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
  // The peer key is fetched into `fetchedPeerKey` and tagged with the
  // gameId+userId it was fetched for. The publicly-returned `peerKey`
  // (derived below) is null unless the caller currently wants the peer
  // key AND the cached fetch matches the active game/user — this
  // avoids the "setState in effect body" anti-pattern that arose when
  // the hook synchronously cleared peerKey on revealPeer flipping off.
  const [fetchedPeerKey, setFetchedPeerKey] = useState<KeyLabel[] | null>(null)
  const [fetchedFor, setFetchedFor] = useState<string | null>(null)
  const peerKey =
    revealPeer && fetchedFor === `${gameId}:${userId}` ? fetchedPeerKey : null
  const [loading, setLoading] = useState(true)

  // Words + own key. Re-runs only on game/user change (not when revealPeer
  // flips), so the realtime channel stays attached across game-over transitions.
  useEffect(() => {
    let mounted = true

    async function load() {
      const [wordsRes, keyRes] = await Promise.all([
        db
          .from('words')
          .select('position, word, revealed_by, revealed_as, revealed_at, revealed_in_turn')
          .eq('game_id', gameId)
          .order('position'),
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

  // Peer key for post-game review. Fetched lazily — only loaded once
  // the game is in a terminal state and the board switches to the
  // "show both keys" rendering. The hook-returned `peerKey` is null
  // when revealPeer is false (derivation above), so we don't need an
  // explicit clear path here; we just skip the fetch.
  useEffect(() => {
    if (!revealPeer) return
    let mounted = true
    db
      .from('game_players')
      .select('key_card')
      .eq('game_id', gameId)
      .neq('user_id', userId)
      .single()
      .then(({ data }) => {
        if (!mounted) return
        if (data?.key_card) {
          setFetchedPeerKey(data.key_card as unknown as KeyLabel[])
          setFetchedFor(`${gameId}:${userId}`)
        }
      })
    return () => {
      mounted = false
    }
  }, [gameId, userId, revealPeer])

  return { words, myKey, peerKey, loading }
}
