// cs-unmet

import { useMemo, useState } from 'react'
import { useMark } from '@/common/board-marks/useMark'
import { ATTENTION_FLASH_MS, WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { ANSWER_OUTCOME } from '../lib/answer'
import type { GGameData, GWordFlash } from '../types'
import { useCurrentWord } from './useCurrentWord'

/** What `submit_word` puts in `data`: `result` decides whether the tiles leave
 *  the board or come back. */
type WordAnswer = { result: 'accepted' | 'invalid'; word: string }

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
 * `inFlight` is the one guard: a word still with the server refuses another
 * until it answers.
 */
export function useWordMove(gd: GGameData, localFeedbackSlot: FeedbackSlot) {
  const onBoardIds = useMemo(
    () => new Set(gd.me.board.tiles.map((t) => t.id)),
    [gd.me.board.tiles],
  )
  const currentWord = useCurrentWord(onBoardIds)
  const [inFlight, setInFlight] = useState(false)

  const [flash, showFlash, clearFlash] = useMark<GWordFlash>(WORD_ANSWER_MS)
  const [refusedWord, showRefusedWord] = useMark<string[]>(WORD_ANSWER_MS)
  const [returnedMark, flashReturned] = useMark<{ ids: string[] }>(ATTENTION_FLASH_MS)

  async function submitWord(tileIds: string[]): Promise<void> {
    if (inFlight) return
    setInFlight(true)
    const res = await runRpc<WordAnswer>(
      db.rpc('submit_word', { p_game_id: gd.id, p_tile_ids: tileIds.map(Number) }),
    )
    setInFlight(false)
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
      showFlash({ letters: [...res.data.word.toUpperCase()], outcome: ANSWER_OUTCOME.accepted })
      return
    } else if (res.type === 'ok' && res.data.result === 'invalid' && res.message !== null) {
      // NOT A WORD — an `ok`, because the rules were applied and no tile moved.
      // The server wrote the sentence, and named the word in it, because by the
      // time it is read the word has left the slots.
      showRefusedWord(tileIds, {
        onEnd: () => {
          currentWord.clearWord()
          flashReturned({ ids: tileIds })
        },
      })
      localFeedbackSlot.show(FeedbackMessage.result(res.outcome, res.message))
      return
    } else {
      reportUnhandled('submit_word', res)
      return
    }
  }

  return {
    currentWord,
    submitWord,
    inFlight,
    flash: flash?.value ?? null,
    clearFlash,
    isRefused: refusedWord !== null,
    returnedTileIds: returnedMark?.value.ids ?? [],
  }
}
