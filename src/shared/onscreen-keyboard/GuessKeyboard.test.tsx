// cs-blessed-onscreen-keyboard

/**
 * The on-screen keyboard, mounted on its own — what a CALLER is promised,
 * asserted against the component rather than through a game that uses it.
 *
 * Tapping is the first of those and the reason the component exists: a cap
 * hands back its own lowercase letter. A game's own tests drive physical keys,
 * which exercises the game's input path and not one keycap, so this is the only
 * place a tap is ever made.
 *
 * Two things are deliberately NOT here. The tones' COLORS belong in a browser,
 * where a fill and an ink can be read; this checks only that the right class
 * lands. And the game-over withdraw is a game's terminal frame rather than this
 * component's contract, so each consumer pins its own.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { boundActionFixture } from '@/common/actions/boundAction.fixture'
import { GuessKeyboard, type KeyTone } from './GuessKeyboard'
import styles from './GuessKeyboard.module.css'

function draw(over: Partial<Parameters<typeof GuessKeyboard>[0]> = {}) {
  const onKey = vi.fn()
  render(
    <GuessKeyboard
      onKey={onKey}
      actSubmit={boundActionFixture('act-submit')}
      actDelete={boundActionFixture('act-delete-last')}
      {...over}
    />,
  )
  return { onKey }
}

/** A cap by its accessible name — `q`, `Backspace`, `Enter`. Anchored, because
 *  an unanchored `name` matches a substring and every letter is one character. */
const cap = (name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${name}$`) })

describe('GuessKeyboard — typing', () => {
  it('hands back the letter that was tapped', async () => {
    // WHY THIS COMPONENT EXISTS: a player with no physical keyboard types here.
    // Nothing in the repo tapped a cap before this line.
    const { onKey } = draw()
    await userEvent.setup().click(cap('q'))
    expect(onKey).toHaveBeenCalledWith('q')
    expect(onKey).toHaveBeenCalledTimes(1)
  })

  it('hands back a LOWERCASE letter, whatever the cap draws', async () => {
    // The caps are uppercased in CSS (`text-transform`), so what a test reads
    // off the screen and what the game receives are deliberately different.
    const { onKey } = draw()
    await userEvent.setup().click(cap('m'))
    expect(onKey).toHaveBeenCalledWith('m')
  })

  it('offers all 26 letters, and the two commands', () => {
    draw()
    const letters = 'qwertyuiopasdfghjklzxcvbnm'
    for (const ch of letters) expect(cap(ch)).toBeInTheDocument()
    expect(cap('Backspace')).toBeInTheDocument()
    expect(cap('Enter')).toBeInTheDocument()
  })
})

describe('GuessKeyboard — what can be pressed', () => {
  it('disables every cap, letters and commands alike, when the game says so', async () => {
    const { onKey } = draw({ disabled: true })
    for (const ch of ['q', 'm']) expect(cap(ch)).toBeDisabled()
    expect(cap('Backspace')).toBeDisabled()
    expect(cap('Enter')).toBeDisabled()

    await userEvent.setup().click(cap('q'))
    expect(onKey).not.toHaveBeenCalled()
  })

  it('grays a COMMAND cap when its binding is, and leaves the letters live', () => {
    // The docstring's central claim: a cap and its physical key are one binding
    // drawn twice, so Enter goes gray over an empty guess while every letter
    // beside it stays pressable. Nothing asserted it.
    draw({ actSubmit: boundActionFixture('act-submit', () => ({ state: 'disabled' })) })
    expect(cap('Enter')).toBeDisabled()
    expect(cap('Backspace')).toBeEnabled()
    expect(cap('q')).toBeEnabled()
  })
})

describe('GuessKeyboard — the tones', () => {
  it('tints a letter with the tone it was given and leaves the rest neutral', () => {
    const keyStates = new Map<string, KeyTone>([['q', 'wordleGreen'], ['w', 'wordleGray']])
    draw({ keyStates })
    expect(cap('q')).toHaveClass(styles.wordleGreen)
    expect(cap('w')).toHaveClass(styles.wordleGray)
    expect(cap('e').className).toBe(styles.key)
  })

  it('leaves every cap neutral when the game tints none', () => {
    draw()
    for (const ch of ['q', 'w', 'e']) expect(cap(ch).className).toBe(styles.key)
  })
})

describe('GuessKeyboard — focus', () => {
  it('does not keep the focus a tap would give a cap', async () => {
    // The same silent failure the info column's disclosure had: a click focuses
    // the cap, the next keystroke promotes it to `:focus-visible`, and a ring
    // then sits on whichever key was last tapped. Nothing here needs focus —
    // a player without a physical keyboard taps, and one with a keyboard types.
    draw()
    await userEvent.setup().click(cap('q'))
    expect(document.activeElement).toBe(document.body)
  })
})
