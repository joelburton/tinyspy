// cs-unmet

import { useMemo } from 'react'
import { useMark } from '@/common/board-marks/useMark'
import { ATTENTION_FLASH_MS, WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import type { GAnswer, GGameData, GWordFlash } from '../types'
import { useCurrentWord } from './useCurrentWord'

/** What `submit_word` puts in `data`: `result` decides whether the tiles leave
 *  the board or come back. */
type WordAnswer = { result: 'accepted' | 'invalid' }

/**
 * The move: the word being built (`useCurrentWord`) and its trip to the server,
 * with the marks my own answer wears.
 *
 *   - an ACCEPTED word flashes in the entry slots for a beat (`flash`), its
 *     tiles held off the board until the blob has them gone;
 *   - a REFUSED word stays in the slots wearing the answer (`isRefused`), its
 *     tiles off the board until the beat ends — then they come home wearing the
 *     attention flash (`returnedTileIds`), so the eye follows them.
 *
 * The send runs as the Submit action's `run`, so the action's own `pending` is
 * the one in-flight guard: a word still with the server refuses another until
 * it answers.
 */
export function useWordMove(gd: GGameData, localFeedbackSlot: FeedbackSlot) {
  const onBoardIds = useMemo(
    () => new Set(gd.me.board.tiles.map((t) => t.id)),
    [gd.me.board.tiles],
  )
  const currentWord = useCurrentWord(onBoardIds)

  const [flash, showFlash, clearFlash] = useMark<GWordFlash>(WORD_ANSWER_MS)
  const [refusedWord, showRefusedWord] = useMark<GAnswer>(WORD_ANSWER_MS)
  const [returnedMark, flashReturned] = useMark<{ tileIds: string[] }>(ATTENTION_FLASH_MS)

  async function submitWord(tileIds: string[]): Promise<void> {
    const res = await runRpc<WordAnswer>(
      db.rpc('submit_word', { p_game_id: gd.id, p_tile_ids: tileIds.map(Number) }),
    )
    if (res.type === 'not-ok') {
      // The tiles come back to the board: nothing was cleared. A coop
      // teammate taking your tiles mid-flight is the one refusal a player
      // realistically meets here, and it isn't their mistake.
      currentWord.clearWord()
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'accepted') {
      currentWord.commitWord(tileIds)
      // The tiles clearing is the answer, so no message — and the move dismisses
      // the last result.
      localFeedbackSlot.dismiss()
      showFlash({ tileIds, outcome: answerMessage({ answerType: 'accepted' }).outcome })
      return
    } else if (res.type === 'ok' && res.data.result === 'invalid') {
      // NOT A WORD — an `ok`, because the rules were applied and no tile moved.
      const word = tileIds.map((id) => gd.puzzle.tilesById[id]!.letter).join('')
      const answer: GAnswer = { answerType: 'invalid', word }
      showRefusedWord(answer, {
        onEnd: () => {
          currentWord.clearWord()
          flashReturned({ tileIds })
        },
      })
      const { outcome, text } = answerMessage(answer)
      localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      return
    } else {
      reportUnhandled('submit_word', res)
      return
    }
  }

  return {
    currentWord,
    submitWord,
    flash: flash?.value ?? null,
    clearFlash,
    isRefused: refusedWord !== null,
    // The answer the slots wear while a refused word is still in them.
    refusedOutcome: refusedWord === null ? null : answerMessage(refusedWord.value).outcome,
    returnedTileIds: returnedMark?.value.tileIds ?? [],
  }
}
