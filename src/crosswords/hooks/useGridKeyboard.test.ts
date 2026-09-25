// cs-unmet

/**
 * Tests for the crossword grid's keys — which keystroke does which thing, and
 * that the frozen board keeps navigating while nothing writes.
 *
 * The pure cursor math (moveCursor/advanceAfterFill/jumpClue/…) is covered by
 * cursor.test.ts, so what's asserted here is the DISPATCH: real keydowns on a
 * real dispatcher, against spies for the state the hook is handed.
 *
 * The gates are NOT retested here. They are the dispatcher's, not this hook's:
 * a modified chord never matches a pattern key, a keystroke aimed at chat never
 * reaches an action, and a floating panel with focus stops all of them.
 * `chord.test.ts` and `dispatcher.test.tsx` own that.
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useActionDispatcher } from '@/common/actions/dispatcher'
import type { Cell } from '../lib/types'
import { useGridKeyboard, type GridKeysOptions } from './useGridKeyboard'

// The two cursor helpers whose CALL is the assertion — which one a chord
// reaches, and with what delta — wrapped so the real math still runs.
const cursorLib = vi.hoisted(() => ({ jumpWordEdge: vi.fn(), jumpClue: vi.fn() }))
vi.mock('../lib/cursor', async (orig) => {
  const real = await orig<typeof import('../lib/cursor')>()
  cursorLib.jumpWordEdge.mockImplementation(real.jumpWordEdge)
  cursorLib.jumpClue.mockImplementation(real.jumpClue)
  return { ...real, jumpWordEdge: cursorLib.jumpWordEdge, jumpClue: cursorLib.jumpClue }
})

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

/** A real window keydown. Awaited: an action's run settles a microtask later. */
async function press(init: KeyboardEventInit) {
  await act(async () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  })
}

function setup(over: Partial<GridKeysOptions> = {}) {
  const spies = {
    setCursor: vi.fn(),
    fillAt: vi.fn(() => null as string | null),
    isGiven: vi.fn(() => false),
    setCell: vi.fn(),
    onRebus: vi.fn(),
    onNumberJump: vi.fn(),
    onPeek: vi.fn(),
    clearPeek: vi.fn(),
    onMark: vi.fn(),
  }
  const view = renderHook(() => {
    useActionDispatcher()
    return useGridKeyboard({
      enabled: true,
      isBoardInteractive: true,
      suspended: false,
      grid: grid(['...', '...', '...']),
      cursor: { row: 0, col: 0, dir: 'across' },
      pencil: false,
      peeking: false,
      ...spies,
      ...over,
    })
  })
  return { ...spies, view }
}

