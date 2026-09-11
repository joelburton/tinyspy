// cs-unmet

import { useState } from 'react'
import { AnagramDialog } from '../anagram-finder/AnagramDialog'
import { WordLookupDialog } from '../definitions/WordLookupDialog'
import { setChatOpen, useChatMounted } from '../chat/chatOpenStore'
import { openPageMenu } from '../menu/pageMenuStore'
import { useBoundAction } from './useBoundAction'

/**
 * The four keys that work on every real page — chat, the page menu, word
 * lookup, the anagram finder — and the two dialogs two of them open.
 *
 * Mounted once, at the app root, and that is the whole of their wiring: a page
 * gets them by existing.
 *
 * They fire while nothing is focused and from a GAME's own input — you can hit
 * `/` to chat mid-clue — but not from chat, a form or the scratchpad, where the
 * characters stay literal. That is the actions' `inField: 'game-inputs'`, and
 * the dispatcher applies it.
 */
export function AppActionsHost() {
  // The two dialogs these actions own. Held here for the same reason the keys
  // are: one copy for the app, rather than one per page.
  const [lookupOpen, setLookupOpen] = useState(false)
  const [anagramsOpen, setAnagramsOpen] = useState(false)
  const chatIsHere = useChatMounted()

  // None of the four is held in a variable: nothing here PLACES them. Binding
  // is what offers a key, and the menu rows that name these actions are built
  // where those menus are.
  useBoundAction('act-open-chat', {
    // A page with no chat panel does not offer chat at all — the home page.
    describe: () => (chatIsHere ? 'active' : 'hidden'),
    run: () => {
      setChatOpen(true)
      // Focus the box so you can type at once — this covers the already-open
      // case too, where ChatBody's mount-focus doesn't fire (no remount). The
      // frame wait is for the panel to reach the DOM.
      requestAnimationFrame(() => {
        const input = document.querySelector('[data-chat-input]')
        if (input instanceof HTMLElement) input.focus()
      })
    },
  })

  useBoundAction('act-open-menu', {
    // Whatever menu is on screen registered itself; a page with none (or a game
    // whose menu is gone during a pause) gets nothing.
    describe: () => 'active',
    run: openPageMenu,
  })

  useBoundAction('act-lookup-word', {
    describe: () => 'active',
    run: () => setLookupOpen(true),
  })

  useBoundAction('act-anagram-finder', {
    describe: () => 'active',
    // A toggle: the same chord closes it. (From inside the dialog's own input,
    // Escape is the close.)
    run: () => setAnagramsOpen((open) => !open),
  })

  return (
    <>
      {lookupOpen && <WordLookupDialog onClose={() => setLookupOpen(false)} />}
      {anagramsOpen && <AnagramDialog onClose={() => setAnagramsOpen(false)} />}
    </>
  )
}
