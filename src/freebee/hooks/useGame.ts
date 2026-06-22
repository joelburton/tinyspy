import { useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/useRealtimeRefetch'
import { db } from '../db'
import type { Member } from '../../common/lib/games'

/**
 * One player in a freebee game. Today freebee doesn't add
 * per-player state beyond what's on a Member (no fixed seats —
 * any club member who joined can submit) so the Player type is
 * a straight re-export.
 *
 * Per the cross-game vocabulary convention (see naming.md →
 * player), every game's hook file exposes a Player type so a
 * reader scanning per-game folders finds the same parallel
 * everywhere. Future per-player state (e.g. a leaderboard
 * entry for compete mode) has a named home to land in.
 */
export type Player = Member

/**
 * Shape exposed to the FE — projected from `freebee.games_state`.
 *
 * Most fields come straight off the view's columns; `requiredWords`
 * materializes **only on game-terminal**: null while the game is in
 * progress, then the full required-words list once `is_terminal`
 * flips (the end-of-game reveal). The bonus set is never exposed —
 * unfound bonus words aren't shown — so there's no `bonusWords`
 * field here.
 *
 * The view's `_required_words_for` helper enforces that gate
 * server-side; the FE just reads the column and treats null as
 * "still hidden". See the migration's "hidden wordlists" section
 * for the wider rationale.
 */
export type FreeBeeGame = {
  id: string
  club_handle: string
  /** Denormalized from `freebee.games.mode`. Drives FE branching
   *  for the OpponentStrip + win-vs-loss verdict copy in the
   *  PlayArea. Set at create_game time, immutable afterward. */
  mode: 'coop' | 'compete'
  outer_letters: string
  center_letter: string
  /** Score of the required set — the rank-ladder denominator. */
  required_words_score: number
  /** Count of required words — the "X / Y words" goal (Y). */
  required_words_count: number
  created_at: string
  /** The required-words answer key. Null during play, materialized
   *  on terminal (the reveal). */
  requiredWords:
    | Array<{ word: string; points: number; is_pangram: boolean }>
    | null
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
 * freebee's per-gametype data hook.
 *
 * Follows the **refetch-only** realtime pattern (Pattern A, see
 * `docs/code-conventions.md` → "Realtime data hooks"). No
 * broadcast traffic — every submission flows through
 * `freebee.submit_word`, which writes a `found_words` row that
 * propagates to every peer via the standard postgres-changes
 * subscription. Same shape psychicnum uses.
 *
 * Two-table subscription on `freebee.{games, found_words}`:
 *   - `games`: any change refetches game_state (which carries
 *     the wordlist-reveal gate). We subscribe to the BASE
 *     table because Realtime watches tables, not views.
 *   - `found_words`: every accepted submission appends a row.
 *
 * The `load()` body reads from `freebee.games_state` (the view),
 * never from `freebee.games` directly — the base table's
 * column-grant blocks `required_words` for authenticated, and the
 * view is what surfaces it conditionally on terminal.
 */
export function useGame(gameId: string): {
  game: FreeBeeGame | null
  foundWords: FoundWordRow[]
  loading: boolean
} {
  const [game, setGame] = useState<FreeBeeGame | null>(null)
  const [foundWords, setFoundWords] = useState<FoundWordRow[]>([])
  const [loading, setLoading] = useState(true)

  useRealtimeRefetch({
    tables: [
      { schema: 'freebee', table: 'games', filter: `id=eq.${gameId}` },
      {
        schema: 'freebee',
        table: 'found_words',
        filter: `game_id=eq.${gameId}`,
      },
    ],
    channelPrefix: 'freebee',
    id: gameId,
    load: async ({ mounted }) => {
      // Two reads: the game header from the view, the found-words
      // log from the table. Parallel via Promise.all since they
      // don't depend on each other.
      const [gameRes, foundRes] = await Promise.all([
        db
          .from('games_state')
          .select(
            'id, club_handle, mode, outer_letters, center_letter, required_words_score, required_words_count, created_at, required_words',
          )
          .eq('id', gameId)
          .maybeSingle(),
        db
          .from('found_words')
          .select(
            'game_id, user_id, word, points, is_pangram, is_bonus, found_at',
          )
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

      setGame({
        id: gameRes.data.id as string,
        club_handle: gameRes.data.club_handle as string,
        mode: gameRes.data.mode as 'coop' | 'compete',
        outer_letters: gameRes.data.outer_letters as string,
        center_letter: gameRes.data.center_letter as string,
        required_words_score: gameRes.data.required_words_score as number,
        required_words_count: gameRes.data.required_words_count as number,
        created_at: gameRes.data.created_at as string,
        requiredWords:
          (gameRes.data.required_words as FreeBeeGame['requiredWords']) ?? null,
      })
      setFoundWords((foundRes.data ?? []) as FoundWordRow[])
      setLoading(false)
    },
  })

  return { game, foundWords, loading }
}
