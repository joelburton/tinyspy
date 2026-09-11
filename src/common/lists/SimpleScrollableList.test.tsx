// cs-blessed-lists

/**
 * Tests for SimpleScrollableList.
 *
 * It has one branch — rows, or the message that stands in for them — and two
 * things it promises around that: the frame is drawn either way, and the tally
 * under it appears only when a caller passes one.
 *
 * What it does NOT test is the height, which is the component's other claim
 * (`rows` × the row height, capped). That is a `max-height` calc over a custom
 * property, and jsdom computes no layout, so an assertion here would either
 * restate the stylesheet or pass on nothing.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SimpleScrollableList } from './SimpleScrollableList'

const WORDS = ['ALOE', 'BONE', 'CIDER']
const items = (words = WORDS) => words.map((w) => <li key={w}>{w}</li>)

const box = () => screen.getByRole('list')
const rowText = () => Array.from(box().children).map((li) => li.textContent)

describe('SimpleScrollableList — rows or a message', () => {
  it('renders the rows it is given', () => {
    render(<SimpleScrollableList rows={7}>{items()}</SimpleScrollableList>)
    expect(rowText()).toEqual(WORDS)
  })

  // An empty list is still a list: the frame stays and the message goes inside
  // it, rather than the box vanishing and a sentence appearing under it.
  it('shows the empty message INSIDE the frame when there are no rows', () => {
    render(
      <SimpleScrollableList rows={7} empty="No words.">
        {[]}
      </SimpleScrollableList>,
    )
    expect(box()).toBeInTheDocument()
    expect(rowText()).toEqual(['No words.'])
  })

  it('draws the frame empty when there are no rows AND no message', () => {
    render(<SimpleScrollableList rows={7}>{[]}</SimpleScrollableList>)
    expect(box()).toBeInTheDocument()
    expect(rowText()).toEqual([])
  })

  it('treats a single child as content, not as emptiness', () => {
    render(
      <SimpleScrollableList rows={7} empty="No words.">
        <li>ALOE</li>
      </SimpleScrollableList>,
    )
    expect(rowText()).toEqual(['ALOE'])
  })
})

describe('SimpleScrollableList — the tally', () => {
  it('appears under the frame when given', () => {
    render(
      <SimpleScrollableList rows={7} count="3 words">
        {items()}
      </SimpleScrollableList>,
    )
    expect(screen.getByText('3 words')).toBeInTheDocument()
  })

  it('is absent when not given — no empty line is drawn', () => {
    const { container } = render(
      <SimpleScrollableList rows={7}>{items()}</SimpleScrollableList>,
    )
    expect(container.querySelectorAll('p')).toHaveLength(0)
  })
})
