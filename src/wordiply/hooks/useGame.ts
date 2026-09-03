// cs-unmet

import { useEffect, useMemo, useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import { readRows } from '../../common/lib/supabase/dbResult'
import type { NotOkEnv } from '../../common/lib/supabase/envelope'
import { db } from '../db'
import type { Member } from '../../common/lib/members/member'

/**
 * One player in a wordiply game. wordiply adds no per-player state beyond
 * a Member (any club member who joined can guess), so Player is a straight
 * re-export — the per-game vocabulary convention (naming.md → player).
 */
export type Player = Member

/**
 * Shape exposed to the FE — projected from `wordiply.games_state`. The
 * header is immutable for the life of the game (play state lives on
 * common.games), so it loads once. Nothing is hidden: the legal list + the
 * longest word ship from game start; the FE just doesn't RENDER the scores
 * / longest word until terminal.
 */
export type WordiplyGame = {
  id: string
  club_handle: string
  /** Denormalized from `wordiply.games.mode`; drives the OpponentStrip +
   *  win-vs-loss verdict branching in the PlayArea. */
  mode: 'coop' | 'compete'
  /** The 2–4 letter base players extend (a letter-combination, not a word). */
  base: string
  /** The dictionary band the legal child words were drawn from. */
  difficulty: number
  /** The length-score denominator (the bar's target — a hint, never shown
   *  as the answer). */
  max_word_length: number
  /** The actual longest word(s) — shipped, but only rendered at terminal. */
  longestWords: string[]
  /** The full clean legal list, for local trusting-commit validation. */
  legalWords: string[]
  created_at: string
}

/**
 * One row of `wordiply.guesses` — the TURN log, so this is any submission,
 * accepted or rejected. `valid` splits them: `false` rows carry a `reason` and
 * have no `seq` (they occupy no board slot). Only valid rows score, fill the
 * five board rows, or spend budget; the log shows both. See the migration's
 * table header for why rejects are stored.
 */
export type GuessRow = {
  id: number
  game_id: string
  user_id: string
  word: string
  length: number
  valid: boolean
  /** null iff valid; else which guard caught it. */
  reason: 'missing_base' | 'too_short' | 'not_a_word' | null
  /** The 1..5 board-row index — null on a rejected row. */
  seq: number | null
  guessed_at: string
}

/**
 * wordiply's per-gametype data hook. Two data lifecycles (like
 * wordwheel/boggle):
 *   - **The header loads ONCE.** `wordiply.games` is immutable during play
 *     (base + word lists never change; terminal lives on common.games), so
 *     the legal list isn't re-downloaded on every guess.
 *   - **guesses refetches on realtime events.** Every guess flows through
 *     `wordiply.submit_guess`, which appends a `guesses` row that
 *     propagates to peers via postgres-changes. The `games` subscription is
 *     there for replay_board's realtime TOUCH (replay DELETEs guesses rows,
 *     which realtime filters don't reliably match).
 */
export function useGame(gameId: string): {
  game: WordiplyGame | null
  /** EVERY row — the turn log, rejects included. Only the log wants these. */
  guesses: GuessRow[]
  /** Just the accepted ones: the board's five rows, the dedup source, the
   *  scores. Split here so no consumer has to remember the rule. */
  validGuesses: GuessRow[]
  loading: boolean
  /** True once the guesses rows have loaded at least once — distinct from
   *  `loading` (which flips on the HEADER fetch). Peer narration gates on this
   *  so it seeds against the real backlog, not the empty pre-rows snapshot. */
  rowsLoaded: boolean
  /** Set when a read FAILED, which is not the same as the game being absent.
   *  The surface renders this instead of "Game not found." */
  failure: NotOkEnv | null
} {
  const [game, setGame] = useState<WordiplyGame | null>(null)
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rowsLoaded, setRowsLoaded] = useState(false)
  // TWO failure slots, because the two lifecycles below fail differently. The
  // header is fetched once and never retried, so its failure is permanent; the
  // rows refetch on every event, so their failure should clear the moment one
  // works. One shared slot would let a successful refetch erase a header
  // failure that is still true.
  const [headerFailure, setHeaderFailure] = useState<NotOkEnv | null>(null)
  const [rowsFailure, setRowsFailure] = useState<NotOkEnv | null>(null)

  // The immutable header — fetched once per game. `loading` gates the
  // PlayArea render, so it flips here.
  useEffect(() => {
    let mounted = true
    void (async () => {
      // No `.maybeSingle()`: `readRows` hands back rows, and `id` is the PK, so
      // this is 0 or 1 of them.
      const res = await readRows(
        db
          .from('games_state')
          .select('id, club_handle, mode, base, difficulty, max_word_length, longest_words, legal_words, created_at')
          .eq('id', gameId),
      )
      if (!mounted) return

      // A read can only fail as a FAULT — `readRows` never authors anything
      // else, and it has already logged the failure and raised the modal. What
      // is left is the sentence BEHIND it, plus a line naming which read it was.
      if (res.type === 'not-ok') {
        setHeaderFailure(res)
        setLoading(false)
        return
      }
      // ZERO ROWS is the caller's to read: no game with that id, or one this
      // club cannot see.
      const data = res.data[0]
      if (data) {
        setGame({
          id: data.id as string,
          club_handle: data.club_handle as string,
          mode: data.mode as 'coop' | 'compete',
          base: data.base as string,
          difficulty: data.difficulty as number,
          max_word_length: data.max_word_length as number,
          longestWords: (data.longest_words as string[]) ?? [],
          legalWords: (data.legal_words as string[]) ?? [],
          created_at: data.created_at as string,
        })
      }
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [gameId])

  useRealtimeRefetch({
    tables: [
      { schema: 'wordiply', table: 'guesses', filter: `game_id=eq.${gameId}` },
      // The games row never changes mid-play — this subscription exists for
      // replay_board's realtime TOUCH (see the hook header).
      { schema: 'wordiply', table: 'games', filter: `id=eq.${gameId}` },
    ],
    channelPrefix: 'wordiply',
    id: gameId,
    load: async ({ mounted }) => {
      const res = await readRows(
        db
          .from('guesses')
          .select('id, game_id, user_id, word, length, valid, reason, seq, guessed_at')
          .eq('game_id', gameId)
          .order('guessed_at', { ascending: true }),
      )
      if (!mounted()) return
      if (res.type === 'not-ok') {
        setRowsFailure(res)
        return
      }
      // A load that worked clears a previous one's failure: this refetches on
      // every realtime event, so an outage that ends should take its sentence
      // with it rather than leaving the surface behind a stale explanation.
      setRowsFailure(null)
      setGuesses(res.data as GuessRow[])
      setRowsLoaded(true)
    },
  })

  // Split once, here, so no consumer has to remember the rule: the board, the
  // dedup and every score read `validGuesses`; only the turn log wants them all.
  const validGuesses = useMemo(() => guesses.filter((g) => g.valid), [guesses])

  // The header's wins: it can never be retried, so once it has failed the board
  // is not coming back however well the rows are loading.
  return { game, guesses, validGuesses, loading, rowsLoaded, failure: headerFailure ?? rowsFailure }
}
