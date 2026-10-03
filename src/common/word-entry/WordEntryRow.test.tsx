// cs-blessed-word-entry

/**
 * The word-entry row draws the two things it is: a take-back and a commit.
 *
 * Worth its own test because the failure is SILENT — a `<StandardButton>` with
 * no glyph falls back to a generic square, so an action that forgot its icon
 * still renders a perfectly good-looking button that says nothing, and only a
 * person looking at the row would notice.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WordEntryRow } from './WordEntryRow'
import { ZTest_actionFixture } from '../actions/action.fixture'

/** Which lucide glyph an element drew, e.g. 'delete'. */
const glyphIn = (el: Element | null) =>
  el?.querySelector('svg')?.getAttribute('class')?.match(/lucide-([a-z-]+)/)?.[1]

describe('WordEntryRow', () => {
  it('draws each action its own glyph, never the generic square', () => {
    const { container } = render(
      <WordEntryRow actDelete={ZTest_actionFixture('act-delete-last')} actSubmit={ZTest_actionFixture('act-submit')}>
        <span>cat</span>
      </WordEntryRow>,
    )
    const [del, submit] = [...container.querySelectorAll('button')]
    expect(glyphIn(del!)).toBe('delete')
    expect(glyphIn(submit!)).toBe('triangle')
    expect(glyphIn(del!)).not.toBe('square')
    expect(glyphIn(submit!)).not.toBe('square')
  })

  it('puts the entry between them, take-back first', () => {
    const { container } = render(
      <WordEntryRow actDelete={ZTest_actionFixture('act-delete-last')} actSubmit={ZTest_actionFixture('act-submit')}>
        <span>cat</span>
      </WordEntryRow>,
    )
    expect(container.textContent).toContain('cat')
    expect([...container.querySelectorAll('button')]).toHaveLength(2)
  })
})
