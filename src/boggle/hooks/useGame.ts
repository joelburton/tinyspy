// cs-unmet

import { useEffect, useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import { readRows } from '../../common/lib/supabase/dbResult'
import type { NotOkEnv } from '../../common/lib/supabase/envelope'
import { db } from '../db'
import type { Member } from '../../common/lib/games'

/** One player in a boggle game. No per-player state beyond a Member today. */
export type Player = Member

/** A word the board ships to the FE — one entry of the legal list. `required`
 *  words are the goal/reveal set; `bonus` words are the extra legal-band finds.
 *  boggle has no hidden-solution view; the FE validates + scores guesses against
 *  required ∪ bonus locally, so both carry points. (No pangram concept in boggle.) */
export type BoggleWord = { word: string; points: number }

/** The boggle game header, read straight off `boggle.games`. Immutable for the
 *  life of the game (play state lives in common.games), so it loads once. */
export type BoggleGame = {
  id: string
  club_handle: string
  mode: 'coop' | 'compete'
  /** row-major raw-face board string (A–Z, multiface digit, 0 = blank) */
  board: string
  /** board side length (n × n) */
  n: number
  min_word_length: number
  required_words: BoggleWord[]
  /** Legal-band words traceable on the board but outside the required set (empty
   *  when legal_band == band). The FE accepts+scores these as bonus finds. */
  bonus_words: BoggleWord[]
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
 * boggle's per-gametype data hook.
 *
 * Two data lifecycles, deliberately split (the board + word lists are the reason):
 *   - **The game header loads ONCE.** `boggle.games` is immutable for the life of
 *     the game — the board, the required list, and the (potentially large) bonus
 *     list never change; play state lives in `common.games`. So a one-shot fetch
 *     on mount, NOT a per-event refetch — otherwise every teammate submission
 *     would re-download the whole legal list.
 *   - **found_words refetches on realtime events** (Pattern A): every submission
 *     flows through `boggle.submit_word`, which writes a `found_words` row that
 *     propagates to peers via postgres-changes. This is the only thing that
 *     changes during play, so it's the only thing we re-pull.
 */
export function useGame(gameId: string): {
  game: BoggleGame | null
  foundWords: FoundWordRow[]
  loading: boolean
  /** True once the found_words rows have loaded at least once — distinct from
   *  `loading` (which flips on the HEADER fetch). Peer narration gates on this
   *  so it seeds against the real backlog, not the empty pre-rows snapshot. */
  rowsLoaded: boolean
  /** Set when a read FAILED, which is not the same as the game being absent.
   *  The surface renders this instead of "Game not found." */
  failure: NotOkEnv | null
} {
  const [game, setGame] = useState<BoggleGame | null>(null)
  const [foundWords, setFoundWords] = useState<FoundWordRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rowsLoaded, setRowsLoaded] = useState(false)
  // TWO failure slots, because the two lifecycles below fail differently. The
  // header is fetched once and never retried, so its failure is permanent; the
  // rows refetch on every event, so their failure should clear the moment one
  // works. One shared slot would let a successful refetch erase a header
  // failure that is still true.
  const [headerFailure, setHeaderFailure] = useState<NotOkEnv | null>(null)
  const [rowsFailure, setRowsFailure] = useState<NotOkEnv | null>(null)

  // The immutable header — fetched once per game. `loading` gates the PlayArea's
  // board render, so it flips here (the found_words load below just fills the list).
  useEffect(() => {
    let mounted = true
    void (async () => {
      // No `.maybeSingle()`: `readRows` hands back rows, and `id` is the PK, so
      // this is 0 or 1 of them.
      const res = await readRows(
        db
          .from('games')
          .select(
            'id, club_handle, mode, board, n, min_word_length, required_words, bonus_words, required_words_count, required_words_score',
          )
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
          board: data.board as string,
          n: data.n as number,
          min_word_length: data.min_word_length as number,
          required_words: (data.required_words as BoggleWord[]) ?? [],
          bonus_words: (data.bonus_words as BoggleWord[]) ?? [],
          required_words_count: data.required_words_count as number,
          required_words_score: data.required_words_score as number,
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
      { schema: 'boggle', table: 'found_words', filter: `game_id=eq.${gameId}` },
      // The games row never changes mid-play (the header loads once above) —
      // this subscription exists for replay_board's realtime TOUCH: replay
      // only DELETEs found_words rows, and realtime filters don't reliably
      // match DELETE events, so the RPC's no-op games write is what wakes
      // every client to refetch the now-empty found list.
      { schema: 'boggle', table: 'games', filter: `id=eq.${gameId}` },
    ],
    channelPrefix: 'boggle',
    id: gameId,
    load: async ({ mounted }) => {
      const res = await readRows(
        db
          .from('found_words')
          .select('game_id, user_id, word, points, is_bonus, found_at')
          .eq('game_id', gameId)
          .order('found_at', { ascending: true }),
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
      setFoundWords(res.data as FoundWordRow[])
      setRowsLoaded(true)
    },
  })

  // The header's wins: it can never be retried, so once it has failed the board
  // is not coming back however well the rows are loading.
  return { game, foundWords, loading, rowsLoaded, failure: headerFailure ?? rowsFailure }
}
