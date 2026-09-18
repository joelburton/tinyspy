// cs-audited-word-entry

/**
 * The three rules the input owns, none of which any other test looks at.
 *
 * The caret is the reason this file exists: it is drawn rather than the
 * browser's, so nothing but a test says it appears under exactly the two
 * conditions it claims — something typed, AND the game owning the keyboard. The
 * other two are shape rules that keep the box steady: the value wrapper is the
 * same element whichever path renders the value, and the placeholder fills the
 * box only when there is nothing in it.
 *
 * The caret is selected by its `aria-hidden` (it is the box's only hidden node)
 * rather than by its class — `css: false` under vitest makes a CSS module a
 * proxy that fabricates any key asked of it, so a class assertion here would
 * prove nothing about the stylesheet.
 */
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WordEntryInput } from './WordEntryInput'

const caretIn = (c: HTMLElement) => c.querySelector('[aria-hidden="true"]')

/** Focus a real field, the way chat or a clue box takes the keyboard off the
 *  game. jsdom fires `focusin`, which is what `useGameHasKeyboard` tracks. */
function focusAField() {
  const input = document.createElement('input')
  document.body.append(input)
  act(() => input.focus())
  return input
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('WordEntryInput — the caret', () => {
  it('blinks once something is typed and the game owns the keyboard', () => {
    const { container } = render(<WordEntryInput value="cat" />)
    expect(caretIn(container)).not.toBeNull()
  })

  it('stays out of an empty box, which the placeholder already speaks for', () => {
    const { container } = render(<WordEntryInput value="" placeholder="type a word" />)
    expect(caretIn(container)).toBeNull()
  })

  it('leaves while a text field holds the keyboard, so it never duels a real cursor', () => {
    const { container } = render(<WordEntryInput value="cat" />)
    focusAField()
    expect(caretIn(container)).toBeNull()
  })

  it('comes back when focus falls to the body — clicking the board is the game taking it back', () => {
    const { container } = render(<WordEntryInput value="cat" />)
    const field = focusAField()
    act(() => field.blur())
    expect(caretIn(container)).not.toBeNull()
  })
})

describe('WordEntryInput — the value and the placeholder', () => {
  // UNCONDITIONAL on purpose: a game that renders the value per-character gets
  // the same element around it, so the box has one shape whichever path runs.
  it('wraps the value in the same element whether the game renders it or not', () => {
    const plain = render(<WordEntryInput value="cat" />)
    expect(plain.getByTestId('entry-value')).toHaveTextContent('cat')
    plain.unmount()

    const custom = render(
      <WordEntryInput value="cat">
        <span data-testid="per-character">c·a·t</span>
      </WordEntryInput>,
    )
    expect(custom.getByTestId('entry-value')).toContainElement(
      custom.getByTestId('per-character'),
    )
  })

  it('draws no value element at all when nothing is entered', () => {
    render(<WordEntryInput value="" placeholder="type a word" />)
    expect(screen.queryByTestId('entry-value')).toBeNull()
  })

  it('shows the placeholder only while the box is empty', () => {
    const { rerender } = render(<WordEntryInput value="" placeholder="type a word" />)
    expect(screen.getByText('type a word')).toBeInTheDocument()

    rerender(<WordEntryInput value="c" placeholder="type a word" />)
    expect(screen.queryByText('type a word')).toBeNull()
  })

  it('draws nothing in an empty box when no placeholder was supplied', () => {
    const { container } = render(<WordEntryInput value="" />)
    expect(container.querySelector('div')?.children).toHaveLength(0)
  })
})
