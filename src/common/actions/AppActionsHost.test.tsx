// cs-unmet

/**
 * Tests for the four keys every real page has, bound at the app root: that they
 * fire from the board and from a game's own input, stay literal in chat and in
 * a form, and that `/` is not offered where there is no chat panel.
 *
 * Mounted with the dispatcher, since these keys ARE the dispatcher's job — what
 * is under test is the whole path from a window keydown to chat opening.
 */
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppActionsHost } from './AppActionsHost'
import { useActionDispatcher } from './dispatcher'
import { getChatOpen, registerChatMounted, setChatOpen } from '../chat/chatOpenStore'
import { registerPageMenu } from '../menu/pageMenuStore'

// The lookup dialog asks the definitions edge function on mount, and the
// anagram finder loads the word list; neither is this test's subject.
vi.mock('../definitions/WordLookupDialog', () => ({
  WordLookupDialog: () => <div>word lookup</div>,
}))
vi.mock('../anagram-finder/AnagramDialog', () => ({
  AnagramDialog: () => <div>anagram finder</div>,
}))

/** Whatever the current test registered, released in afterEach — both slots are
 *  module-level, so a leftover registration would answer the NEXT test. */
let releaseMenu: (() => void) | undefined
let releaseChat: (() => void) | undefined

/** Awaited, because an action's run is async: its single-flight gate clears a
 *  microtask after the key, and two presses inside one tick are one press. */
async function press(key: string, target: EventTarget, init: KeyboardEventInit = {}) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
  })
}

/** The host, with the dispatcher that feeds it. `chat` says whether a chat
 *  panel is on screen — the club and game pages have one, home does not. */
function setup({ chat = true } = {}) {
  if (chat) releaseChat = registerChatMounted()
  function Harness() {
    useActionDispatcher()
    return <AppActionsHost />
  }
  return render(<Harness />)
}

beforeEach(() => {
  setChatOpen(false)
})
afterEach(() => {
  document.body.innerHTML = ''
  setChatOpen(false)
  releaseMenu?.()
  releaseMenu = undefined
  releaseChat?.()
  releaseChat = undefined
})

describe('the app-wide keys', () => {
  it('"/" opens chat and "?" opens the page menu', async () => {
    // `?` reaches the page's menu through the store a <PageHeaderMenu>
    // registers with, not through an argument — so the test registers one.
    const openMenu = vi.fn()
    releaseMenu = registerPageMenu(openMenu)
    setup()

    await press('/', document.body)
    expect(getChatOpen()).toBe(true)
    await press('?', document.body)
    expect(openMenu).toHaveBeenCalledTimes(1)
  })

  it('"?" with no menu registered does nothing', async () => {
    // GamePage drops its menu while the game is paused, so this is the live
    // case, not a hypothetical: the key has to be a no-op rather than a crash.
    setup()
    await expect(press('?', document.body)).resolves.not.toThrow()
  })

  it('"~" opens the word-lookup dialog', async () => {
    setup()
    expect(screen.queryByText('word lookup')).toBeNull()
    await press('~', document.body)
    expect(screen.getByText('word lookup')).toBeTruthy()
  })

  it('⌥~ toggles the anagram finder — matched by CODE, surviving the mac dead key', async () => {
    setup()
    // On macOS this chord is the accent composer, so e.key arrives as 'Dead';
    // the physical e.code is what the chord matches. Option-SHIFT-Backquote:
    // `⌥~` is the chord, and `⌥\`` is a different one.
    const chord = () =>
      press('Dead', document.body, { code: 'Backquote', altKey: true, shiftKey: true })
    await chord()
    expect(screen.getByText('anagram finder')).toBeTruthy()
    await chord()
    expect(screen.queryByText('anagram finder')).toBeNull()
  })

  it('a bare backquote, and ⌥` without the shift, are not the anagram chord', async () => {
    setup()
    await press('`', document.body, { code: 'Backquote' })
    await press('Dead', document.body, { code: 'Backquote', altKey: true })
    expect(screen.queryByText('anagram finder')).toBeNull()
  })

  it("fires while a GAME's own input is focused", async () => {
    setup()
    const gameInput = document.createElement('input')
    gameInput.setAttribute('data-game-input', '')
    document.body.append(gameInput)

    await press('/', gameInput)
    expect(getChatOpen()).toBe(true)
  })

  it('stays literal in a non-game field (a setup input, the chat box)', async () => {
    const openMenu = vi.fn()
    releaseMenu = registerPageMenu(openMenu)
    setup()

    const input = document.createElement('input')
    document.body.append(input)

    await press('/', input)
    await press('?', input)
    await press('~', input)
    await press('Dead', input, { code: 'Backquote', altKey: true })

    expect(getChatOpen()).toBe(false)
    expect(openMenu).not.toHaveBeenCalled()
    expect(screen.queryByText('word lookup')).toBeNull()
    expect(screen.queryByText('anagram finder')).toBeNull()
  })

  it('does not offer "/" where there is no chat panel — the home page', async () => {
    // Not "opens nothing": the key is unbound, so it falls through to the
    // browser rather than appearing to do something.
    setup({ chat: false })
    await press('/', document.body)
    expect(getChatOpen()).toBe(false)
  })
})
