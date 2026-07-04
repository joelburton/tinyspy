import { useEffect, useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import { db } from '../db'
import type { Member } from '../../common/lib/games'

/**
 * One player in a spellingbee game. Today spellingbee doesn't add
 * per-player state beyond what's on a Member (no fixed seats —
 * any club member who joined can submit) so the Player type is
 * a straight re-export.
 *
 * Per the cross-game vocabulary convention (see naming.md →
 * player), every game's hook file exposes a Player type so a
 * reader scanning per-game folders finds the same parallel
 * everywhere.
 */
export type Player = Member

/** One entry of a shipped word list — required or bonus. Both carry points + the
 *  pangram flag so the FE validates + scores a guess locally. */
export type SpellingbeeWord = { word: string; points: number; is_pangram: boolean }

/**
 * Shape exposed to the FE — projected from `spellingbee.games_state`. The header
 * is immutable for the life of the game (play state lives on common.games), so it
 * loads once. Both word lists ship from game start (no longer hidden) — the FE
 * validates + scores guesses against required ∪ bonus locally; the missed-words
 * reveal is a client-side `required − found` at terminal.
 */
export type SpellingbeeGame = {
  id: string
  club_handle: string
  /** Denormalized from `spellingbee.games.mode`. Drives FE branching
   *  for the OpponentStrip + win-vs-loss verdict copy in the PlayArea. */
  mode: 'coop' | 'compete'
  outer_letters: string
  center_letter: string
  /** Score of the required set — the rank-ladder denominator. */
  required_words_score: number
  /** Count of required words — the "X / Y words" goal (Y). */
  required_words_count: number
  created_at: string
  /** The required-words answer key (the displayed goal + the terminal reveal). */
  requiredWords: SpellingbeeWord[]
  /** The bonus set (legal − required): accepted + scored, never revealed. */
  bonusWords: SpellingbeeWord[]
}

export type FoundWordRow = {
  game_id: string
  user_id: string
  word: string
  points: number
  is_pangram: boolean
  is_bonus: boolean
  found_at: string
}

/**
 * spellingbee's per-gametype data hook. Two data lifecycles (like boggle):
 *   - **The header loads ONCE.** `spellingbee.games` is immutable during play —
 *     the letters + both word lists never change, and terminal lives on
 *     common.games — so a one-shot fetch, NOT a per-event refetch (the word lists
 *     would otherwise be re-downloaded on every teammate submission).
 *   - **found_words refetches on realtime events** (Pattern A): every submission
 *     flows through `spellingbee.submit_word`, which appends a `found_words` row
 *     that propagates to peers via postgres-changes.
 *
 * Reads the header from `spellingbee.games_state` (the view) — it exposes the
 * same columns as the base table plus the two word lists.
 */
export function useGame(gameId: string): {
  game: SpellingbeeGame | null
  foundWords: FoundWordRow[]
  loading: boolean
} {
  const [game, setGame] = useState<SpellingbeeGame | null>(null)
  const [foundWords, setFoundWords] = useState<FoundWordRow[]>([])
  const [loading, setLoading] = useState(true)

  // The immutable header (letters + both word lists) — fetched once per game.
  // `loading` gates the PlayArea render, so it flips here.
  useEffect(() => {
    let mounted = true
    void (async () => {
      const { data } = await db
        .from('games_state')
        .select(
          'id, club_handle, mode, outer_letters, center_letter, required_words_score, required_words_count, created_at, required_words, bonus_words',
        )
        .eq('id', gameId)
        .maybeSingle()
      if (!mounted) return
      if (data) {
        setGame({
          id: data.id as string,
          club_handle: data.club_handle as string,
          mode: data.mode as 'coop' | 'compete',
          outer_letters: data.outer_letters as string,
          center_letter: data.center_letter as string,
          required_words_score: data.required_words_score as number,
          required_words_count: data.required_words_count as number,
          created_at: data.created_at as string,
          requiredWords: (data.required_words as SpellingbeeWord[]) ?? [],
          bonusWords: (data.bonus_words as SpellingbeeWord[]) ?? [],
        })
      }
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [gameId])

  useRealtimeRefetch({
    tables: [{ schema: 'spellingbee', table: 'found_words', filter: `game_id=eq.${gameId}` }],
    channelPrefix: 'spellingbee',
    id: gameId,
    load: async ({ mounted }) => {
      const { data } = await db
        .from('found_words')
        .select('game_id, user_id, word, points, is_pangram, is_bonus, found_at')
        .eq('game_id', gameId)
        .order('found_at', { ascending: true })
      if (!mounted()) return
      setFoundWords((data ?? []) as FoundWordRow[])
    },
  })

  return { game, foundWords, loading }
}
