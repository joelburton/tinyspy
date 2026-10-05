// cs-unmet

import type { FeedbackSlot } from '@/common/feedback/feedbackSlotStore'
import { FeedbackMessage } from '@/common/feedback/FeedbackMessage'
import { reportUnhandled } from '@/common/supabase/dbEnvelope'
import { runRpc } from '@/common/supabase/dbResult'
import { db } from '../db'
import { ANSWER_OUTCOME } from './answer'
import { joinSides } from './board'
import { hintOrSpoilerPillText, makeNoSuggestionText } from './hintOrSpoiler'
import { isSuggestion, suggest } from './solve'
import type { GGameData } from '../types'

/** What `log_hint_or_spoiler` answers: one `ok`, echoing the row it wrote. */
type RungAnswer = {
  result: 'logged'
  kind: 'hint' | 'spoiler'
  word: string
}

/**
 * The hint ladder (coop only): a `hint` describes the next word on a shortest
 * path to covering the twelve, a `spoiler` hands it over. The search runs
 * HERE, over the board's own word list (lib/solve.ts); the server is told only
 * that a rung was taken, so the event log agrees with what happened.
 *
 * It searches the CLEAN words, not every word the board accepts: the accept
 * list carries crude, slur, slang and dialect words because the PLAYER may type
 * them, and a hint is the game speaking (docs/word-list.md → Which words a game
 * may use). Searching the accept list would let a spoiler answer "the word is
 * BITCH", which is precisely the asymmetry the two tiers exist for.
 *
 * ...UNLESS no word is clean, which is not a board — it's a broken derivation.
 * The flag comes from joining the board's words against `common.words`, so it
 * empties wholesale when those words aren't in the dictionary at all: a
 * synthetic test fixture, or a dictionary that was never imported. Refusing to
 * hint then tells the player "No words to play" about a board full of words,
 * which is a lie with no remedy. Falling back to every word keeps the feature
 * honest; the purity guarantee is worth less than truthfulness where nothing is
 * clean because nothing is known.
 *
 * The room left under the cap rides along, so the search can refuse to point
 * down a road the cap cuts off.
 */
export async function askForHintOrSpoiler(
  gd: GGameData,
  localFeedbackSlot: FeedbackSlot,
  kind: 'hint' | 'spoiler',
): Promise<void> {
  const chain = gd.me.board.words
  const words = gd.puzzle.words.map((w) => w.word)
  const cleanWords = gd.puzzle.words.filter((w) => w.clean).map((w) => w.word)
  const r = suggest(
    cleanWords.length > 0 ? cleanWords : words,
    joinSides(gd.puzzle.tiles),
    chain,
    gd.me.maxWords - chain.length,
  )

  if (!isSuggestion(r)) {
    // A `hint` like the answer it stands in for: the player asked, maybe
    // mid-word, and the reply holds the slot until they have read it and
    // pressed ×.
    localFeedbackSlot.show(FeedbackMessage.hint('warning', makeNoSuggestionText(r, chain, words)))
    return
  }

  // A `hint` leaves only by its ×, like every hint: it sits in the entry's
  // slot until the player has read it, and a keystroke can't take it away by
  // accident (docs/ui.md → Feedback pill).
  //
  // A failed log is shown, not swallowed: the event log keeps the hint's
  // CONTENT only when the write SUCCEEDS, so a not-ok goes up over the hint.
  // Nothing is lost by that: the answers are one race that only fires once
  // the game is over (a hint has nothing left to be for) and faults that mean
  // a broken client (Joel, 2026-09-01).
  localFeedbackSlot.show(
    FeedbackMessage.hint(ANSWER_OUTCOME[kind], hintOrSpoilerPillText(kind, r.word)),
  )
  const res = await runRpc<RungAnswer>(
    db.rpc('log_hint_or_spoiler', { p_game_id: gd.id, p_word_shown: r.word, p_kind: kind }),
  )
  if (res.type === 'not-ok') {
    localFeedbackSlot.show(FeedbackMessage.notOk(res))
    return
  } else if (res.type === 'ok' && res.data.result === 'logged') {
    // The row arrives in the event log with the next blob. The hint above
    // stands, which is the whole of what a successful log owes anyone.
    return
  } else {
    reportUnhandled('log_hint_or_spoiler', res)
    return
  }
}
