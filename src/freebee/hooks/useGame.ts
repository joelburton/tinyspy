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
 * Most fields come straight off the view's columns; the two
 * jsonb-array ones materialize **only on game-terminal**:
 *
 *   - `scoringWords` is null while the game is in progress and
 *     becomes the full scoring list once `is_terminal` flips.
 *   - `legalWords` is null while in progress and becomes the
 *     bonus-only list once terminal.
 *
 * The view's `_reveal_if_terminal` helpers enforce that gate
 * server-side; the FE just reads the column and treats null as
 * "still hidden". See the phase-1 migration's "hidden wordlists"
 * section for the wider rationale.
 */
export type FreeBeeGame = {
  id: string
  club_handle: string
  outer_letters: string
  center_letter: string
  total_score: number
  total_words: number
  created_at: string
  /** Null during play, materialized on terminal. */
  scoringWords:
    | Array<{ word: string; points: number; is_pangram: boolean }>
    | null
  /** Null during play, materialized on terminal. */
  legalWords: string[] | null
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
 * column-grant blocks `scoring_words` / `legal_words` for
 * authenticated, and the view is what surfaces them
 * conditionally on terminal.
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
            'id, club_handle, outer_letters, center_letter, total_score, total_words, created_at, scoring_words, legal_words',
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
        outer_letters: gameRes.data.outer_letters as string,
        center_letter: gameRes.data.center_letter as string,
        total_score: gameRes.data.total_score as number,
        total_words: gameRes.data.total_words as number,
        created_at: gameRes.data.created_at as string,
        scoringWords:
          (gameRes.data.scoring_words as FreeBeeGame['scoringWords']) ?? null,
        legalWords:
          (gameRes.data.legal_words as FreeBeeGame['legalWords']) ?? null,
      })
      setFoundWords((foundRes.data ?? []) as FoundWordRow[])
      setLoading(false)
    },
  })

  return { game, foundWords, loading }
}
