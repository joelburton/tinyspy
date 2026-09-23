// cs-met-codenamesduet

import { useState } from 'react'
import { useRealtimeRefetch } from '@/common/realtime/useRealtimeRefetch'
import { readRows } from '@/common/supabase/dbResult'
import type { NotOkEnvelope } from '@/common/supabase/envelope'
import { db } from '../db'
import type { Database } from '@/types/db'
import type { KeyLabel } from '../lib/labels'
import { agentsAllContacted } from '../lib/agents'
import { toDuetEvent, type DuetEvent } from '../lib/events'

/**
 * One of the board's 25 words, with its reveal state.
 *
 * `revealed_as` is the GLOBAL reveal ('G' agent contacted / 'A' assassin / null
 * still in play). Neutrals are NOT global — `neutral_a` / `neutral_b` record
 * which seat hit this word as a bystander, so a word can stay guessable by the
 * partner (a bystander on one key may be the other's agent).
 *
 * Narrower than the generated row (code-conventions.md → "Avoid SELECT *"): a
 * new column is listed here AND in `useBoard`'s select().
 */
export type WordRow = Pick<
  Database['codenamesduet']['Tables']['words']['Row'],
  'position' | 'word' | 'revealed_as' | 'neutral_a' | 'neutral_b'
>

/**
 * Subscribes to a game's board state for the current player.
 *
 * Returns the 25 word rows (with denormalized reveal state), every event in the
 * order it happened (`events` — clues, guesses, passes, hints; see
 * `lib/events.ts`), the caller's own key view (`myKey`), and optionally the
 * partner's key view (`peerKey`) for post-game review.
 *
 * Why the board and the log are read separately: a word can be guessed by BOTH
 * players (a bystander on one key may be the other's agent), so the per-word
 * row can't hold the history — `codenamesduet.events` does. The board reads the
 * denormalized `words` state; the log reads the events.
 *
 * The partner's key is read as part of the same `games` row the main load
 * already pulls, so no extra fetch is needed; the returned `peerKey` stays null
 * until `revealPeer` is true (the post-game "show both keys" view).
 *
 * Realtime: drives off `useRealtimeRefetch`, watching both `words` (the board)
 * and `events` (the log) — full refetch on any change. A guess updates `words`
 * (denormalization) and inserts an event, so either change lands the same
 * fresh state; a clue, a pass or a hint inserts an event alone.
 *
 * `failure` is the envelope behind a failed read, for the loader to render in
 * place of the board. A read that returns NOTHING is a different answer from a
 * read that FAILED, and the board cannot tell them apart from `words` alone —
 * both leave it empty.
 */
