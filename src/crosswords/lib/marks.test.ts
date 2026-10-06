// cs-unmet

import { describe, expect, it } from 'vitest'
import { getNextMark } from './marks'

describe('getNextMark', () => {
  it('cycles none → break → hyphen → none', () => {
    expect(getNextMark(undefined)).toBe('break')
    expect(getNextMark('break')).toBe('hyphen')
    expect(getNextMark('hyphen')).toBeNull()
  })
})
