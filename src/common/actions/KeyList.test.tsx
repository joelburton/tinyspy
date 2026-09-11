// cs-blessed-actions

/**
 * Tests for the generated key list: it shows the keys that are actually bound,
 * in the words they are called by right now, and it re-reads when a binding
 * comes or goes.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

  it("shows the binding's words for this moment, not the registry's", () => {
    // A toggle's two faces are the case: the row says what pressing the key
    // would do right now, which is the same answer its button gives.
    function Renamed() {
      useBoundAction('act-shuffle', {
        run: () => undefined,
        describe: () => ({ state: 'active', label: 'Mix the tiles' }),
      })
      return <KeyList />
    }
    render(<Renamed />)
    expect(screen.getByText('⌥Z')).toBeTruthy()
    expect(screen.getByText('Mix the tiles')).toBeTruthy()
    expect(screen.queryByText('Shuffle')).toBeNull()
  })

  it('shows nothing at all when nothing with a key is bound', () => {
    const { container } = render(<KeyList />)
    expect(container.innerHTML).toBe('')
  })

  /**
   * One command offered twice is still one key. `act-end-game` really is bound
   * twice — by the game, and by the page for the pause overlay — and the two
   * are kept apart by describing themselves out of each other's way, which is
   * two files agreeing rather than something the list can rely on.
   */
  it('lists a command ONCE however many bindings offer it', () => {
    function Twice() {
      useBoundAction('act-end-game', { run: () => undefined, describe: () => 'active' })
      useBoundAction('act-end-game', { run: () => undefined, describe: () => 'active' })
      return <KeyList />
    }
    const reactSaid = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<Twice />)
    expect(screen.getAllByText('⌥⌫')).toHaveLength(1)
    // …and no duplicate-key complaint, which is what a second row would cost.
    expect(reactSaid).not.toHaveBeenCalled()
    reactSaid.mockRestore()
  })
})
