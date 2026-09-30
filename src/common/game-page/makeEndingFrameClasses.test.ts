// cs-unmet

/** Which frame an ended board wears. */
import { describe, expect, it } from 'vitest'
import shared from './playArea.module.css'
import { makeEndingFrameClasses } from './makeEndingFrameClasses'

describe('makeEndingFrameClasses', () => {
  it('draws no frame while the game is played', () => {
    expect(makeEndingFrameClasses(null, false)).toBeNull()
  })

  it('draws the frame in the ending\'s outcome', () => {
    expect(makeEndingFrameClasses('won', false)).toBe(`${shared.endingFrame} ${shared.endingFrame_won}`)
    expect(makeEndingFrameClasses('lost', false)).toBe(`${shared.endingFrame} ${shared.endingFrame_lost}`)
  })

  it('draws a neutral ending in the neutral gray', () => {
    expect(makeEndingFrameClasses('neutral', false)).toBe(`${shared.endingFrame} ${shared.endingFrame_neutral}`)
  })

  it('gives the outline to the history viewer while a past turn is open', () => {
    expect(makeEndingFrameClasses('won', true)).toBeNull()
  })
})
