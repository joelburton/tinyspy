// cs-unmet

import { useMark, type Mark } from '@/common/board-marks/useMark'
import { WORD_ANSWER_MS } from '@/common/board-marks/feedbackTiming'
import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { useShowPeerFeedback } from '@/common/feedback/useShowPeerFeedback'
import { ANSWER_OUTCOME, answerOf } from '../lib/answer'
import type { GGameData, GPeerWordMark } from '../types'

/**
 * In coop the stack is shared, so a teammate's move changes MY board: say so in
 * the header slot, once per new row of the log, and mark a played word where it
 * happened — on THEIR tiles, not in my entry row, which is my own workspace.
 * Compete says nothing here — a rival's rows are withheld mid-race, and their
 * clear ends the race, which the ending's message says.
 *
 * The mark is two beats in the order every board uses: the attention flash says
 * WHERE, and once it has faded the answer's own color says WHAT. It carries the
 * ANSWER, not a color, because two things downstream need it: the outcome the
 * tiles wear, and whether the tiles are held on the board at all (only an
 * accepted word took them).
 *
 * Hands back the mark, for the board column to draw.
 */
export function useShowTeammateMoves(
  gd: GGameData,
  globalFeedbackSlot: FeedbackSlot,
): Mark<GPeerWordMark> | null {
  const [peerMark, showPeerMark] = useMark<GPeerWordMark>(WORD_ANSWER_MS)

  useShowPeerFeedback({
    enabled: gd.coop,
    items: gd.events,
    keyOf: (e) => String(e.id),
    messageFor: (e) => {
      if (e.by === gd.me) return null
      if (e.kind === 'hint') return FeedbackMessage.peer(e.by, ANSWER_OUTCOME.hint, 'revealed a hint')
      if (e.kind === 'spoiler') return FeedbackMessage.peer(e.by, ANSWER_OUTCOME.spoiler, 'took a spoiler')
      // A word: ALSO mark its tiles on the board. Safe to fire here — the hook
      // calls messageFor exactly once per NEW row, inside its effect.
      const answer = answerOf(e)
      showPeerMark({ tileIds: e.tiles.map((t) => t.id), answer }, { attention: true })
      const word = e.word!.toUpperCase()
      // "tried X" (not "tried X — not a word"): the header fits ~26 chars on a
      // phone and ellipsizes silently, and the outcome already says it failed.
      return FeedbackMessage.peer(
        e.by,
        ANSWER_OUTCOME[answer],
        answer === 'accepted' ? `found ${word}` : `tried ${word}`,
      )
    },
    globalFeedbackSlot,
  })

  return peerMark
}
