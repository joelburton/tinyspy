// cs-unmet

import { useEffect, useState } from 'react'
import { useRealtimeRefetch } from '@/common/realtime/useRealtimeRefetch'
import { supabase } from '@/common/supabase/supabase'
import { type DbError } from '@/common/supabase/dbEnvelope'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import type { FoundWordsGame, FoundWordsWord, FoundWordRow } from './foundWords'

/** The schema names of the found-words rank-ladder games — whatever
 *  `supabase.schema()` accepts (keeps the factory type-safe without hard-coding
 *  the union here). */
type GameSchema = Parameters<typeof supabase.schema>[0]

/**
 * The minimal query surface this hook uses. `supabase.schema(schema)` with a
 * RUNTIME schema string widens `.from()` to `never` — TS can't pick a schema's
 * table set from a non-literal — and the two hive schemas have distinct
 * generated types, so there is no shared typed `.from`. We read through this
 * hand-written shape (the exact two chains below) and cast each result field to
 * the FoundWords* types, the same field-casting the per-game hooks already did.
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
 * Factory for the per-gametype data hook shared by spellingbee + wordwheel.
 * Their `hooks/useGame.ts` bodies were byte-identical (139 lines) — same two
 * data lifecycles, same columns, same realtime wiring — differing only in the
 * schema string. This owns the one copy; each game's `useGame.ts` is now a
 * thin `makeFoundWordsGame('<schema>')` + its type aliases.
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
export function makeFoundWordsGame(schema: GameSchema) {
  const db = supabase.schema(schema) as unknown as SchemaQuery

  return function useFoundWordsGame(gameId: string): {
    game: FoundWordsGame | null
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
    const [game, setGame] = useState<FoundWordsGame | null>(null)
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

    // The immutable header (letters + both word lists) — fetched once per game.
    // `loading` gates the PlayArea render, so it flips here.
    useEffect(() => {
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