describe('writing keys', () => {
  it('a letter fills the cursor cell (uppercased) and advances', async () => {
    const s = setup()
    await press({ key: 'a' })
    expect(s.setCell).toHaveBeenCalledWith(0, 0, 'A', false)
    expect(s.setCursor).toHaveBeenCalledTimes(1)
    s.view.unmount()
  })

  it('a letter passes the pencil flag through', async () => {
    const s = setup({ pencil: true })
    await press({ key: 'q' })
    expect(s.setCell).toHaveBeenCalledWith(0, 0, 'Q', true)
    s.view.unmount()
  })

  it('a given cell is not written, but the cursor still slides off it', async () => {
    const s = setup({ isGiven: () => true })
    await press({ key: 'a' })
    expect(s.setCell).not.toHaveBeenCalled()
    expect(s.setCursor).toHaveBeenCalledTimes(1)
    s.view.unmount()
  })

  it('⇧Enter opens the rebus overlay on an editable cell', async () => {
    const s = setup()
    await press({ key: 'Enter', shiftKey: true })
    expect(s.onRebus).toHaveBeenCalledWith(0, 0)
    s.view.unmount()
  })

  it('bare Enter is a no-op — solvers hit it reflexively at a word’s end', async () => {
    const s = setup()
    await press({ key: 'Enter' })
    expect(s.onRebus).not.toHaveBeenCalled()
    expect(s.setCursor).not.toHaveBeenCalled()
    s.view.unmount()
  })

  it('| and _ cycle the right/bottom edge marks', async () => {
    const s = setup()
    await press({ key: '|' })
    await press({ key: '_' })
    expect(s.onMark).toHaveBeenNthCalledWith(1, 0, 0, 'right')
    expect(s.onMark).toHaveBeenNthCalledWith(2, 0, 0, 'bottom')
    s.view.unmount()
  })

  it('⌫ clears a filled cell in place (no retreat)', async () => {
    const s = setup({ fillAt: () => 'X' })
    await press({ key: 'Backspace' })
    expect(s.setCell).toHaveBeenCalledWith(0, 0, null, false)
    expect(s.setCursor).not.toHaveBeenCalled()
    s.view.unmount()
  })

  it('⌫ on an empty cell retreats', async () => {
    const s = setup({ fillAt: () => null })
    await press({ key: 'Backspace' })
    expect(s.setCursor).toHaveBeenCalledTimes(1)
    s.view.unmount()
  })

  it('⇧⌫ blanks the whole word — a different command from ⌫', async () => {
    const s = setup({ fillAt: () => 'X', cursor: { row: 0, col: 1, dir: 'across' } })
    await press({ key: 'Backspace', shiftKey: true })
    // The across word is the whole three-cell row.
    expect(s.setCell).toHaveBeenCalledTimes(3)
    s.view.unmount()
  })

  it('⌫ is two steps: a filled cell clears in place, an empty one retreats and clears where it lands', async () => {
    // Step one: the cursor cell holds a letter, so only that letter goes.
    const filled = setup({ fillAt: () => 'X', cursor: { row: 0, col: 1, dir: 'across' } })
    await press({ key: 'Backspace' })
    expect(filled.setCell).toHaveBeenCalledWith(0, 1, null, false)
    expect(filled.setCursor).not.toHaveBeenCalled()
    filled.view.unmount()

    // Step two: nothing here, so retreat one cell and clear THAT one — the
    // letter before is the one the solver is fixing.
    const empty = setup({ fillAt: () => null, cursor: { row: 0, col: 1, dir: 'across' } })
    await press({ key: 'Backspace' })
    expect(empty.setCell).toHaveBeenCalledWith(0, 0, null, false)
    expect(empty.setCursor).toHaveBeenCalledWith({ row: 0, col: 0, dir: 'across' })
    empty.view.unmount()
  })

  it('a HELD letter keeps filling; a held ⇧⌫ does not fire', async () => {
    // Repeat is per action: the entry keys declare it, a command does not.
    const s = setup({ fillAt: () => 'X' })
    await press({ key: 'a', repeat: true })
    expect(s.setCell).toHaveBeenCalledWith(0, 0, 'A', false)
    s.setCell.mockClear()
    await press({ key: 'Backspace', shiftKey: true, repeat: true })
    expect(s.setCell).not.toHaveBeenCalled()
    s.view.unmount()
  })

  it('Enter on a focused button is the button’s, and no grid action fires', async () => {
    const s = setup()
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    await act(async () => {
      button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }))
    })
    expect(s.setCell).not.toHaveBeenCalled()
    expect(s.setCursor).not.toHaveBeenCalled()
    expect(s.onRebus).not.toHaveBeenCalled()
    button.remove()
    s.view.unmount()
  })
})

