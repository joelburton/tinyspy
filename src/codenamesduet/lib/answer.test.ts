// cs-blessed-codenamesduet

/**
 * `lib/answer.ts` — what this game says, and which of it holds:
 *
 *   1. every answer has its words and outcome, walked over the union so a new
 *      member cannot go unsaid;
 *   2. `turnAnswer` names what the PARTNER is doing from the phase, and says
 *      nothing in sudden death or once the game is over.
 */
import { describe, expect, it } from 'vitest'
import { answerMessage, turnAnswer } from './answer'
import type { GAnswer } from '../types'

const EVERY: Array<[GAnswer['answerType'], string, string]> = [
  ['writing_clue_peer', 'writing clue', 'neutral'],
  ['guessing_peer', 'guessing', 'neutral'],
  ['waiting_for_clue_peer', 'waiting for clue', 'neutral'],
  ['waiting_for_you_peer', 'waiting for you', 'neutral'],
  ['hint_peer', 'got hint', 'warning'],
  ['clue_ai', '', 'warning'],
]

describe('answerMessage', () => {
  it.each(EVERY)('%s reads "%s", %s', (answerType, text, outcome) => {
    expect(answerMessage({ answerType })).toEqual({ outcome, text })
  })
})

describe('turnAnswer', () => {
  const live = { suddenDeath: false, isGameEnded: false }

  it('before the clue: my partner writes it, or waits for mine', () => {
    expect(turnAnswer({ ...live, isClueIn: false, isClueGiver: false }))
      .toEqual({ answerType: 'writing_clue_peer' })
    expect(turnAnswer({ ...live, isClueIn: false, isClueGiver: true }))
      .toEqual({ answerType: 'waiting_for_clue_peer' })
  })

  it('after the clue: my partner guesses from mine, or waits for my guesses', () => {
    expect(turnAnswer({ ...live, isClueIn: true, isClueGiver: true }))
      .toEqual({ answerType: 'guessing_peer' })
    expect(turnAnswer({ ...live, isClueIn: true, isClueGiver: false }))
      .toEqual({ answerType: 'waiting_for_you_peer' })
  })

  it('says nothing in sudden death, or once the game is over', () => {
    expect(turnAnswer({ isClueIn: false, isClueGiver: false, suddenDeath: true, isGameEnded: false })).toBeNull()
    expect(turnAnswer({ isClueIn: true, isClueGiver: true, suddenDeath: false, isGameEnded: true })).toBeNull()
  })
})
