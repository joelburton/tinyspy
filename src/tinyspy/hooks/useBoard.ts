import { useEffect, useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/useRealtimeRefetch'
import { db } from '../db'
import type { Database } from '../../types/db'
import type { KeyLabel } from '../lib/labels'
import type { Seat } from '../lib/phase'

// Narrower than Database[...]['Row'] — see code-conventions.md's "Avoid
// SELECT *". Adding a new column to tinyspy.words requires explicitly listing
// it here AND in the select() below.
//
// `revealed_as` is the GLOBAL reveal ('G' agent contacted / 'A' assassin / null
// still in play). Neutrals are NOT global — `neutral_a` / `neutral_b` record
// which seat hit this word as a bystander, so a word can stay guessable by the
// partner (Duet: a bystander on one key may be the other's agent).
export type WordRow = Pick<
  Database['tinyspy']['Tables']['words']['Row'],
  'position' | 'word' | 'revealed_as' | 'neutral_a' | 'neutral_b'
>

/** One logged guess, joined with its word text for the Game Log. A word can
 *  appear twice (once per seat). */
export type GuessRow = {
  position: number
  word: string
  guesser_seat: Seat
  outcome: KeyLabel
  turn_number: number
  guessed_at: string
}

/**
 * Subscribes to a game's board state for the current player.
 *
 * Returns the 25 word rows (with denormalized reveal state), the full
 * per-guess log (`guesses`, for the Game Log), the caller's own key view
 * (`myKey`), and optionally the partner's key view (`peerKey`) for post-game
 * review.
 *
 * Why a separate guess log: a word can be guessed by BOTH players (a bystander
 * on one key may be the other's agent), so the per-word row can't hold the
 * history — `tinyspy.guesses` does. The board reads the denormalized `words`
 * state; the log reads `guesses`.
 *
 * The peer key is sensitive during play (it would leak the partner's view) and
 * is only fetched when `revealPeer` is true.
 *
 * Realtime: drives off `useRealtimeRefetch`, watching both `words` (the board)
 * and `guesses` (the log) — full refetch on any event. Every guess updates
 * `words` (denormalization) and inserts into `guesses`, so either event lands
 * the same fresh state.
 */
export function useBoard(gameId: string, userId: string, revealPeer: boolean) {
  const [words, setWords] = useState<WordRow[]>([])
  const [guesses, setGuesses] = useState<GuessRow[]>([])
  const [myKey, setMyKey] = useState<KeyLabel[] | null>(null)
  // The peer key is fetched into `fetchedPeerKey` and tagged with the
  // gameId+userId it was fetched for. The publicly-returned `peerKey`
  // (derived below) is null unless the caller currently wants the peer
  // key AND the cached fetch matches the active game/user — this
  // avoids the "setState in effect body" anti-pattern that arose when
  // the hook synchronously cleared peerKey on revealPeer flipping off.
  const [fetchedPeerKey, setFetchedPeerKey] = useState<KeyLabel[] | null>(null)
  const [fetchedFor, setFetchedFor] = useState<string | null>(null)
  const peerKey =
    revealPeer && fetchedFor === `${gameId}:${userId}` ? fetchedPeerKey : null
  const [loading, setLoading] = useState(true)

  useRealtimeRefetch({
    tables: [
      { schema: 'tinyspy', table: 'words', filter: `game_id=eq.${gameId}` },
      { schema: 'tinyspy', table: 'guesses', filter: `game_id=eq.${gameId}` },
    ],
    channelPrefix: 'board',
    id: gameId,
    load: async ({ mounted }) => {
      // Seats + key cards are columns on tinyspy.games (not a separate
      // game_players table). Pull the row, pick the column matching the
      // caller's seat. The guess log joins word text in JS (the guesses table
      // stores positions, not words).
      const [wordsRes, gameRes, guessesRes] = await Promise.all([
        db
          .from('words')
          .select('position, word, revealed_as, neutral_a, neutral_b')
          .eq('game_id', gameId)
          .order('position'),
        db
          .from('games')
          .select('user_a_id, user_b_id, key_card_a, key_card_b')
          .eq('id', gameId)
          .single(),
        db
          .from('guesses')
          .select('position, guesser_seat, outcome, turn_number, guessed_at')
          .eq('game_id', gameId),
      ])
      if (!mounted()) return
      const wordRows = wordsRes.data ?? []
      if (wordsRes.data) setWords(wordRows)
      if (guessesRes.data) {
        const wordAt = new Map(wordRows.map((w) => [w.position, w.word]))
        setGuesses(
          guessesRes.data.map((g) => ({
            position: g.position,
            word: wordAt.get(g.position) ?? '',
            guesser_seat: g.guesser_seat as Seat,
            outcome: g.outcome as KeyLabel,
            turn_number: g.turn_number,
            guessed_at: g.guessed_at,
          })),
        )
      }
      const g = gameRes.data
      if (g) {
        // key_card_X is `jsonb` in the schema and typed as `Json` here;
        // create_game guarantees it's a length-25 array of KeyLabels.
        const myKeyJson =
          userId === g.user_a_id ? g.key_card_a
          : userId === g.user_b_id ? g.key_card_b
          : null
        if (myKeyJson) {
          setMyKey(myKeyJson as unknown as KeyLabel[])
        }
      }
      setLoading(false)
    },
  })

  // Peer key for post-game review. Fetched lazily — only loaded once
  // the game is in a terminal state and the board switches to the
  // "show both keys" rendering. The hook-returned `peerKey` is null
  // when revealPeer is false (derivation above), so we don't need an
  // explicit clear path here; we just skip the fetch.
  useEffect(function loadPeerKey() {
    if (!revealPeer) return
    let mounted = true
    db
      .from('games')
      .select('user_a_id, key_card_a, key_card_b')
      .eq('id', gameId)
      .single()
      .then(({ data }) => {
        if (!mounted || !data) return
        // Peer = the seat I'm NOT in. If I'm A (userId === user_a_id),
        // the peer key is key_card_b; otherwise key_card_a.
        const peerKeyJson =
          userId === data.user_a_id ? data.key_card_b : data.key_card_a
        if (peerKeyJson) {
          setFetchedPeerKey(peerKeyJson as unknown as KeyLabel[])
          setFetchedFor(`${gameId}:${userId}`)
        }
      })
    return () => {
      mounted = false
    }
  }, [gameId, userId, revealPeer])

  return { words, guesses, myKey, peerKey, loading }
}
