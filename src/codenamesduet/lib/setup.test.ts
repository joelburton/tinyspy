// cs-unmet

/**
 * The word pools' two helpers: the labels every list of them is shown with, and
 * the gate that keeps Start shut until one is ticked.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_CODENAMESDUET_SETUP, listWordPoolLabels, wordPoolsError } from './setup'

describe('listWordPoolLabels', () => {
  it('names the chosen pools in pool order, whatever order they came in', () => {
    expect(listWordPoolLabels(['undercover', 'duet'])).toBe('Codenames Duet, Undercover (adult)')
  })

  it('is empty when none is chosen', () => {
    expect(listWordPoolLabels([])).toBe('')
  })
})

describe('wordPoolsError', () => {
  it('lets the default through', () => {
    expect(wordPoolsError(DEFAULT_CODENAMESDUET_SETUP)).toEqual({})
  })

  it('refuses no pool at all, under word_pools', () => {
    expect(wordPoolsError({ ...DEFAULT_CODENAMESDUET_SETUP, word_pools: [] })).toEqual({
      word_pools: 'Pick at least one word pool.',
    })
  })
})
