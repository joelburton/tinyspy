import { describe, expect, it } from 'vitest'
import { tileColor } from './tileColor'

describe('tileColor', () => {
  it('maps the server codes to class keys', () => {
    expect(tileColor('g')).toBe('green')
    expect(tileColor('y')).toBe('yellow')
    expect(tileColor('x')).toBe('gray')
  })

  it('falls back to blank for unevaluated / absent / unknown codes', () => {
    expect(tileColor(undefined)).toBe('blank')
    expect(tileColor('')).toBe('blank')
    expect(tileColor('.')).toBe('blank')
    expect(tileColor('?')).toBe('blank')
  })
})
