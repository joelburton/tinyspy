// cs-fixed-outcome-fix

import { useState } from 'react'
import { useRealtimeRefetch } from '@/common/realtime/useRealtimeRefetch'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import { db } from '../db'
import type { Member } from '@/common/members/member'

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
 * `psychicnum.events` gets user-scoped RLS in compete mode.
 */
export type PlayerRow = {
  user_id: string
  guesses_remaining: number
  /** How many distinct secrets this player has found (0..3). Public to the
   *  club; drives the compete opponent-progress feedback. */
  found_secrets_count: number
}

/**
 * One row from `psychicnum.events`. In coop the FE receives
 * every player's guess; in compete the RLS policy filters
 * server-side so the FE only ever receives its own user_id's
 * rows. PlayArea renders them the same way either way; the
 * filtering is invisible to the FE.
 */
export type GuessRow = {
  /** The row's own id, and the order of play: the database hands them out in
   *  the order the rows were written, which is why the read below orders by
   *  it rather than by the timestamp. Two rows written in one transaction tie
   *  on `created_at`. */
  id: number
  user_id: string
  /** The text this row carries. For 'guess'/'spoiler' it's a board word
   *  (lowercase); for 'hint' it's the CLUE text (or "No hint available"). */
  word: string
  is_correct: boolean
  /** 'guess' = a real guess (colors the board, counts toward the win);
   *  'spoiler' = a secret word handed over (the answer);
   *  'hint' = a clue for a secret.
   *
   *  What each is WORTH is `lib/answer.ts`'s to say — and `kind` has to be read
   *  before `is_correct`, because a hint and a spoiler are both written
   *  `is_correct = true`. */
  kind: 'guess' | 'hint' | 'spoiler'
  created_at: string
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
 * `src/common/game-page/useCommonGame.ts`.
 */
export function useGame(gameId: string): {
  game: PsychicnumGame | null
  players: PlayerRow[]
  guesses: GuessRow[]
  loading: boolean
  /** Set when a read FAILED, which is not the same as the game being absent.
   *  The surface renders this instead of "Game not found." */
  failure: NotOkEnvelope | null
} {
  const [game, setGame] = useState<PsychicnumGame | null>(null)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)

  useRealtimeRefetch({
    tables: [
      { schema: 'psychicnum', table: 'games', filter: `id=eq.${gameId}` },
      { schema: 'psychicnum', table: 'players', filter: `game_id=eq.${gameId}` },
      { schema: 'psychicnum', table: 'events', filter: `game_id=eq.${gameId}` },
    ],
    channelPrefix: 'psychicnum',
    id: gameId,
    load: async ({ mounted }) => {
      // No `.maybeSingle()`: `readRows` hands back rows, and `id` is the PK,
      // so this is 0 or 1 of them.
      const gameRes = await readRows(
        db
          .from('games_state')
          .select('id, club_handle, mode, words, secrets, created_at')
          .eq('id', gameId),
      )
      if (!mounted()) return

      // A read can only fail as a FAULT — `readRows` never authors anything
      // else, and it has already logged the failure and raised the modal. What
      // is left is the sentence BEHIND it, plus a line naming which of the reads
      // it was: "something didn't load" is not a fact anyone can act on.
      if (gameRes.type === 'not-ok') {
        setFailure(gameRes)
        setLoading(false)
        return
      }
      // ZERO ROWS is the caller's to read: no game with that id, or one this
      // club cannot see.
      const gameData = gameRes.data[0]
      if (!gameData) {
        setGame(null)
        setPlayers([])
        setGuesses([])
        setLoading(false)
        return
      }

      const [playersRes, guessesRes] = await Promise.all([
        readRows(
          db
            .from('players')
            .select('user_id, guesses_remaining, found_secrets_count')
            .eq('game_id', gameId),
        ),
        readRows(
          db
            .from('events')
            .select('id, user_id, word, is_correct, kind, created_at')
            .eq('game_id', gameId)
            .order('id', { ascending: true }),
        ),
      ])
      if (!mounted()) return
      // One branch each rather than one combined test, because WHICH read failed
      // is the only thing the player's sentence cannot say.
      if (playersRes.type === 'not-ok') {
        setFailure(playersRes)
        setLoading(false)
        return
      }
      if (guessesRes.type === 'not-ok') {
        setFailure(guessesRes)
        setLoading(false)
        return
      }
      // A load that worked clears a previous one's failure: this refetches on
      // every realtime event, so an outage that ends should take its sentence
      // with it rather than leaving the surface behind a stale explanation.
      setFailure(null)

      setGame({
        id: gameData.id as string,
        club_handle: gameData.club_handle as string,
        mode: gameData.mode as 'coop' | 'compete',
        words: gameData.words as string[],
        secrets: gameData.secrets as string[] | null,
        created_at: gameData.created_at as string,
      })
      setPlayers(playersRes.data as PlayerRow[])
      setGuesses(guessesRes.data as GuessRow[])
      setLoading(false)
    },
  })

  return { game, players, guesses, loading, failure }
}
