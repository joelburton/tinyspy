// cs-unmet

import { useEffect, useMemo, useState } from 'react'
import { useMark, type Mark } from '@/common/board-marks/useMark'
import { NO_TIMER } from '@/common/board-marks/feedbackTiming'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { answerMessage } from '../lib/answer'
import { BOARD_SIZE, joinSides, rejectReason } from '../lib/board'
import type { GGameData } from '../types'

/**
 * What `submit_word` answers. TWO `ok`s — the word landed, or it landed and
 * covered the twelve — and the `result` that names the case is all there is:
 * what the word did, the page reads from the blobs.
 */
type WordAnswer = { result: 'accepted' | 'solved' }

/** What `undo_word` answers: one `ok`, its result alone. */
type UndoAnswer = { result: 'undone' }

/**
 * The move's trips to the server: a word appended to my chain, or the chain's
 * last word taken back. Each resolves to whether it landed, so the typed word
 * (`useTypedWord`) empties only then.
 *
 * A word the frontend can refuse never leaves: `rejectReason` judges it in the
 * server's own words, the pill says so, and the board shakes the word
 * (`refused`). What still reaches the server and comes back refused is the
 * shared chain moving under you — coop is free-for-all — or the game ending,
 * a concede landing, the turn moving. Races, all of them, and the word stays
 * in the entry: it may well be legal again next second.
 *
 * `inFlight` is the one guard: a word or an undo still out refuses another
 * until it answers.
 */
export function useChainMove(gd: GGameData, localFeedbackSlot: FeedbackSlot): {
  sendWord: (word: string) => Promise<boolean>
  // The chain strip's ×: take the last word back.
  removeLast: () => Promise<boolean>
  // The word just refused, until the next edit.
  refused: Mark<{ word: string }> | null
  clearRefused: () => void
  inFlight: boolean
  // The cap is spent and the board isn't covered: the only move left is
  // taking a word back.
  isChainFull: boolean
} {
  const chain = gd.me.board.words
  const maxWords = gd.me.maxWords
  const playable = useMemo(() => new Set(gd.puzzle.words.map((w) => w.word)), [gd.puzzle.words])
  // A word or an undo is with the server and has not answered.
  const [inFlight, setInFlight] = useState(false)

  // `NO_TIMER`, because nothing on a timer ends a refusal: it stands until the
  // next edit. The mark's `nonce` is what the board keys its letters on —
  // refusing the same word twice has to shake twice, and a CSS animation only
  // restarts on a new element. It is about the word AS SUBMITTED, so the next
  // edit ends it rather than the board comparing text: a refused ABD would
  // otherwise shake again on the way to ABDE.
  const [refused, showRefused, clearRefused] = useMark<{ word: string }>(NO_TIMER)

  async function sendWord(word: string): Promise<boolean> {
    if (inFlight) return false
    const bad = rejectReason(word, { sides: joinSides(gd.puzzle.tiles), chain, playable, maxWords })
    if (bad) {
      localFeedbackSlot.show(FeedbackMessage.result('lost', bad))
      showRefused({ word })
      return false
    }
    setInFlight(true)
    const res = await runRpc<WordAnswer>(
      db.rpc('submit_word', { p_game_id: gd.id, p_word: word }),
    )
    setInFlight(false)
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return false
    } else if (res.type === 'ok' && res.data.result === 'accepted') {
      clearRefused()
      const { outcome, text } = answerMessage({
        answerType: 'accepted',
        word,
        nWordsLeft: maxWords - (chain.length + 1),
      })
      if (text === '') localFeedbackSlot.dismiss()
      else localFeedbackSlot.show(FeedbackMessage.result(outcome, text))
      return true
    } else if (res.type === 'ok' && res.data.result === 'solved') {
      // The ending's message is about to arrive with the blob, so this says
      // nothing.
      clearRefused()
      localFeedbackSlot.dismiss()
      return true
    } else {
      reportUnhandled('submit_word', res)
      return false
    }
  }

  async function removeLast(): Promise<boolean> {
    if (inFlight) return false
    setInFlight(true)
    const res = await runRpc<UndoAnswer>(db.rpc('undo_word', { p_game_id: gd.id }))
    setInFlight(false)
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return false
    } else if (res.type === 'ok' && res.data.result === 'undone') {
      // The shortened chain arrives with the blob. Taking a word back is a
      // move, so it dismisses the last result like a keystroke.
      clearRefused()
      localFeedbackSlot.dismiss()
      return true
    } else {
      reportUnhandled('undo_word', res)
      return false
    }
  }

  // There is no legal move left but taking a word back, so the board and the
  // entry go inert rather than letting a player compose a word only to be
  // refused it — and the slot says so in the entry's place.
  const isChainFull = chain.length >= maxWords && gd.stateLineData.nCoveredLetters < BOARD_SIZE
  useEffect(function showChainFull() {
    if (!isChainFull) return
    const id = localFeedbackSlot.show(FeedbackMessage.note('Chain is full — remove a word'))
    return () => localFeedbackSlot.retract(id)
  }, [localFeedbackSlot, isChainFull])

  return { sendWord, removeLast, refused, clearRefused, inFlight, isChainFull }
}
