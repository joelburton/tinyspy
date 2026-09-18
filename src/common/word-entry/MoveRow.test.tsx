// cs-audited-word-entry

/**
 * The move row draws the two things it is: a take-back and a commit.
 *
 * Worth its own test because the failure is SILENT — a `<StandardButton>` with
 * no glyph falls back to a generic square, so an action that forgot its icon
 * still renders a perfectly good-looking button that says nothing, and only a
 * person looking at the row would notice.
 */
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MoveRow } from './MoveRow'
import type { BoundAction } from '../actions/useBoundAction'
import { ACTIONS, type ActionId } from '../actions/registry'

/** A binding as a surface sees one — the registry's real half, a stub's live
 *  half, so what is under test is what the row draws. */
function action(id: ActionId): BoundAction {
  return {
    id,
    spec: ACTIONS[id],
    run: vi.fn(),
    describe: () => ({ state: 'active' }),
    pending: false,
  }
}

/** Which lucide glyph an element drew, e.g. 'delete'. */
const glyphIn = (el: Element | null) =>
  el?.querySelector('svg')?.getAttribute('class')?.match(/lucide-([a-z-]+)/)?.[1]

describe('MoveRow', () => {
  it('draws each action its own glyph, never the generic square', () => {
    const { container } = render(
      <MoveRow actDelete={action('act-delete-last')} actSubmit={action('act-submit-entry')}>
        <span>cat</span>
      </MoveRow>,
    )
    const [del, submit] = [...container.querySelectorAll('button')]
    expect(glyphIn(del!)).toBe('delete')
    expect(glyphIn(submit!)).toBe('triangle')
    expect(glyphIn(del!)).not.toBe('square')
    expect(glyphIn(submit!)).not.toBe('square')
  })

  it('puts the entry between them, take-back first', () => {
    const { container } = render(
      <MoveRow actDelete={action('act-delete-last')} actSubmit={action('act-submit-entry')}>
        <span>cat</span>
      </MoveRow>,
    )
    expect(container.textContent).toContain('cat')
    expect([...container.querySelectorAll('button')]).toHaveLength(2)
  })
})
