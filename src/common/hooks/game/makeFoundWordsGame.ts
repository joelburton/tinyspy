import { useEffect, useState } from 'react'
import { useRealtimeRefetch } from '../realtime/useRealtimeRefetch'
import { supabase } from '../../lib/supabase/supabase'
import type { FoundWordsGame, FoundWordsWord, FoundWordRow } from '../../lib/game/foundWords'

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
type QueryResult = { data: Record<string, unknown> | null }
type ListResult = { data: Record<string, unknown>[] | null }
type SchemaQuery = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<QueryResult>
        order: (col: string, opts: { ascending: boolean }) => Promise<ListResult>
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
  } {
    const [game, setGame] = useState<FoundWordsGame | null>(null)
    const [foundWords, setFoundWords] = useState<FoundWordRow[]>([])
    const [loading, setLoading] = useState(true)
    const [rowsLoaded, setRowsLoaded] = useState(false)

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
        const { data } = await db
          .from('found_words')
          .select('game_id, user_id, word, points, is_pangram, is_bonus, found_at')
          .eq('game_id', gameId)
          .order('found_at', { ascending: true })
        if (!mounted()) return
        setFoundWords((data ?? []) as FoundWordRow[])
        setRowsLoaded(true)
      },
    })

    return { game, foundWords, loading, rowsLoaded }
  }
}
