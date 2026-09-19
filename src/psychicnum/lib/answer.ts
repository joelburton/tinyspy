// cs-fixed-outcome-fix

import type { Outcome } from '@/common/outcomes/outcomes'

/**
 * Everything that can be SAID about a move in this game, as a closed set — and
 * **read as a list, it is the whole roster of what this game tells anybody.**
 *
 * Two halves, and the `_peer` suffix is which: an answer is about MY move, or
 * about somebody else's. The same event gets one of each, and they are
 * deliberately separate entries rather than one entry serving both — `hit` and
 * `hit_peer` say the same words today and repeating the line is the price of
 * being able to scan this type and know, per answer, who sees it.
 *
 * **What the split makes visible** is as much the point as what it separates:
 *
 *   - `hint` and `spoiler` answer with an EMPTY text, which is this type saying
 *     out loud that asking for one shows the actor nothing — the clue and the
 *     word arrive as rows and live in the event log, where they stay. A pill
 *     would say the same thing twice and then vanish. Their peers' twins do
 *     have words.
 *   - `found_peer` carries no word at all, and could not: in compete a racer
 *     may learn THAT an opponent found a secret and never which one. The leak
 *     is unrepresentable rather than merely avoided.
 */
export type Answer =
  // Each event and its peer twin, side by side: the `_peer` suffix says who
  // sees it, so what is worth ordering by is the EVENT — which is also what
  // puts an answer and its twin one line apart when they must agree.

  /** My correct guess. */
  | { answerType: 'hit'; word: string }
  /** A coop teammate's, on the board we share. */
  | { answerType: 'hit_peer'; word: string }

  /** My wrong guess. */
  | { answerType: 'miss'; word: string }
  /** A coop teammate's. */
  | { answerType: 'miss_peer'; word: string }

  /** I asked for a clue. Nothing is shown: the clue is a row, and the event log
   *  is where it belongs — a pill would say it twice and then vanish. */
  | { answerType: 'hint' }
  /** A coop teammate asked for one. The clue itself is not repeated. */
  | { answerType: 'hint_peer' }

  /** I asked for a secret word. Nothing is shown, for the same reason — and a
   *  spoiler you paid for should stay readable rather than flash past. */
  | { answerType: 'spoiler' }
  /** A coop teammate had one handed to them — never WHICH. */
  | { answerType: 'spoiler_peer' }

  /** A compete opponent's secrets-found count ticked up. It has no twin of
   *  mine: this is not a row (RLS shows one racer nothing of another's) but a
   *  public count, and NO word, ever — which one they found is the thing it
   *  must not say. */
  | { answerType: 'found_peer' }

  /** Refused here: the board does not hold that word. */
  | { answerType: 'not_on_board' }
  /** Refused here: this board has already decided that word. */
  | { answerType: 'already_guessed' }

/** What an answer READS AS: the color it wears, and the words it says. */
export type AnswerMessage = {
  outcome: Outcome
  /** The sentence. A pill shows it alone; a peer line puts a player's name and
   *  color in front of it ("● moth Wrong: BERRY"). **Empty means nothing is
   *  shown** — the answer's only job is its outcome, which the event log draws
   *  as the row's bar. */
  text: string
}

/**
 * How an answer reads — **the one place this game decides that.**
 *
 * Every surface that says anything about a move reads this: the below-board
 * pill, the event-log bar, a teammate's line in the header. Deriving it per
 * surface is exactly how they drift, and they had — the pill took its color
 * from the RPC's envelope while the log and the peer line took theirs from a
 * table here, so one event had two sources and three hand-written sentences.
 *
 * The RPCs deliberately send no `outcome` and no `message` for the answers they
 * carry ([doc.md](../doc.md) → RPCs): `data` carries the FACT — `verdict`,
 * `result` — and a call site turns that fact into an `Answer`. What a fact
 * reads as is presentation, and presentation lives here.
 *
 * The readings, which are this game's rather than the vocabulary's:
 *
 *   - the budget is what you spend to play, so a miss spends some of it for
 *     nothing: red, not news.
 *   - a hint is a nudge you asked for, free here but still neither good nor bad
 *     play: `warning`, as a hint is in every game. A spoiler hands over the
 *     secret itself, which ends the hunt for it — that is a loss, and it wears
 *     red.
 *   - a word not on the board costs the entry, not the budget. It is still the
 *     move going wrong, so it reads like one.
 *   - a word already decided costs nothing at all: you are looking at the
 *     answer. `warning`, the same reading the word games give a repeat.
 *   - an opponent finding a secret is GREEN, like a hit, so green means "a
 *     secret was found" in both modes rather than teaching a compete-only color.
 *
 * An answer and its `_peer` twin always agree about the outcome — one event is
 * one color whoever is looking — and differ only in the words.
 */
