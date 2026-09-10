// cs-unmet

/**
 * Tests for the generated key list: it shows the keys that are actually bound,
 * in the words they are called by right now, and it re-reads when a binding
 * comes or goes.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KeyList } from './KeyList'
import { useBoundAction, type ActionState } from './useBoundAction'

/** A page that binds a few things and shows the list, the way Help does:
 *  something with a key, something without, and something whose state varies. */
function Harness({ submitState = 'active' as ActionState }) {
  useBoundAction('act-submit', { run: () => undefined, describe: () => submitState })
  useBoundAction('act-help', { run: () => undefined, describe: () => 'active' })
  useBoundAction('act-shuffle', { run: () => undefined, describe: () => 'active' })
  return <KeyList />
}

describe('KeyList', () => {
  it('lists a bound action by its first key', () => {
    render(<Harness />)
    expect(screen.getByText('⌥Z')).toBeTruthy()
    expect(screen.getByText('Shuffle')).toBeTruthy()
  })

  it('leaves out an action with no key', () => {
    render(<Harness />)
    expect(screen.queryByText('Help')).toBeNull()
  })

  it('leaves out a hidden action', () => {
    render(<Harness submitState="hidden" />)
    expect(screen.queryByText('Submit')).toBeNull()
  })

  it('lists an action that is merely disabled — the key is still its key', () => {
    render(<Harness submitState="disabled" />)
    expect(screen.getByText('Submit')).toBeTruthy()
  })

  it('shows nothing at all when nothing with a key is bound', () => {
    const { container } = render(<KeyList />)
    expect(container.innerHTML).toBe('')
  })
})
