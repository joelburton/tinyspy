// cs-fixed-outcome-fix

import { describe, it, expect } from 'vitest'
import { answerMessage, eventToOutcome, peerAnswerMessage, type Answer } from './answer'

/**
 * psychicnum's one presentation decision, both halves.
 *
 * `answerMessage` turns an answer into the words and the color every surface
 * shows; `eventToOutcome` and `peerAnswerMessage` are the two ways a logged row asks
 * it — the log wants the color alone, a teammate's header line wants the peer
 * words. The table in the middle walks every member of the union, which is the
 * point of the file: the pill, the log bar and the header line all read one
 * function, so a word or a color changed here changes in all three — and a new
 * answer nobody gave words to is a compile error in `answerMessage` rather than
 * a blank pill.
 *
 * The SQL half is pinned in `supabase/tests/psychicnum/gameplay_test.sql`,
 * which asserts the RPCs answer with `data` and NO outcome. That is the other
 * half of this arrangement, and what makes this file the only place the outcome
 * lives.
 */
const row = (o: Partial<{ kind: 'guess' | 'hint' | 'spoiler'; is_correct: boolean; word: string }> = {}) =>
  ({ kind: 'guess' as const, is_correct: false, word: 'berry', ...o })

describe('answerMessage', () => {
  it('uppercases the word and leads with it', () => {
    expect(answerMessage({ answerType: 'hit', word: 'apple' }).text).toBe('Correct: APPLE')
    expect(answerMessage({ answerType: 'miss', word: 'berry' }).text).toBe('Wrong: BERRY')
  })

  // The asymmetry the split exists to show: asking for a hint or a spoiler
  // tells the ACTOR nothing — the clue and the word are rows, and the log is
  // where they belong — while a teammate's line has words for both.
  it('says nothing for my own hint or spoiler, and something for a peer’s', () => {
    expect(answerMessage({ answerType: 'hint' }).text).toBe('')
    expect(answerMessage({ answerType: 'spoiler' }).text).toBe('')
    expect(answerMessage({ answerType: 'hint_peer' }).text).toBe('got hint')
    expect(answerMessage({ answerType: 'spoiler_peer' }).text).toBe('revealed word')
  })

  // The rule this game must not break: in compete you learn THAT an opponent
  // found a secret, never which. The answer for it carries no word, so no call
  // site can leak one by passing the wrong thing.
  it('never names a word for an opponent’s find', () => {
    const m = answerMessage({ answerType: 'found_peer' })
    expect(m.text).toBe('guessed a word')
    expect(m.outcome).toBe('won')
  })

  // One event is one color whoever is looking, which is what lets a pair differ
  // in words alone — and what lets `eventToOutcome` skip the viewer entirely.
  // Green also means "a secret was found" in BOTH modes, so a player carries
  // one color-meaning rather than a compete-only one.
  it('gives every pair, and the compete find, one color', () => {
    const same = (a: Answer, b: Answer) =>
      expect(answerMessage(a).outcome).toBe(answerMessage(b).outcome)
    same({ answerType: 'hit', word: 'apple' }, { answerType: 'hit_peer', word: 'apple' })
    same({ answerType: 'miss', word: 'berry' }, { answerType: 'miss_peer', word: 'berry' })
    same({ answerType: 'hint' }, { answerType: 'hint_peer' })
    same({ answerType: 'spoiler' }, { answerType: 'spoiler_peer' })
    same({ answerType: 'found_peer' }, { answerType: 'hit', word: 'apple' })
  })

  // Every member, with its color and its words — one table to read them from,
  // which is what the three surfaces now agree about.
  const CASES: [Answer, string, string][] = [
    [{ answerType: 'hit', word: 'apple' }, 'won', 'Correct: APPLE'],
    [{ answerType: 'hit_peer', word: 'apple' }, 'won', 'Correct: APPLE'],
    [{ answerType: 'miss', word: 'berry' }, 'lost', 'Wrong: BERRY'],
    [{ answerType: 'miss_peer', word: 'berry' }, 'lost', 'Wrong: BERRY'],
    [{ answerType: 'hint' }, 'warning', ''],
    [{ answerType: 'hint_peer' }, 'warning', 'got hint'],
    [{ answerType: 'spoiler' }, 'lost', ''],
    [{ answerType: 'spoiler_peer' }, 'lost', 'revealed word'],
    [{ answerType: 'found_peer' }, 'won', 'guessed a word'],
    [{ answerType: 'not_on_board' }, 'lost', 'Not on the board'],
    [{ answerType: 'already_guessed' }, 'warning', 'Already guessed'],
  ]

  it.each(CASES)('%j reads %s: %s', (answer, outcome, text) => {
    expect(answerMessage(answer)).toEqual({ outcome, text })
  })

  it('has a case for every answer in the union', () => {
    // The union has no runtime form, so its membership is asserted against this
    // table: adding a member without a row here fails, and `answerMessage`'s
    // switch fails to compile — the pair is what keeps them together.
    const types = new Set(CASES.map(([a]) => a.answerType))
    expect(types.size).toBe(CASES.length)
    expect(types).toEqual(new Set([
      'hit', 'hit_peer', 'miss', 'miss_peer', 'hint', 'hint_peer',
      'spoiler', 'spoiler_peer', 'found_peer', 'not_on_board', 'already_guessed',
    ]))
  })
})