describe('navigation keys', () => {
  it('arrows and Tab and Space move the cursor', async () => {
    const s = setup()
    await press({ key: 'ArrowRight' })
    await press({ key: 'Tab' })
    await press({ key: ' ' })
    expect(s.setCursor).toHaveBeenCalledTimes(3)
    s.view.unmount()
  })

  it('a HELD Tab keeps walking the clues', async () => {
    // Repeat is per action: a solver holds Tab the way they hold an arrow.
    const s = setup()
    await press({ key: 'Tab', repeat: true })
    expect(s.setCursor).toHaveBeenCalled()
    s.view.unmount()
  })

  it('⇧ + an arrow jumps to the word edge, where the bare arrow steps', async () => {
    cursorLib.jumpWordEdge.mockClear()
    const s = setup()
    await press({ key: 'ArrowRight', shiftKey: true })
    expect(cursorLib.jumpWordEdge).toHaveBeenCalledWith(
      expect.anything(), { row: 0, col: 0, dir: 'across' }, 'ArrowRight',
    )
    // …and the cursor lands on the far edge of the three-cell row.
    expect(s.setCursor).toHaveBeenCalledWith({ row: 0, col: 2, dir: 'across' })
    s.view.unmount()
  })

  it('⇧Tab walks the clues backward', async () => {
    cursorLib.jumpClue.mockClear()
    const s = setup()
    await press({ key: 'Tab', shiftKey: true })
    expect(cursorLib.jumpClue).toHaveBeenCalledWith(expect.anything(), { row: 0, col: 0, dir: 'across' }, -1)
    expect(s.setCursor).toHaveBeenCalledTimes(1)
    s.view.unmount()
  })

  it('⇧Space peeks without moving', async () => {
    const s = setup()
    await press({ key: ' ', shiftKey: true })
    expect(s.onPeek).toHaveBeenCalledWith(0, 0)
    expect(s.setCursor).not.toHaveBeenCalled()
    s.view.unmount()
  })

  it('while peeking, ANY key puts the peek away and still does its own job', async () => {
    const s = setup({ peeking: true })
    await press({ key: 'ArrowLeft' })
    expect(s.clearPeek).toHaveBeenCalledTimes(1)
    expect(s.setCursor).toHaveBeenCalled()
    // …a key no grid action wants included.
    await press({ key: 'Escape' })
    expect(s.clearPeek).toHaveBeenCalledTimes(2)
    s.view.unmount()
  })

  it('with no peek up, a stray key clears nothing', async () => {
    const s = setup()
    await press({ key: 'Escape' })
    expect(s.clearPeek).not.toHaveBeenCalled()
    s.view.unmount()
  })

  it('# opens the number-jump popup', async () => {
    const s = setup()
    await press({ key: '#' })
    expect(s.onNumberJump).toHaveBeenCalled()
    s.view.unmount()
  })
})

describe('an inert board (terminal): navigation works, writes are ignored', () => {
  it('ignores a letter, ⌫, the rebus and the marks', async () => {
    const s = setup({ isBoardInteractive: false })
    await press({ key: 'a' })
    await press({ key: 'Backspace' })
    await press({ key: 'Enter', shiftKey: true })
    await press({ key: '|' })
    expect(s.setCell).not.toHaveBeenCalled()
    expect(s.onRebus).not.toHaveBeenCalled()
    expect(s.onMark).not.toHaveBeenCalled()
    s.view.unmount()
  })

  it('still moves the cursor with arrows — reading back a solved grid is the point', async () => {
    const s = setup({ isBoardInteractive: false })
    await press({ key: 'ArrowDown' })
    expect(s.setCursor).toHaveBeenCalledTimes(1)
    s.view.unmount()
  })
})

describe('when there is nothing to work on', () => {
  it('is inert while disabled', async () => {
    const s = setup({ enabled: false })
    await press({ key: 'a' })
    await press({ key: 'ArrowRight' })
    expect(s.setCell).not.toHaveBeenCalled()
    expect(s.setCursor).not.toHaveBeenCalled()
    s.view.unmount()
  })

  it('is inert before the puzzle loads', async () => {
    const s = setup({ grid: null, cursor: null })
    await press({ key: 'a' })
    expect(s.setCell).not.toHaveBeenCalled()
    s.view.unmount()
  })

  // The field gate stops the letters by itself, but Tab is the one key an
  // action may claim from inside a field — so tabbing out of the number-jump
  // popup must not walk the clue underneath it.
  it('is inert while one of the game’s own overlays has the keyboard', async () => {
    const s = setup({ suspended: true })
    await press({ key: 'Tab' })
    await press({ key: 'a' })
    expect(s.setCursor).not.toHaveBeenCalled()
    expect(s.setCell).not.toHaveBeenCalled()
    s.view.unmount()
  })
})

describe('the rebus binding', () => {
  it('comes back, so PlayArea can place it as a menu row', async () => {
    const s = setup()
    expect(s.view.result.current.actRebus.id).toBe('act-rebus')
    await act(async () => s.view.result.current.actRebus.run())
    expect(s.onRebus).toHaveBeenCalledWith(0, 0)
    s.view.unmount()
  })
})
