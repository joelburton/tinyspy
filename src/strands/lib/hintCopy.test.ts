import { describe, expect, it } from 'vitest'
import { hintShortfallText } from './hintCopy'

describe('hintShortfallText', () => {
  // The variant that matters: every earned hint is preceded by exactly this
  // state, so a stray "s" here would be the most-read typo in the game.
  it('is singular at one word to go', () => {
    expect(hintShortfallText(1)).toBe('1 more word needed for a hint')
  })

  it('is plural above one', () => {
    expect(hintShortfallText(2)).toBe('2 more words needed for a hint')
    expect(hintShortfallText(3)).toBe('3 more words needed for a hint')
  })
})