describe('eventToOutcome', () => {
  // kind before is_correct: a hint and a spoiler row are both written
  // `is_correct = true`, so asking about the verdict first reads either as a
  // hit — and a spoiler would go green where it must be red.
  it('reads kind before is_correct', () => {
    expect(eventToOutcome(row({ kind: 'hint', is_correct: true, word: 'a fruit' }))).toBe('warning')
    expect(eventToOutcome(row({ kind: 'spoiler', is_correct: true, word: 'apple' }))).toBe('lost')
  })

  it('splits a guess on its verdict', () => {
    expect(eventToOutcome(row({ is_correct: true, word: 'apple' }))).toBe('won')
    expect(eventToOutcome(row({ is_correct: false, word: 'berry' }))).toBe('lost')
  })

  // It takes no viewer, and this is what makes that safe: a row is the same
  // color to everyone, so the log needs to know only what the row WAS.
  it('answers what the pair agrees on, for every kind', () => {
    for (const r of [
      row({ is_correct: true, word: 'apple' }),
      row({ is_correct: false, word: 'berry' }),
      row({ kind: 'hint', is_correct: true, word: 'a fruit' }),
      row({ kind: 'spoiler', is_correct: true, word: 'apple' }),
    ]) {
      expect(eventToOutcome(r)).toBe(peerAnswerMessage(r).outcome)
    }
  })
})

describe('peerAnswerMessage', () => {
  // Its caller has already dropped the viewer's own rows, so every answer from
  // here is a `_peer` one by construction — which is what keeps a spoiler from
  // being given the words that name a word.
  it('gives a teammate’s row the peer words', () => {
    expect(peerAnswerMessage(row({ is_correct: true, word: 'apple' })))
      .toEqual({ outcome: 'won', text: 'Correct: APPLE' })
    expect(peerAnswerMessage(row({ kind: 'hint', is_correct: true, word: 'a fruit' })))
      .toEqual({ outcome: 'warning', text: 'got hint' })
    expect(peerAnswerMessage(row({ kind: 'spoiler', is_correct: true, word: 'apple' })))
      .toEqual({ outcome: 'lost', text: 'revealed word' })
  })

  it('never repeats a hint’s clue or a spoiler’s word', () => {
    expect(peerAnswerMessage(row({ kind: 'spoiler', is_correct: true, word: 'apple' })).text)
      .not.toContain('APPLE')
    expect(peerAnswerMessage(row({ kind: 'hint', is_correct: true, word: 'a fruit' })).text)
      .not.toContain('fruit')
  })
})