export function useBoard(gameId: string, userId: string, revealPeer: boolean) {
  const [words, setWords] = useState<WordRow[]>([])
  const [events, setEvents] = useState<DuetEvent[]>([])
  const [myKey, setMyKey] = useState<KeyLabel[] | null>(null)
  // "Has this seat found all its agents?" for BOTH seats — drives the
  // finished-player banners. The main load already pulls both key
  // columns (to pick the caller's), so the partner's flag is free to
  // derive here. Two booleans rather than the peer key, because `peerKey`
  // is gated on the reveal and the banner only needs "are they done?".
  const [myAgentsDone, setMyAgentsDone] = useState(false)
  const [peerAgentsDone, setPeerAgentsDone] = useState(false)
  // `load` stashes the partner's key into `fetchedPeerKey`, tagged with
  // the gameId+userId it was loaded for. The returned `peerKey` (derived
  // below) is null unless the caller currently wants the peer key AND the
  // cached value matches the active game/user — so the reveal is a pure
  // derivation, with no effect clearing `peerKey` when revealPeer flips off.
  const [fetchedPeerKey, setFetchedPeerKey] = useState<KeyLabel[] | null>(null)
  const [fetchedFor, setFetchedFor] = useState<string | null>(null)
  const peerKey =
    revealPeer && fetchedFor === `${gameId}:${userId}` ? fetchedPeerKey : null
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<NotOkEnvelope | null>(null)

  useRealtimeRefetch({
    tables: [
      { schema: 'codenamesduet', table: 'words', filter: `game_id=eq.${gameId}` },
      { schema: 'codenamesduet', table: 'events', filter: `game_id=eq.${gameId}` },
    ],
    channelPrefix: 'codenamesduet:board',
    id: gameId,
    load: async ({ mounted }) => {
      // Seats + key cards are columns on codenamesduet.games (not a separate
      // game_players table). Pull the row, pick the column matching the
      // caller's seat.
      const [wordsRes, gameRes, eventsRes] = await Promise.all([
        readRows(
          db
            .from('words')
            .select('position, word, revealed_as, neutral_a, neutral_b')
            .eq('game_id', gameId)
            .order('position'),
        ),
        // No `.single()`: it treats zero rows as an ERROR, so a game this pair
        // cannot see arrived looking exactly like a broken connection.
        // `readRows` hands back rows, and `id` is the PK, so this is 0 or 1.
        readRows(
          db
            .from('games')
            .select('user_a_id, user_b_id, key_card_a, key_card_b')
            .eq('id', gameId),
        ),
        // `order by id`, never the timestamp: the log's meaning is its order.
        readRows(
          db
            .from('events')
            .select('id, user_id, kind, took_turn, created_at, turn_number, seat, clue_word, clue_count, clue_from_ai, guess_position, guess_result')
            .eq('game_id', gameId)
            .order('id'),
        ),
      ])
      if (!mounted()) return

      // A read can only fail as a FAULT — `readRows` never authors anything
      // else, and it has already logged it and raised the modal. What is left
      // is the envelope behind it, which carries the sentence and (in `detail`)
      // WHICH of the three reads died. One branch each, because that last fact
      // is the one nobody can recover afterwards.
      if (wordsRes.type === 'not-ok') {
        setFailure(wordsRes)
        setLoading(false)
        return
      }
      if (gameRes.type === 'not-ok') {
        setFailure(gameRes)
        setLoading(false)
        return
      }
      if (eventsRes.type === 'not-ok') {
        setFailure(eventsRes)
        setLoading(false)
        return
      }
      // A load that worked clears a previous one's failure: this refetches on
      // every realtime event, so an outage that ends should take its sentence
      // with it rather than leaving the board behind a stale explanation.
      setFailure(null)

      const wordRows = wordsRes.data
      setWords(wordRows)
      setEvents(eventsRes.data.map(toDuetEvent))

      // ZERO ROWS is its own answer, and here it says the game is gone — a
      // server-side delete, or one this pair cannot see. Clearing the key is
      // what makes the loader say so: it renders the no-such-game page on a
      // missing key, and without this a deleted game would keep drawing from
      // the last load.
      const g = gameRes.data[0]
      if (!g) {
        setMyKey(null)
        setFetchedPeerKey(null)
        setFetchedFor(null)
        setMyAgentsDone(false)
        setPeerAgentsDone(false)
        setLoading(false)
        return
      }
      // key_card_X is `jsonb` in the schema and typed as `Json` here;
      // create_game guarantees it's a length-25 array of KeyLabels.
      const iAmA = userId === g.user_a_id
      const iAmB = userId === g.user_b_id
      const myKeyJson = iAmA ? g.key_card_a : iAmB ? g.key_card_b : null
      const peerKeyJson = iAmA ? g.key_card_b : iAmB ? g.key_card_a : null
      if (myKeyJson) {
        setMyKey(myKeyJson as unknown as KeyLabel[])
      }
      // The load already has the partner's key column in hand, so stash
      // it here rather than firing a second games fetch at game-over.
      // It's only exposed once `revealPeer` is true (the derived
      // `peerKey` above gates on it).
      if (peerKeyJson) {
        setFetchedPeerKey(peerKeyJson as unknown as KeyLabel[])
        setFetchedFor(`${gameId}:${userId}`)
      }
      // Recomputed on every refetch (the realtime word reveals flow
      // through here), so both flags stay live as agents are found.
      setMyAgentsDone(
        !!myKeyJson &&
          agentsAllContacted(myKeyJson as unknown as KeyLabel[], wordRows),
      )
      setPeerAgentsDone(
        !!peerKeyJson &&
          agentsAllContacted(peerKeyJson as unknown as KeyLabel[], wordRows),
      )
      setLoading(false)
    },
  })

  return { words, events, myKey, peerKey, myAgentsDone, peerAgentsDone, loading, failure }
}
