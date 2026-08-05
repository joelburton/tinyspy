import { describe, expect, it } from 'vitest'
import {
  DESKTOP_ROW_BUDGET_REM,
  MOBILE_ROW_BUDGET_REM,
  estimateChainRows,
} from './chainRows'

describe('estimateChainRows', () => {
  it('an empty chain is one row (the "No words yet" pill)', () => {
    expect(estimateChainRows([], DESKTOP_ROW_BUDGET_REM)).toBe(1)
  })

  it('an ordinary chain of short words stays within the base reservation', () => {
    // Four short words ≈ the solved screenshot that looked right at 1 row.
    expect(
      estimateChainRows(['resizes', 'swab', 'bug', 'grainy'], DESKTOP_ROW_BUDGET_REM),
    ).toBeLessThanOrEqual(2)
  })

  it('seven long words need more than the desktop base of two rows', () => {
    const chain = Array.from({ length: 7 }, (_, i) => `abcdefghij${i}`)
    expect(estimateChainRows(chain, DESKTOP_ROW_BUDGET_REM)).toBeGreaterThan(2)
  })

  it('the narrow mobile budget wraps sooner than the desktop one', () => {
    const chain = ['abcdefghij', 'jihgfedcba', 'abcdefghij2']
    expect(estimateChainRows(chain, MOBILE_ROW_BUDGET_REM)).toBeGreaterThanOrEqual(
      estimateChainRows(chain, DESKTOP_ROW_BUDGET_REM),
    )
  })
})
