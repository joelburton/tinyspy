import { useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import { db } from '../db'
import type { Member } from '../../common/lib/games'

/**
 * One player in a psychicnum game. Today psychicnum doesn't
 * add per-player state beyond what's on a Member, so the Player
 * type is a straight re-export — but every per-game folder
 * exposes a Player type so the cross-game vocabulary is
 * consistent (a reader scanning psychicnum code finds the same
 * Player parallel that exists in codenamesduet + connections).
 */
export type Player = Member

/**
 * The FE-ready game state. Sourced from the
 * `psychicnum.games_state` view, which surfaces this game's
 * directly-readable columns plus the conditional `target`
 * reveal:
 *
 *   - While the game is non-terminal, the view returns
 *     `target = null`.
 *   - Once `common.games.is_terminal` flips true, the view
 *     returns the real value.
 *
 * `mode` is the gametype-level coop/compete declaration,
 * stored as a column on psychicnum.games so the FE can branch
 * without parsing the gametype string. Always present from
 * insert; never changes mid-game.
 *
 * `play_state` itself isn't on this row — it lives on
 * common.games and arrives via GamePageCtx.
 */
export type PsychicnumGame = {
  id: string
  club_handle: string
  mode: 'coop' | 'compete'
  /** The board: the 5..20 words shown as tiles (PUBLIC). Players click these
   *  to guess; three of them are the secrets. Lowercase. */
  words: string[]
  /** The three secret words (a subset of `words`). Null while non-terminal
   *  (gated by the view's helper); the real array once terminal (the reveal). */
  secrets: string[] | null
  created_at: string
}

/**
 * One row from `psychicnum.players` — per-player guess budget.
 *
 * In coop: every player row carries the same value (decremented
 * in lock-step). In compete: each row decrements independently
 * when its owner submits.
 *
 * Always visible to the whole club regardless of mode — the
 * "opponents see my remaining budget but not my guesses" rule
 * is enforced by giving this table club-wide RLS while
 * `psychicnum.guesses` gets user-scoped RLS in compete mode.
 */
export type PlayerRow = {
  user_id: string
  guesses_remaining: number
  /** How many distinct secrets this player has found (0..3). Public to the
   *  club; drives the compete opponent-progress feedback. */
  secrets_found: number
}

/**
 * One row from `psychicnum.guesses`. In coop the FE receives
 * every player's guess; in compete the RLS policy filters
 * server-side so the FE only ever receives its own user_id's
 * rows. PlayArea renders them the same way either way; the
 * filtering is invisible to the FE.
 */
export type GuessRow = {
  id: string
  user_id: string
  /** The text this row carries. For 'guess'/'reveal' it's a board word
   *  (lowercase); for 'hint' it's the CLUE text (or "No hint available"). */
  word: string
  was_correct: boolean
  /** 'guess' = a real guess (colors the board, counts toward the win);
   *  'reveal' = a revealed secret word (the answer), amber in the turn log;
   *  'hint' = a clue for a secret, amber in the turn log. */
  kind: 'guess' | 'hint' | 'reveal'
  guessed_at: string
}

/**
 * Per-gametype data hook for psychicnum (both modes share it).
 *
 * Reads three tables:
 *   - `games_state` view (game row + conditional `target` reveal)
 *   - `players` (per-player budgets, club-wide visible)
 *   - `guesses` (history log; RLS scopes to caller in compete)
 *
 * Subscribes to all three for realtime refetch via
 * `useRealtimeRefetch`. The factory provides SUBSCRIBED-refetch
 * + UUID-suffixed channel + cleanup; this hook owns the per-game
 * `load()` body.
 *
 * The cross-cutting machinery (members, presence, manual-pause,
 * timer) lives on `useCommonGame` inside `GamePage` — see
 * `src/common/hooks/game/useCommonGame.ts`.
 */
export function useGame(gameId: string): {
  game: PsychicnumGame | null
  players: PlayerRow[]
  guesses: GuessRow[]
  loading: boolean
} {
  const [game, setGame] = useState<PsychicnumGame | null>(null)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [loading, setLoading] = useState(true)

  useRealtimeRefetch({
    tables: [
      { schema: 'psychicnum', table: 'games', filter: `id=eq.${gameId}` },
      { schema: 'psychicnum', table: 'players', filter: `game_id=eq.${gameId}` },
      { schema: 'psychicnum', table: 'guesses', filter: `game_id=eq.${gameId}` },
    ],
    channelPrefix: 'psychicnum',
    id: gameId,
    load: async ({ mounted }) => {
      const { data: gameData } = await db
        .from('games_state')
        .select('id, club_handle, mode, words, secrets, created_at')
        .eq('id', gameId)
        .maybeSingle()
      if (!mounted()) return

      if (!gameData) {
        setGame(null)
        setPlayers([])
        setGuesses([])
        setLoading(false)
        return
      }

      const [{ data: playerRows }, { data: guessRows }] = await Promise.all([
        db
          .from('players')
          .select('user_id, guesses_remaining, secrets_found')
          .eq('game_id', gameId),
        db
          .from('guesses')
          .select('id, user_id, word, was_correct, kind, guessed_at')
          .eq('game_id', gameId)
          .order('guessed_at', { ascending: true }),
      ])
      if (!mounted()) return

      setGame({
        id: gameData.id as string,
        club_handle: gameData.club_handle as string,
        mode: gameData.mode as 'coop' | 'compete',
        words: gameData.words as string[],
        secrets: gameData.secrets as string[] | null,
        created_at: gameData.created_at as string,
      })
      setPlayers((playerRows ?? []) as PlayerRow[])
      setGuesses((guessRows ?? []) as GuessRow[])
      setLoading(false)
    },
  })

  return { game, players, guesses, loading }
}
