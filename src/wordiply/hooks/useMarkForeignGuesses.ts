// cs-unmet

import { useState } from 'react'
import { answerMessage } from '../lib/answer'
import type { GAnswerMark, GGameData } from '../types'

/**
 * Mark a teammate's word on the shared board as its row arrives: the attention
 * flash says where, and the answer's color says what. My own words are marked
 * by `useSubmitGuess` as I send them.
 *
 * Coop only: a race's boards are each racer's own. Only an accepted word is
 * marked — a teammate's reject fills no line. Quiet while a past row is open,
 * since the live board is not on screen.
 *
 * The comparison runs during RENDER — the newest accepted row's id against the
 * one last seen — so the mark and the line it is about land in the same commit.
 */
export function useMarkForeignGuesses({
  gd,
  isViewingHistory,
  answerMark,
}: {
  gd: GGameData
  isViewingHistory: boolean
  answerMark: Pick<GAnswerMark, 'show'>
}): void {
  // Rows are appended with rising ids, so the newest accepted row's id is
  // enough to say a word landed.
  const accepted = gd.events.filter((e) => e.valid)
  const newest = accepted.length > 0 ? accepted[accepted.length - 1]! : null
  const newestId = newest?.id ?? null
  // The newest accepted row already marked: a newer one is a word that just
  // landed.
  const [seenId, setSeenId] = useState(newestId)

  if (newestId !== seenId) {
    setSeenId(newestId)
    const isForeign = newest !== null && newest.by !== gd.me
    if (gd.coop && isForeign && !isViewingHistory) {
      answerMark.show(
        newest.word,
        answerMessage({ answerType: 'accepted' }).outcome,
        true)
    }
  }
}
