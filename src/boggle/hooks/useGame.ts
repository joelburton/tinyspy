import { useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/useRealtimeRefetch'
import { db } from '../db'
import type { Member } from '../../common/lib/games'

/** One player in a boggle game. No per-player state beyond a Member today. */
export type Player = Member

/** A required word the board was built around (readable by the FE — boggle has
 *  no hidden-solution view; the FE uses this to classify guesses + render the
 *  missed-words reveal). */
export type RequiredWord = { word: string; points: number }

/** The boggle game header, read straight off `boggle.games`. */
export type BoggleGame = {
  id: string
  club_handle: string
  mode: 'coop' | 'compete'
  /** row-major raw-face board string (A–Z, multiface digit, 0 = blank) */
  board: string
  /** board side length (n × n) */
  n: number
  min_word_length: number
  required_words: RequiredWord[]
  required_words_count: number
  required_words_score: number
}

export type FoundWordRow = {
  game_id: string
  user_id: string
  word: string
  points: number
  is_bonus: boolean
  found_at: string
}

/**
 * boggle's per-gametype data hook. Refetch-only realtime (Pattern A): every
 * submission flows through `boggle.submit_word`, which writes a `found_words`
 * row that propagates to peers via postgres-changes. Two-table subscription on
 * `boggle.{games, found_words}`.
 */
export function useGame(gameId: string): {
  game: BoggleGame | null
  foundWords: FoundWordRow[]
  loading: boolean
} {
  const [game, setGame] = useState<BoggleGame | null>(null)
  const [foundWords, setFoundWords] = useState<FoundWordRow[]>([])
  const [loading, setLoading] = useState(true)

  useRealtimeRefetch({
    tables: [
      { schema: 'boggle', table: 'games', filter: `id=eq.${gameId}` },
      { schema: 'boggle', table: 'found_words', filter: `game_id=eq.${gameId}` },
    ],
    channelPrefix: 'boggle',
    id: gameId,
    load: async ({ mounted }) => {
      const [gameRes, foundRes] = await Promise.all([
        db
          .from('games')
          .select(
            'id, club_handle, mode, board, n, min_word_length, required_words, required_words_count, required_words_score',
          )
          .eq('id', gameId)
          .maybeSingle(),
        db
          .from('found_words')
          .select('game_id, user_id, word, points, is_bonus, found_at')
          .eq('game_id', gameId)
          .order('found_at', { ascending: true }),
      ])
      if (!mounted()) return

      if (!gameRes.data) {
        setGame(null)
        setFoundWords([])
        setLoading(false)
        return
      }

      const g = gameRes.data
      setGame({
        id: g.id as string,
        club_handle: g.club_handle as string,
        mode: g.mode as 'coop' | 'compete',
        board: g.board as string,
        n: g.n as number,
        min_word_length: g.min_word_length as number,
        required_words: (g.required_words as RequiredWord[]) ?? [],
        required_words_count: g.required_words_count as number,
        required_words_score: g.required_words_score as number,
      })
      setFoundWords((foundRes.data ?? []) as FoundWordRow[])
      setLoading(false)
    },
  })

  return { game, foundWords, loading }
}
