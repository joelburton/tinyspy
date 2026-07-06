import { describe, expect, it } from 'vitest'
import { nextMarkState } from './marks'

describe('nextMarkState', () => {
  it('cycles none → break → hyphen → none', () => {
    expect(nextMarkState(undefined)).toBe('break')
    expect(nextMarkState('break')).toBe('hyphen')
    expect(nextMarkState('hyphen')).toBeNull()
  })
})
