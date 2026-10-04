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
import { tracePath } from '../lib/boardTrace'
import type { GRefusedMark } from '../reactTypes'
import type { GBoard, GFoundWord, GWord } from '../types'

/** What `boggle.submit_word` puts in `data`. Both mean the row landed; they
 *  differ only by the bonus flag the caller sent. */
type SubmittedWord =
  | { result: 'accepted'; points: number }
  | { result: 'bonus'; points: number }
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
 *   word with its points, so an accepted word answers at once and the RPC is a
 *   trusting submit in the background: `null` back to the engine says the row
 *   landed. A win arrives with the next blob like every other ending.
 * - **Every answer shows in the pill**, in `lib/answer.ts`'s words. A refused
 *   word also answers ON the board: the tiles of a path that spells it shake
 *   and take the same outcome. A word that traces nowhere has no tiles, and
 *   the pill carries it alone.
 */
export function useSubmitWord({
  gameId,
  words,
  foundWords,
  board,
  minWordLength,
  isMyTurn,
  localFeedbackSlot,
}: {
  gameId: string
  // The puzzle's words (`gd.puzzle.words`), required and bonus alike.
  words: readonly GWord[]
  // The finds I can see (`gd.foundWords`), the dedup source.
  foundWords: readonly GFoundWord[]
  // The board as the tracer walks it — why a word missed, and which tiles to mark.
  board: GBoard
  minWordLength: number
  // The move is mine: false once the game is over, or I conceded a race the
  // others play on.
  isMyTurn: boolean
  localFeedbackSlot: FeedbackSlot
}): FoundWordSubmitApi & { refused: GRefusedMark | null } {
  // The board's words by word: a typed word is judged and scored against them.
  // boggle has no pangram, so every entry says so to the shared engine.
  const wordsByWord = useMemo(
    () => new Map(words.map((w) => [w.word, { ...w, pangram: false }])),
    [words],
  )

  const [refused, showRefused] = useMark<GRefusedMark['value']>(WORD_ANSWER_MS)

  const engine = useFoundWordSubmit({
    isMyTurn,
    minWordLength,
    localFeedbackSlot,
    foundWords,
    lookup: (w) => wordsByWord.get(w) ?? null,
    send: async (entry) => {
      const res = await runRpc<SubmittedWord>(
        db.rpc('submit_word', {
          p_game_id: gameId,
          p_word: entry.word,
          p_points: entry.points,
          p_is_bonus: entry.bonus,
        }),
      )
      if (res.type === 'not-ok') {
        return res
      } else if (res.type === 'ok' && res.data?.result === 'accepted') {
        return null
      } else if (res.type === 'ok' && res.data?.result === 'bonus') {
        return null
      } else {
        reportUnhandled('submit_word', res)
        return null
      }
    },
    onAnswer: (report) => {
      const { outcome, text } = answerMessage(answerOf(report, board))
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      if (report.answer === 'accepted') return
      const cells = tracePath(board, report.word)
      if (cells === null) return
      showRefused({ cells, outcome })
    },
  })

  return { ...engine, refused }
}
