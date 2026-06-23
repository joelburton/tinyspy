import { describe, expect, it } from 'vitest'
import { colorRank, tileColor } from './colors'

describe('tileColor', () => {
  it('maps server color codes to class keys', () => {
    expect(tileColor('g')).toBe('green')
    expect(tileColor('y')).toBe('yellow')
    expect(tileColor('x')).toBe('gray')
  })

  it('falls back to blank for anything else', () => {
    expect(tileColor(undefined)).toBe('blank')
    expect(tileColor('')).toBe('blank')
    expect(tileColor('?')).toBe('blank')
  })
})

describe('colorRank', () => {
  it('orders green > yellow > gray > blank (for the keyboard merge)', () => {
    expect(colorRank('green')).toBeGreaterThan(colorRank('yellow'))
    expect(colorRank('yellow')).toBeGreaterThan(colorRank('gray'))
    expect(colorRank('gray')).toBeGreaterThan(colorRank('blank'))
  })
})
