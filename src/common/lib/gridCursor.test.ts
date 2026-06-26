import { describe, expect, it } from 'vitest'
import { moveCursor, stepBack, type GridCursor } from './gridCursor'

const C = (x: number, y: number, dir: 'h' | 'v'): GridCursor => ({ x, y, dir })

describe('moveCursor', () => {
  it('rotates onto a perpendicular axis without moving', () => {
    expect(moveCursor(C(5, 5, 'h'), 'ArrowDown', 14)).toEqual(C(5, 5, 'v'))
    expect(moveCursor(C(5, 5, 'h'), 'ArrowUp', 14)).toEqual(C(5, 5, 'v'))
    expect(moveCursor(C(5, 5, 'v'), 'ArrowRight', 14)).toEqual(C(5, 5, 'h'))
    expect(moveCursor(C(5, 5, 'v'), 'ArrowLeft', 14)).toEqual(C(5, 5, 'h'))
  })

  it('steps one cell along the current axis', () => {
    expect(moveCursor(C(5, 5, 'h'), 'ArrowRight', 14)).toEqual(C(6, 5, 'h'))
    expect(moveCursor(C(5, 5, 'h'), 'ArrowLeft', 14)).toEqual(C(4, 5, 'h'))
    expect(moveCursor(C(5, 5, 'v'), 'ArrowDown', 14)).toEqual(C(5, 6, 'v'))
    expect(moveCursor(C(5, 5, 'v'), 'ArrowUp', 14)).toEqual(C(5, 4, 'v'))
  })

  it('clamps to [0, max] at both ends', () => {
    expect(moveCursor(C(0, 5, 'h'), 'ArrowLeft', 14)).toEqual(C(0, 5, 'h'))
    expect(moveCursor(C(14, 5, 'h'), 'ArrowRight', 14)).toEqual(C(14, 5, 'h'))
    expect(moveCursor(C(5, 0, 'v'), 'ArrowUp', 24)).toEqual(C(5, 0, 'v'))
    expect(moveCursor(C(5, 24, 'v'), 'ArrowDown', 24)).toEqual(C(5, 24, 'v'))
  })

  it('respects the per-game max (14 for RackAttack, 24 for MonkeyGram)', () => {
    expect(moveCursor(C(14, 5, 'h'), 'ArrowRight', 14)).toEqual(C(14, 5, 'h'))
    expect(moveCursor(C(14, 5, 'h'), 'ArrowRight', 24)).toEqual(C(15, 5, 'h'))
  })
})

describe('stepBack', () => {
  it('steps one cell back along the cursor axis', () => {
    expect(stepBack(C(5, 5, 'h'), 14)).toEqual(C(4, 5, 'h'))
    expect(stepBack(C(5, 5, 'v'), 14)).toEqual(C(5, 4, 'v'))
  })

  it('leaves the cross-axis coordinate untouched', () => {
    expect(stepBack(C(7, 3, 'h'), 14)).toEqual(C(6, 3, 'h')) // y stays
    expect(stepBack(C(3, 7, 'v'), 14)).toEqual(C(3, 6, 'v')) // x stays
  })

  it('clamps at 0', () => {
    expect(stepBack(C(0, 5, 'h'), 14)).toEqual(C(0, 5, 'h'))
    expect(stepBack(C(5, 0, 'v'), 14)).toEqual(C(5, 0, 'v'))
  })
})
