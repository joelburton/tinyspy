// cs-unmet

import { useMemo } from 'react'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import { useMark } from '@/common/board-marks/useMark'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { runRpc } from '@/common/supabase/dbResult'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { useFoundWordSubmit, type FoundWordSubmitApi } from '@/shared/found-words/useFoundWordSubmit'
import { db } from '../db'
import { answerMessage, answerOf } from '../lib/answer'
import type { GFoundWord, GRefusedMark, GWord } from '../types'

/** What `spellingbee.submit_word` puts in `data`. All four mean the row landed:
 *  three classifications echoing the caller's own flags, plus `won` — the word
 *  crossed the target rank and ended the game. */
type SubmittedWord =
  | { result: 'accepted'; points: number }
  | { result: 'bonus'; points: number }
  | { result: 'pangram'; points: number }
  | { result: 'won'; points: number }
  | null

/**
 * Submitting a word, and what the board says back.
 *
 * The shared engine (`useFoundWordSubmit`) owns the typed word, the dedup and
 * the optimistic accept; this hook supplies what the engine cannot know — the
 * board's words to judge a typed word against, the `submit_word` RPC, and what
 * each answer shows — and hands the column the typed word, `submit`, and the
 * refused mark.
 *
 * - **A word is judged here, not on the server.** The puzzle ships every legal
 *   word with its points and flags, so an accepted word answers at once and
 *   the RPC is a trusting submit in the background: `null` back to the engine
 *   says the row landed, and none of the server's four ok answers changes what
 *   the optimistic pill already says. A win arrives with the next blob like
 *   every other ending.
 * - **Every answer shows in the pill**, in `lib/answer.ts`'s words. A refused
 *   word also answers ON the board: the tiles the word used shake and take the
 *   same outcome, so the two cannot disagree. The letters are captured here
 *   because the entry has already cleared by the time the answer shows.
 */
export function useSubmitWord({
  gameId,
  words,
  foundWords,
  allowedLetters,
  centerLetter,
  isMyTurn,
  localFeedbackSlot,
}: {
  gameId: string
  // The puzzle's words (`gd.puzzle.words`), required and bonus alike.
  words: readonly GWord[]
  // The finds I can see (`gd.foundWords`), the dedup source.
  foundWords: readonly GFoundWord[]
  // The board's letters — why a word missed.
  allowedLetters: ReadonlySet<string>
  centerLetter: string
  // The move is mine: false once the game is over, or I conceded a race the
  // others play on.
  isMyTurn: boolean
  localFeedbackSlot: FeedbackSlot
}): FoundWordSubmitApi & { refused: GRefusedMark | null } {
  // The board's words by word: a typed word is judged and scored against them.
  const wordsByWord = useMemo(() => new Map(words.map((w) => [w.word, w])), [words])

  const [refused, showRefused] = useMark<GRefusedMark['value']>(WORD_ANSWER_MS)

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
      const { outcome, text } = answerMessage(answerOf(report, { letters: allowedLetters, center: centerLetter }))
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      if (report.answer === 'accepted') return
      showRefused({ letters: new Set(report.word), outcome })
    },
  })

  return { ...engine, refused }
}
