/**
 * Tests for useGridKeyboard — crosswords' single window keydown handler (a port of
 * crossplay's PuzzleView keys). It's one of the two most intricate untested hooks
 * (docs/test-audit.md → recommendation #8): a big key→action switch with several
 * guards (disabled / suspended / floating-panel / editable-field / modifier chords)
 * and a readOnly mode where navigation still works but writes are ignored.
 *
 * The pure cursor math (moveCursor/advanceAfterFill/jumpClue/…) is covered by
 * cursor.test.ts, so here we assert the DISPATCH: which key fires which callback,
 * and that the guards bail. State is fed through a ref of spies (the way PlayArea
 * rebuilds it each render); we dispatch real KeyboardEvents and check the spies.
 */

import { renderHook, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Cell } from '../lib/types'
import { useGridKeyboard, type GridKeyboard } from './useGridKeyboard'

/** ASCII → Cell[][] (same builder as cursor.test.ts): `#` block, `.` open, A–Z filled. */
function grid(rows: string[]): Cell[][] {
  let n = 0
  const raw = rows.map((row) => Array.from(row))
  const isBlock = (r: number, c: number) =>
    r < 0 || c < 0 || r >= raw.length || c >= raw[0]!.length || raw[r]![c] === '#'
  return raw.map((row, r) =>
    row.map((ch, c): Cell => {
      if (ch === '#') return { kind: 'block' }
      const startsAcross = isBlock(r, c - 1) && !isBlock(r, c + 1)
      const startsDown = isBlock(r - 1, c) && !isBlock(r + 1, c)
      const number = startsAcross || startsDown ? ++n : null
      return { kind: 'cell', number, fill: /[A-Z]/.test(ch) ? ch : null }
    }),
  )
}

function makeState(over: Partial<GridKeyboard> = {}): GridKeyboard {
  return {
    enabled: true,
    readOnly: false,
    suspended: false,
    grid: grid(['...', '...', '...']),
    cursor: { row: 0, col: 0, dir: 'across' },
    pencil: false,
    setCursor: vi.fn(),
    fillAt: vi.fn(() => null),
    isGiven: vi.fn(() => false),
    setCell: vi.fn(),
    onRebus: vi.fn(),
    onNumberJump: vi.fn(),
    onPeek: vi.fn(),
    clearPeek: vi.fn(),
    onMark: vi.fn(),
    onTogglePencil: vi.fn(),
    onCheck: vi.fn(),
    onReveal: vi.fn(),
    onShowNote: vi.fn(),
    onExplain: vi.fn(),
    onScratchpad: vi.fn(),
    ...over,
  }
}

let ref: { current: GridKeyboard }

function mount(state = makeState()) {
  ref = { current: state }
  renderHook(() => useGridKeyboard(ref))
  return ref.current
}

/** Dispatch a keydown at `target` (default window); the window listener sees it. */
function press(init: KeyboardEventInit, target: EventTarget = window) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('writing keys', () => {
  it('a letter fills the cursor cell (uppercased) and advances', () => {
    const s = mount()
    press({ key: 'a' })
    expect(s.setCell).toHaveBeenCalledWith(0, 0, 'A', false)
    expect(s.setCursor).toHaveBeenCalledTimes(1)
  })

  it('a letter passes the pencil flag through', () => {
    const s = mount(makeState({ pencil: true }))
    press({ key: 'q' })
    expect(s.setCell).toHaveBeenCalledWith(0, 0, 'Q', true)
  })

  it('a given cell is not written, but the cursor still slides off it', () => {
    const s = mount(makeState({ isGiven: () => true }))
    press({ key: 'a' })
    expect(s.setCell).not.toHaveBeenCalled()
    expect(s.setCursor).toHaveBeenCalledTimes(1)
  })

  it('Shift+Enter opens the rebus overlay on an editable cell', () => {
    const s = mount()
    press({ key: 'Enter', shiftKey: true })
    expect(s.onRebus).toHaveBeenCalledWith(0, 0)
  })

  it('bare Enter is a no-op', () => {
    const s = mount()
    press({ key: 'Enter' })
    expect(s.onRebus).not.toHaveBeenCalled()
    expect(s.setCursor).not.toHaveBeenCalled()
  })

  it('| and _ cycle the right/bottom edge marks', () => {
    const s = mount()
    press({ key: '|' })
    press({ key: '_' })
    expect(s.onMark).toHaveBeenNthCalledWith(1, 0, 0, 'right')
    expect(s.onMark).toHaveBeenNthCalledWith(2, 0, 0, 'bottom')
  })

  it('Backspace clears a filled cell in place (no retreat)', () => {
    const s = mount(makeState({ fillAt: () => 'X' }))
    press({ key: 'Backspace' })
    expect(s.setCell).toHaveBeenCalledWith(0, 0, null, false)
    expect(s.setCursor).not.toHaveBeenCalled()
  })

  it('Backspace on an empty cell retreats', () => {
    const s = mount(makeState({ fillAt: () => null }))
    press({ key: 'Backspace' })
    expect(s.setCursor).toHaveBeenCalledTimes(1)
  })
})

