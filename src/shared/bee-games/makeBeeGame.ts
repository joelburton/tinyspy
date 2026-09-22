// cs-met-bee-games

import { useEffect, useState } from 'react'
import { useRealtimeRefetch } from '@/common/realtime/useRealtimeRefetch'
import { supabase } from '@/common/supabase/supabase'
import { type DbError } from '@/common/supabase/dbEnvelope'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import type { FoundWordsWord, FoundWordRow } from '@/shared/found-words/foundWords'

/**
 * The immutable header exposed to the FE — projected from `<schema>.games_state`.
 * Loads once (play state lives on common.games). Both word lists ship from game
 * start; the FE just doesn't RENDER the required list until terminal.
 *
 * This is the half of the found-words shape the bee games share and boggle does
 * not: a center letter, an outer-letters string, two scored word lists and a
 * rank-ladder denominator. The board differs at RENDER time (a hex hive vs a
 * 9-tile wheel) and in game logic (a letter SET vs a letter MULTISET), but this
 * data is the same, which is what lets one factory answer for both.
 */
export type BeeGame = {
  id: string
  club_handle: string
  // Denormalized from `<schema>.games.mode`. Drives FE branching for the
  // OpponentStrip + win-vs-loss verdict copy in the PlayArea.
  mode: 'coop' | 'compete'
  outer_letters: string
  center_letter: string
  // Score of the required set — the rank-ladder denominator.
  required_words_score: number
  // Count of required words — the "X / Y words" goal (Y).
  required_words_count: number
  created_at: string
  // The required-words answer key (the displayed goal + the terminal reveal).
  requiredWords: FoundWordsWord[]
  // The bonus set (legal − required): accepted + scored, never revealed.
  bonusWords: FoundWordsWord[]
}

/** The schema names of the two bee games — whatever `supabase.schema()`
 *  accepts (keeps the factory type-safe without hard-coding the union here). */
type GameSchema = Parameters<typeof supabase.schema>[0]

/**
 * The minimal query surface this hook uses. `supabase.schema(schema)` with a
 * RUNTIME schema string widens `.from()` to `never` — TS can't pick a schema's
 * table set from a non-literal — and the two hive schemas have distinct
 * generated types, so there is no shared typed `.from`. We read through this
 * hand-written shape — the exact two chains below, and no more of the client
 * than they use — and cast each result field to the row and header types.
 */
type Rows = { data: Record<string, unknown>[] | null; error: DbError }
type SchemaQuery = {
  from: (table: string) => {
    select: (cols: string) => {
      // Awaitable in its own right AND still chainable: the header reads
      // straight off `.eq()`, the found list adds an `.order()` first. Both
      // resolve to `{ data, error }`, which is what `readRows` reads.
      eq: (col: string, val: string) => PromiseLike<Rows> & {
        order: (col: string, opts: { ascending: boolean }) => PromiseLike<Rows>
      }
    }
  }
}

/**
 * Builds the `useGame` a bee game exports, bound to its schema. Everything a
 * caller's data needs is here — the same columns, the same realtime wiring, the
 * same two lifecycles — so a game's own `hooks/useGame.ts` is the binding and
 * its type aliases, and nothing else.
 *
 * Two data lifecycles:
 *   - **The header loads ONCE.** `<schema>.games` is immutable during play (the
 *     letters + both word lists never change; terminal lives on common.games),
 *     so a one-shot fetch — NOT a per-event refetch (the word lists would
 *     otherwise be re-downloaded on every teammate submission). Read from the
 *     `games_state` VIEW, which exposes the base columns plus the two word lists.
 *   - **found_words refetches on realtime events** (Pattern A): every submission
 *     flows through `<schema>.submit_word`, which appends a `found_words` row
 *     that propagates to peers via postgres-changes.
 *
 * If either game grows a game-specific column, give it back its own `useGame`
 * body (the thin file is the seam); don't bend the factory around one caller.
 */
export function makeBeeGame(schema: GameSchema) {
  const db = supabase.schema(schema) as unknown as SchemaQuery

  return function useBeeGame(gameId: string): {
    game: BeeGame | null
    foundWords: FoundWordRow[]
    loading: boolean
    /** True once the found_words rows have loaded at least once — distinct from
     *  `loading` (which flips on the HEADER fetch). Peer narration gates on this
     *  so it seeds against the real backlog, not the empty pre-rows snapshot. */
    rowsLoaded: boolean
    /** Set when a read FAILED, which is not the same as the game being absent.
     *  The surface renders this instead of "Game not found." */
    failure: NotOkEnvelope | null
  } {
    const [game, setGame] = useState<BeeGame | null>(null)
    const [foundWords, setFoundWords] = useState<FoundWordRow[]>([])
    const [loading, setLoading] = useState(true)
    const [rowsLoaded, setRowsLoaded] = useState(false)
    // TWO failure slots, because the two lifecycles below fail differently. The
    // header is fetched once and never retried, so its failure is permanent;
    // the found list refetches on every event, so its failure should clear the
    // moment one works. One shared slot would let a successful refetch erase a
    // header failure that is still true.
    const [headerFailure, setHeaderFailure] = useState<NotOkEnvelope | null>(null)
    const [rowsFailure, setRowsFailure] = useState<NotOkEnvelope | null>(null)

    // `loading` gates the PlayArea render, so it flips here.
    useEffect(function loadHeaderOnce() {
      let mounted = true
      void (async () => {
        // No `.maybeSingle()`: `readRows` hands back rows, and `id` is the PK,
        // so this is 0 or 1 of them.
        const res = await readRows(
          db
            .from('games_state')
            .select(
              'id, club_handle, mode, outer_letters, center_letter, required_words_score, required_words_count, created_at, required_words, bonus_words',
            )
            .eq('id', gameId),
        )
        if (!mounted) return

        // A read can only fail as a FAULT — `readRows` never authors anything
        // else, and it has already logged the failure and raised the modal.
        // What is left is the sentence BEHIND it, plus a line naming which read
        // it was.
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
            outer_letters: data.outer_letters as string,
            center_letter: data.center_letter as string,
            required_words_score: data.required_words_score as number,
            required_words_count: data.required_words_count as number,
            created_at: data.created_at as string,
            requiredWords: (data.required_words as FoundWordsWord[]) ?? [],
            bonusWords: (data.bonus_words as FoundWordsWord[]) ?? [],
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
        { schema, table: 'found_words', filter: `game_id=eq.${gameId}` },
        // The games row never changes mid-play (the header loads once above) —
        // this subscription exists for replay_board's realtime TOUCH: replay
        // only DELETEs found_words rows, and realtime filters don't reliably
        // match DELETE events, so the RPC's no-op games write is what wakes
        // every client to refetch the now-empty found list.
        { schema, table: 'games', filter: `id=eq.${gameId}` },
      ],
      channelPrefix: schema,
      id: gameId,
      load: async ({ mounted }) => {
        const res = await readRows(
          db
            .from('found_words')
            .select('game_id, user_id, word, points, is_pangram, is_bonus, found_at')
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
        setFoundWords(res.data as unknown as FoundWordRow[])
        setRowsLoaded(true)
      },
    })

    // The header's wins: it can never be retried, so once it has failed the
    // board is not coming back however well the found list is loading.
    return { game, foundWords, loading, rowsLoaded, failure: headerFailure ?? rowsFailure }
  }
}
