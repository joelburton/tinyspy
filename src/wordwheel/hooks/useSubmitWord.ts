// cs-unmet

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import type { Outcome } from '@/common/outcomes/outcomes'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import { useMark, type Mark } from '@/common/board-marks/useMark'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { runRpc } from '@/common/supabase/dbResult'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { useFoundWordSubmit, type FoundWordSubmitApi } from '@/shared/found-words/useFoundWordSubmit'
import { db } from '../db'
import { answerMessage, answerOf } from '../lib/answer'
import { trimClaims, type Claim } from '../lib/spend'
import type { GFoundWord, GWord } from '../types'

/** What `wordwheel.submit_word` puts in `data`. All four mean the row landed:
 *  three classifications echoing the caller's own flags, plus `won` — the word
 *  crossed the target rank and ended the game. */
type SubmittedWord =
  | { result: 'accepted'; points: number }
  | { result: 'bonus'; points: number }
  | { result: 'pangram'; points: number }
  | { result: 'won'; points: number }
  | null

/** A refused word's mark: how many of each letter it used and the tiles it had
 *  clicked — the tiles it would have spent wear its answer and shake — and the
 *  outcome they wear. */
export type RefusedMark = Mark<{ counts: Map<string, number>; claims: readonly Claim[]; outcome: Outcome }>

/**
 * Submitting a word, and what the board says back.
 *
 * The shared engine (`useFoundWordSubmit`) owns the typed word, the dedup and
 * the optimistic accept; this hook supplies what the engine cannot know — the
 * board's words to judge a typed word against, the `submit_word` RPC, and what
 * each answer shows — and hands the column the typed word, `submit`, the
 * refused mark, and the word's CLAIMS.
 *
 * - **A word is judged here, not on the server.** The puzzle ships every legal
 *   word with its points and flags, so an accepted word answers at once and
 *   the RPC is a trusting submit in the background: `null` back to the engine
 *   says the row landed, and none of the server's four ok answers changes what
 *   the optimistic pill already says. A win arrives with the next blob like
 *   every other ending.
 * - **Every answer shows in the pill**, in `lib/answer.ts`'s words. A refused
 *   word also answers ON the board: the tiles it used shake and take the same
 *   outcome, so the two cannot disagree.
 * - **The claims ride with the word.** The wheel is a multiset: a letter may
 *   sit on two tiles, and a click says WHICH tile a use spends where a typed
 *   letter does not (`lib/spend.ts`). A claim lives exactly as long as its
 *   letter is in the word — a Backspace at the end takes it away, a submit or a
 *   recall drops them all — so the claims are held beside the word, here.
 */
export function useSubmitWord({
  gameId,
  words,
  foundWords,
  centerLetter,
  isMyTurn,
  localFeedbackSlot,
}: {
  gameId: string
  // The puzzle's words (`gd.puzzle.words`), required and bonus alike.
  words: readonly GWord[]
  // The finds I can see (`gd.foundWords`), the dedup source.
  foundWords: readonly GFoundWord[]
  centerLetter: string
  // The move is mine: false once the game is over, or I conceded a race the
  // others play on.
  isMyTurn: boolean
  localFeedbackSlot: FeedbackSlot
}): FoundWordSubmitApi & {
  refused: RefusedMark | null
  // The tiles the player CLICKED for the typed word, oldest first.
  claims: readonly Claim[]
  // A clicked tile: its letter joins the word, and the click claims that tile.
  addClickedLetter: (letter: string, ordinal: number) => void
} {
  // The board's words by word: a typed word is judged and scored against them.
  const wordsByWord = useMemo(() => new Map(words.map((w) => [w.word, w])), [words])

  const [refused, showRefused] =
    useMark<{ counts: Map<string, number>; claims: readonly Claim[]; outcome: Outcome }>(WORD_ANSWER_MS)

  // WHICH tile each use of a letter spends. A click claims the tile it landed
  // on; everything else falls to the render order (`lib/spend.ts`).
  const [claims, setClaims] = useState<Claim[]>([])

  const engine = useFoundWordSubmit({
    isMyTurn,
    minWordLength: 4,
    localFeedbackSlot,
    foundWords,
    lookup: (w) => wordsByWord.get(w) ?? null,
    send: async (entry) => {
      const res = await runRpc<SubmittedWord>(
        db.rpc('submit_word', {
          p_game_id: gameId,
          p_word: entry.word,
          p_points: entry.points,
          p_is_pangram: entry.pangram,
          p_is_bonus: entry.bonus,
        }),
      )
      if (res.type === 'not-ok') {
        return res
      } else if (res.type === 'ok' && res.data?.result === 'accepted') {
        return null
      } else if (res.type === 'ok' && res.data?.result === 'bonus') {
        return null
      } else if (res.type === 'ok' && res.data?.result === 'pangram') {
        return null
      } else if (res.type === 'ok' && res.data?.result === 'won') {
        return null
      } else {
        reportUnhandled('submit_word', res)
        return null
      }
    },
    onAnswer: (report) => {
      // The word's clicks, kept for the refusal below before they are dropped:
      // the engine has already emptied the box without going through `setWord`.
      const wordClaims = claims
      setClaims([])
      const { outcome, text } = answerMessage(answerOf(report, centerLetter))
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      if (report.answer === 'accepted') return
      const counts = new Map<string, number>()
      for (const ch of report.word) counts.set(ch, (counts.get(ch) ?? 0) + 1)
      showRefused({ counts, claims: wordClaims, outcome })
    },
  })

  const { word, setWord: setEngineWord } = engine

  // A letter typed or Backspaced at the END of the word only takes claims away,
  // never makes one: the player named no tile. Anything else — the recall, the
  // clear — is a different word, and none of its letters was picked off the
  // board.
  const setWord = useCallback<Dispatch<SetStateAction<string>>>(
    (next) => {
      const value = typeof next === 'string' ? next : next(word)
      const isEdit =
        (value.length === word.length + 1 && value.startsWith(word)) ||
        value === word.slice(0, -1)
      setClaims((c) => (isEdit ? trimClaims(c, value) : []))
      setEngineWord(next)
    },
    [setEngineWord, word],
  )

  const addClickedLetter = useCallback(
    (letter: string, ordinal: number) => {
      setClaims((c) => [...c, { letter, ordinal }])
      setEngineWord((prev) => prev + letter)
    },
    [setEngineWord],
  )

  return { ...engine, setWord, refused, claims, addClickedLetter }
}