export function answerMessage(answer: Answer): AnswerMessage {
  // In the union's order — each event beside its twin — rather than
  // alphabetically, so a pair that has to agree is read as a pair.

  switch (answer.answerType) {
    // The word is uppercased HERE so every surface says it alike, and it LEADS
    // the line: the label carries the outcome, so the header's ~26 phone
    // characters belong to the word rather than to a sentence around it.
    case 'hit':
      return { outcome: 'won', text: `Correct: ${answer.word.toUpperCase()}` }
    case 'hit_peer':
      return { outcome: 'won', text: `Correct: ${answer.word.toUpperCase()}` }

    case 'miss':
      return { outcome: 'lost', text: `Wrong: ${answer.word.toUpperCase()}` }
    case 'miss_peer':
      return { outcome: 'lost', text: `Wrong: ${answer.word.toUpperCase()}` }

    case 'hint':
      return { outcome: 'warning', text: '' }
    case 'hint_peer':
      return { outcome: 'warning', text: 'got hint' }

    case 'spoiler':
      return { outcome: 'lost', text: '' }
    case 'spoiler_peer':
      return { outcome: 'lost', text: 'revealed word' }

    case 'found_peer':
      return { outcome: 'won', text: 'guessed a word' }

    case 'not_on_board':
      return { outcome: 'lost', text: 'Not on the board' }
    case 'already_guessed':
      return { outcome: 'warning', text: 'Already guessed' }
  }
}

/** The columns of a `psychicnum.events` row that say what it WAS. Narrower
 *  than `EventRow` on purpose: nothing here may reach for an author, an id or a
 *  timestamp, which belong to the surface drawing the row. */
type LoggedEvent = {
  kind: 'guess' | 'hint' | 'spoiler'
  is_correct: boolean
  word: string
}

/**
 * What COLOR a logged row is — for the event log, which writes its own words.
 *
 * A log phrases things its own way (the word and the verdict are two columns
 * there, not a sentence), so it takes the outcome and nothing else. That is
 * also why it needs no viewer: an answer and its `_peer` twin always agree
 * about the outcome, so whose row it is cannot change the answer to this.
 *
 * `kind` is read FIRST, and this is the trap it exists for: a hint and a
 * spoiler row are both written `is_correct = true`, so asking about the verdict
 * before asking what the row IS would read either as a correct guess.
 */
export function eventToOutcome(row: LoggedEvent): Outcome {
  if (row.kind === 'hint') return answerMessage({ answerType: 'hint' }).outcome
  if (row.kind === 'spoiler') return answerMessage({ answerType: 'spoiler' }).outcome
  return answerMessage({ answerType: row.is_correct ? 'hit' : 'miss', word: row.word }).outcome
}

/**
 * How a logged row reads when it is SOMEBODY ELSE'S — the `_peer` twin of
 * whatever it was, with the words that go in the header line.
 *
 * The caller has already established that the row is not the viewer's own (its
 * own line is the local slot's), which is why no viewer is passed: every answer
 * from here is a peer one by construction, and a spoiler therefore cannot be
 * given the words that name a word.
 */
export function peerAnswerMessage(row: LoggedEvent): AnswerMessage {
  if (row.kind === 'hint') return answerMessage({ answerType: 'hint_peer' })
  if (row.kind === 'spoiler') return answerMessage({ answerType: 'spoiler_peer' })
  return answerMessage({
    answerType: row.is_correct ? 'hit_peer' : 'miss_peer',
    word: row.word,
  })
}
