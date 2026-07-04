import { useState } from 'react'
import { useRealtimeRefetch } from '../../common/hooks/realtime/useRealtimeRefetch'
import { db } from '../db'
import type { Database } from '../../types/db'
import type { KeyLabel } from '../lib/labels'
import { agentsAllContacted } from '../lib/agents'
import type { Seat } from '../lib/phase'

// Narrower than Database[...]['Row'] — see code-conventions.md's "Avoid
// SELECT *". Adding a new column to codenamesduet.words requires explicitly listing
// it here AND in the select() below.
//
// `revealed_as` is the GLOBAL reveal ('G' agent contacted / 'A' assassin / null
// still in play). Neutrals are NOT global — `neutral_a` / `neutral_b` record
// which seat hit this word as a bystander, so a word can stay guessable by the
// partner (Duet: a bystander on one key may be the other's agent).
export type WordRow = Pick<
  Database['codenamesduet']['Tables']['words']['Row'],
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
 * history — `codenamesduet.guesses` does. The board reads the denormalized `words`
 * state; the log reads `guesses`.
 *
 * The partner's key is read as part of the same `games` row the main load
 * already pulls, so no extra fetch is needed; the returned `peerKey` stays null
 * until `revealPeer` is true (the post-game "show both keys" view).
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
  // "Has this seat found all its agents?" for BOTH seats — drives the
  // finished-player banners. The main load already pulls both key
  // columns (to pick the caller's), so the partner's flag is free to
  // derive here. We return two booleans rather than the peer key not
  // for secrecy (the trust model doesn't care — see CLAUDE.md) but
  // because `peerKey` has a dedicated terminal-gated role feeding the
  // board's post-game reveal; the banner just needs "are they done?".
  const [myAgentsDone, setMyAgentsDone] = useState(false)
  const [peerAgentsDone, setPeerAgentsDone] = useState(false)
  // `load` stashes the partner's key into `fetchedPeerKey`, tagged with
  // the gameId+userId it was loaded for. The publicly-returned `peerKey`
  // (derived below) is null unless the caller currently wants the peer
  // key AND the cached value matches the active game/user — this keeps
  // the reveal a pure derivation (no "clear peerKey in an effect body"
  // anti-pattern when revealPeer flips off) even though the key is now
  // loaded eagerly.
  const [fetchedPeerKey, setFetchedPeerKey] = useState<KeyLabel[] | null>(null)
  const [fetchedFor, setFetchedFor] = useState<string | null>(null)
  const peerKey =
    revealPeer && fetchedFor === `${gameId}:${userId}` ? fetchedPeerKey : null
  const [loading, setLoading] = useState(true)

  useRealtimeRefetch({
    tables: [
      { schema: 'codenamesduet', table: 'words', filter: `game_id=eq.${gameId}` },
      { schema: 'codenamesduet', table: 'guesses', filter: `game_id=eq.${gameId}` },
    ],
    channelPrefix: 'board',
    id: gameId,
    load: async ({ mounted }) => {
      // Seats + key cards are columns on codenamesduet.games (not a separate
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
        // `peerKey` above gates on it), so holding it in state during play
        // is invisible to the board — and the trust model doesn't treat
        // the FE as the secrecy boundary anyway (see CLAUDE.md).
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
      }
      setLoading(false)
    },
  })

  return { words, guesses, myKey, peerKey, myAgentsDone, peerAgentsDone, loading }
}
