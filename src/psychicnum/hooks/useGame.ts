// cs-blessed-psychicnum

import { useState } from 'react'
import { useRefetchOnGameUpdate } from '@/common/game-page/useRefetchOnGameUpdate'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import { db } from '../db'
import type { Member } from '@/common/members/member'

/**
 * One player in a psychicnum game.
 */
export type Player = Member

/**
 * The FE-ready game row, from the `psychicnum.games_state` view: the board,
 * and the secrets once the game has ended (null while it is played; the view
 * hands them over at the end).
 */
export type PsychicnumGame = {
  // The board: the words shown as tiles (PUBLIC). Players click these
  // to guess; three of them are the secrets. Lowercase.
  words: string[]
  // The three secret words (a subset of `words`). Null while the game is
  // played (gated by the view's helper); the real array once it has ended.
  secrets: string[] | null
}

/**
 * One row from `psychicnum.players` — what one player has spent and found.
 *
 * Each row counts only its owner's guesses, in both modes. In compete that is
 * the player's own budget; in coop the team shares one budget, spent by the
 * sum of the rows.
 *
 * Always visible to the whole club regardless of mode — the
 * "opponents see my remaining budget but not my guesses" rule
 * is enforced by giving this table club-wide RLS while
 * `psychicnum.events` gets user-scoped RLS in compete mode.
 */
export type PlayerRow = {
  user_id: string
  // Guesses this player has made. Compete spends it against
  // `psychicnum.games.max_guesses`; coop spends the rows' sum against it.
  guesses_used: number
  // How many distinct secrets this player has found (0..3). Public to the
  // club; drives the compete opponent-progress feedback.
  found_secrets_count: number
}

/**
 * One row from `psychicnum.events`. In coop the FE receives
 * every player's guess; in compete the RLS policy filters
 * server-side so the FE only ever receives its own user_id's
 * rows. PlayArea renders them the same way either way; the
 * filtering is invisible to the FE.
 */
export type EventRow = {
  // The row's own id, and the order of play.
  id: number
  user_id: string
  // The text this row carries. For 'guess'/'spoiler' it's a board word
  // (lowercase); for 'hint' it's the CLUE text (or "No hint available").
  word: string
  is_correct: boolean
  // 'guess' = a real guess (colors the board, counts toward the win);
  // 'spoiler' = a secret word handed over (the answer);
  // 'hint' = a clue for a secret.
  kind: 'guess' | 'hint' | 'spoiler'
  created_at: string
}

/**
 * Per-gametype data hook for psychicnum (both modes share it).
 *
 * Reads three things:
 *   - the `games_state` view (the board, and the secrets once ended)
 *   - `players` (per-player budgets, club-wide visible), returned as
 *     `playerBudgets`
 *   - `events` (the turn log; RLS scopes to caller in compete)
 *
 * It keeps no subscription: `useRefetchOnGameUpdate` reruns the reads when
 * the page's `common.games` row moves (`commonGameUpdatedAt`) or the page's
 * channel rejoins (`resubscribeCount`), both from `GamePageCtx`.
 *
 * The cross-cutting machinery (members, presence, manual-pause,
 * timer) lives on `useCommonGame` inside `GamePage` — see
 * `src/common/game-page/useCommonGame.ts`.
 */
export function useGame({
  gameId,
  commonGameUpdatedAt,
  resubscribeCount,
}: {
  gameId: string
  commonGameUpdatedAt: string
  resubscribeCount: number
}): {
  game: PsychicnumGame | null
  // The `psychicnum.players` rows: each player's guess budget, not the roster
  // (the page's `players` is that).
  playerBudgets: PlayerRow[]
  guesses: EventRow[]
  loading: boolean
  // Set when a read FAILED, which is not the same as the game being absent.
  // The loader renders `<EnvelopeErrorPage>` for this, and `<NoSuchGamePage>`
  // for a game that is absent.
  failure: NotOkEnvelope | null
} {
  const [game, setGame] = useState<PsychicnumGame | null>(null)
  const [playerBudgets, setPlayerBudgets] = useState<PlayerRow[]>([])
  const [guesses, setGuesses] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)

  useRefetchOnGameUpdate({
    commonGameUpdatedAt,
    resubscribeCount,
    load: async ({ mounted }) => {
      // No `.maybeSingle()`: `readRows` hands back rows, and `game_id` is the
      // PK, so this is 0 or 1 of them.
      const gameRes = await readRows(
        db
          .from('games_state')
          .select('words, secrets')
          .eq('game_id', gameId),
      )
      if (!mounted()) return

      // A read can only fail as a FAULT — `readRows` never authors anything
      // else, and it has already logged the failure and raised the modal.
      if (gameRes.type === 'not-ok') {
        setFailure(gameRes)
        setLoading(false)
        return
      }
      // A load that worked clears a previous one's failure: this refetches on
      // every move and every rejoin, so an outage that ends should take its
      // sentence with it rather than leaving the surface behind a stale
      // explanation. Cleared HERE, before the zero-rows return below, so a game
      // deleted during the outage reads as "not found" rather than as the
      // outage.
      setFailure(null)

      // ZERO ROWS is the caller's to read: no game with that id, or one this
      // club cannot see.
      const gameData = gameRes.data[0]
      if (!gameData) {
        setGame(null)
        setPlayerBudgets([])
        setGuesses([])
        setLoading(false)
        return
      }

      const [playersRes, guessesRes] = await Promise.all([
        readRows(
          db
            .from('players')
            .select('user_id, guesses_used, found_secrets_count')
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

      setGame({
        words: gameData.words as string[],
        secrets: gameData.secrets as string[] | null,
      })
      setPlayerBudgets(playersRes.data as PlayerRow[])
      setGuesses(guessesRes.data as EventRow[])
      setLoading(false)
    },
  })

  return { game, playerBudgets, guesses, loading, failure }
}