describe('navigation keys', () => {
  it('arrows and Tab and Space move the cursor', () => {
    const s = mount()
    press({ key: 'ArrowRight' })
    press({ key: 'Tab' })
    press({ key: ' ' })
    expect(s.setCursor).toHaveBeenCalledTimes(3)
  })

  it('Shift+Space peeks without moving; a later key clears the peek', () => {
    const s = mount()
    press({ key: ' ', shiftKey: true })
    expect(s.onPeek).toHaveBeenCalledWith(0, 0)
    expect(s.clearPeek).not.toHaveBeenCalled()
    press({ key: 'ArrowLeft' })
    expect(s.clearPeek).toHaveBeenCalled()
  })

  it('# opens the number-jump popup', () => {
    const s = mount()
    press({ key: '#' })
    expect(s.onNumberJump).toHaveBeenCalled()
  })
})

describe('⌥ shortcuts (keyed on physical code)', () => {
  it('⌥P toggles pencil; ⌥C checks letter; ⌥⇧C checks word', () => {
    const s = mount()
    press({ altKey: true, code: 'KeyP', key: 'π' })
    press({ altKey: true, code: 'KeyC', key: 'ç' })
    press({ altKey: true, code: 'KeyC', key: 'ç', shiftKey: true })
    expect(s.onTogglePencil).toHaveBeenCalled()
    expect(s.onCheck).toHaveBeenNthCalledWith(1, 'letter')
    expect(s.onCheck).toHaveBeenNthCalledWith(2, 'word')
  })

  it('⌥R reveals a letter, ⌥S opens the scratchpad', () => {
    const s = mount()
    press({ altKey: true, code: 'KeyR', key: '®' })
    press({ altKey: true, code: 'KeyS', key: 'ß' })
    expect(s.onReveal).toHaveBeenCalledWith('letter')
    expect(s.onScratchpad).toHaveBeenCalled()
  })

  it('⌥R is inert when reveal is unavailable (compete)', () => {
    const s = mount(makeState({ onReveal: null }))
    press({ altKey: true, code: 'KeyR', key: '®' })
    // no throw, nothing to assert beyond "did not crash" — the branch guards on null
    expect(s.setCell).not.toHaveBeenCalled()
  })
})

describe('readOnly (terminal): navigation works, writes are ignored', () => {
  it('ignores a letter, Backspace, rebus, and marks', () => {
    const s = mount(makeState({ readOnly: true }))
    press({ key: 'a' })
    press({ key: 'Backspace' })
    press({ key: 'Enter', shiftKey: true })
    press({ key: '|' })
    expect(s.setCell).not.toHaveBeenCalled()
    expect(s.onRebus).not.toHaveBeenCalled()
    expect(s.onMark).not.toHaveBeenCalled()
  })

  it('still moves the cursor with arrows', () => {
    const s = mount(makeState({ readOnly: true }))
    press({ key: 'ArrowDown' })
    expect(s.setCursor).toHaveBeenCalledTimes(1)
  })
})

describe('guards', () => {
  it('does nothing when disabled', () => {
    const s = mount(makeState({ enabled: false }))
    press({ key: 'a' })
    expect(s.setCell).not.toHaveBeenCalled()
  })

  it('does nothing while a modal has suspended the board', () => {
    const s = mount(makeState({ suspended: true }))
    press({ key: 'a' })
    expect(s.setCell).not.toHaveBeenCalled()
  })

  it('bails on a Meta/Ctrl chord', () => {
    const s = mount()
    press({ key: 'a', metaKey: true })
    expect(s.setCell).not.toHaveBeenCalled()
  })

  it('bails when focus is in an editable field — except Tab, which navigates clues', () => {
    const s = mount()
    const input = document.createElement('input')
    document.body.appendChild(input)
    press({ key: 'a' }, input)
    expect(s.setCell).not.toHaveBeenCalled()
    press({ key: 'Tab' }, input)
    expect(s.setCursor).toHaveBeenCalledTimes(1)
  })

  it('bails when the event originates inside a floating panel', () => {
    const s = mount()
    const panel = document.createElement('div')
    panel.setAttribute('data-floating-panel', '')
    const btn = document.createElement('button')
    panel.appendChild(btn)
    document.body.appendChild(panel)
    press({ key: 'a' }, btn)
    expect(s.setCell).not.toHaveBeenCalled()
  })
})
