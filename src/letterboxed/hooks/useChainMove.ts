// cs-unmet

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMark, type Mark } from '@/common/board-marks/useMark'
import { NO_TIMER } from '@/common/board-marks/feedbackTiming'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { BOARD_SIZE, joinSides, rejectReason, tailLetter } from '../lib/board'
import type { GGameData } from '../types'

/**
 * What `submit_word` answers. TWO `ok`s — the word landed, or it landed and
 * covered the twelve. `result` names the case.
 */
type WordAnswer = {
  result: 'accepted' | 'solved'
  accepted: true
  letters_covered: number
  solved: boolean
}

/** What `undo_word` answers: one `ok`, naming the word taken back. */
type UndoAnswer = { result: 'undone'; word: string; letters_covered: number }

/**
 * The move: the word being built, and its trips to the server — a word
 * appended to my chain, or the chain's last word taken back.
 *
 * Only the letters the player added are held (`draft`); the word shown is the
 * chain's tail letter + `draft`, derived every render, so playing a word
 * re-seeds the entry with no effect and no stale state.
 *
 * A word the frontend can refuse never leaves: `rejectReason` judges it in the
 * server's own words, the pill says so, and the board shakes the word
 * (`refused`). What still reaches the server and comes back refused is the
 * shared chain moving under you — coop is free-for-all — or the game ending,
 * a concede landing, the turn moving. Races, all of them, and the draft stays
 * put: it may well be legal again next second.
 *
 * `inFlight` is the one guard: a word or an undo still out refuses another
 * until it answers.
 */
export function useChainMove(gd: GGameData, localFeedbackSlot: FeedbackSlot): {
  // The word in the entry: the tail letter it must start with, then the draft.
  word: string
  // How many of `word`'s letters are the carried-over tail, not the player's.
  seedLength: number
  // Every edit to the draft goes through here, so a refusal cannot outlive the
  // word it was about.
  editDraft: (next: string) => void
  // The word just refused, while it is still what is in the box.
  refused: Mark<{ word: string }> | null
  submit: () => Promise<void>
  // A board letter clicked: append it, or submit when it repeats the last.
  pick: (letter: string) => void
  // The chain strip's ×: take the last word back.
  removeLast: () => Promise<void>
  inFlight: boolean
  // The cap is spent and the board isn't covered: the only move left is
  // taking a word back.
  isChainFull: boolean
} {
  const chain = gd.me.board.words
  const sides = joinSides(gd.puzzle.tiles)
  const maxWords = gd.me.maxWords
  const playable = useMemo(() => new Set(gd.puzzle.words.map((w) => w.word)), [gd.puzzle.words])

  const [draft, setDraft] = useState('')
  const [inFlight, setInFlight] = useState(false)
  const seed = tailLetter(chain) ?? ''
  const word = seed + draft

  // `NO_TIMER`, because nothing on a clock ends a refusal: it stands until the
  // next edit. The mark's `nonce` is what the board keys its letters on —
  // refusing the same word twice has to shake twice, and a CSS animation only
  // restarts on a new element. It is about the word AS SUBMITTED, so the next
  // edit ends it rather than the board comparing text: a refused ABD would
  // otherwise shake again on the way to ABDE.
  const [refused, showRefused, clearRefused] = useMark<{ word: string }>(NO_TIMER)

  const editDraft = useCallback(
    (next: string) => {
      clearRefused()
      setDraft(next)
    },
    [clearRefused],
  )

  /** The entry back, empty, after a move landed. */
  function resetEntry() {
    setDraft('')
    clearRefused()
  }

  async function submit() {
    if (inFlight) return
    const bad = rejectReason(word, { sides, chain, playable, maxWords })
    if (bad) {
      localFeedbackSlot.show(FeedbackMessage.result('lost', bad))
      showRefused({ word })
      return
    }
    setInFlight(true)
    const res = await runRpc<WordAnswer>(
      db.rpc('submit_word', { p_game_id: gd.id, p_word: word }),
    )
    setInFlight(false)
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'accepted' && res.outcome !== null) {
      resetEntry()
      // The accepted word restates the cap: with no mobile status bar, "how
      // many words are left" has no ambient home on a phone, so every accepted
      // word says it. A cap-filling word says nothing: the chain-full note is
      // what the player needs to read then. The words-left count is this
      // surface's; the outcome is the server's.
      const wordsLeft = maxWords - (chain.length + 1)
      if (wordsLeft > 0) {
        localFeedbackSlot.show(
          FeedbackMessage.result(
            res.outcome,
            `${word.toUpperCase()} — ${wordsLeft} ${wordsLeft === 1 ? 'word' : 'words'} left`,
          ),
        )
      } else {
        localFeedbackSlot.dismiss()
      }
      return
    } else if (res.type === 'ok' && res.data.result === 'solved') {
      // The ending's message is about to arrive with the blob, so this says
      // nothing and only hands the entry back.
      resetEntry()
      localFeedbackSlot.dismiss()
      return
    } else {
      reportUnhandled('submit_word', res)
      return
    }
  }

  function pick(letter: string) {
    // A click is the next move, like a keystroke, and so is no longer the
    // word that was refused.
    localFeedbackSlot.dismiss()
    clearRefused()
    // Clicking the letter the word already ends with submits it (see Board.tsx
    // for why that is unambiguous).
    if (word.length > 0 && letter === word[word.length - 1]) {
      void submit()
      return
    }
    setDraft((d) => d + letter)
  }

  async function removeLast() {
    if (inFlight) return
    setInFlight(true)
    const res = await runRpc<UndoAnswer>(db.rpc('undo_word', { p_game_id: gd.id }))
    setInFlight(false)
    if (res.type === 'not-ok') {
      localFeedbackSlot.show(FeedbackMessage.notOk(res))
      return
    } else if (res.type === 'ok' && res.data.result === 'undone') {
      // The shortened chain arrives with the blob; all this owes the player is
      // the entry back — taking a word back is a move, so it dismisses the last
      // result like a keystroke.
      resetEntry()
      localFeedbackSlot.dismiss()
      return
    } else {
      reportUnhandled('undo_word', res)
      return
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

  return {
    word,
    seedLength: seed.length,
    editDraft,
    refused,
    submit,
    pick,
    removeLast,
    inFlight,
    isChainFull,
  }
}
