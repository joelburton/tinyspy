// cs-met-codenamesduet

/**
 * `lib/answer.ts` — what this game says, and which of it holds:
 *
 *   1. every answer has its words and outcome, walked over the union so a new
 *      member cannot go unsaid;
 *   2. `turnAnswer` names what the PARTNER is doing from the phase, and says
 *      nothing in sudden death or once the game is over.
 */
import { describe, expect, it } from 'vitest'
import { answerMessage, turnAnswer, type Answer } from './answer'

const EVERY: Array<[Answer['answerType'], string]> = [
  ['writing_clue_peer', 'writing clue'],
  ['guessing_peer', 'guessing'],
  ['waiting_for_clue_peer', 'waiting for clue'],
  ['waiting_for_you_peer', 'waiting for you'],
]

describe('answerMessage', () => {
  it.each(EVERY)('%s reads "%s", neutral', (answerType, text) => {
    expect(answerMessage({ answerType })).toEqual({ outcome: 'neutral', text })
  })
})

describe('turnAnswer', () => {
  const live = { inSuddenDeath: false, gameOver: false }

  it('before the clue: my partner writes it, or waits for mine', () => {
    expect(turnAnswer({ ...live, isGuessPhase: false, isClueGiver: false }))
      .toEqual({ answerType: 'writing_clue_peer' })
    expect(turnAnswer({ ...live, isGuessPhase: false, isClueGiver: true }))
      .toEqual({ answerType: 'waiting_for_clue_peer' })
  })

  it('after the clue: my partner guesses from mine, or waits for my guesses', () => {
    expect(turnAnswer({ ...live, isGuessPhase: true, isClueGiver: true }))
      .toEqual({ answerType: 'guessing_peer' })
    expect(turnAnswer({ ...live, isGuessPhase: true, isClueGiver: false }))
      .toEqual({ answerType: 'waiting_for_you_peer' })
  })

  it('says nothing in sudden death, or once the game is over', () => {
    expect(turnAnswer({ isGuessPhase: false, isClueGiver: false, inSuddenDeath: true, gameOver: false })).toBeNull()
    expect(turnAnswer({ isGuessPhase: true, isClueGiver: true, inSuddenDeath: false, gameOver: true })).toBeNull()
  })
})
