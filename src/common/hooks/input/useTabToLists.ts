// cs-audited

import type { RefObject } from 'react'
import { useGlobalKeyHandler } from './useGlobalKeyHandler'

/**
 * Tab moves focus to this page's `<SelectionList>`s, and nowhere else.
 *
 * **The problem it solves.** A page whose keyboard story is "arrows move a
 * cursor, Enter opens" has nothing useful for native Tab to advance to: left
 * alone it walks onto the header buttons and then out into the browser's URL
 * bar. But swallowing Tab outright strands you — click any blank part of the
 * page and the list blurs, the cursor ring goes with it, and there is no key
 * left that can hand the keyboard back.
 *
 * So Tab is neither native nor dead: it **cycles the page's lists**. With two
 * it toggles, which is what the club page has always done; with one it always
 * lands there, which is what the homepage was missing. Focus sitting on
 * `<body>` counts as "nowhere", so the first Tab after a stray click goes to
 * the first list — the recovery that was absent.
 *
 * **Tab is the page's, never the list's.** A `<SelectionList>` owns everything
 * that happens *within* one list and guarantees it is exactly one tab stop;
 * which list you move to next is a fact about the page holding them, so it is
 * answered here (plans/selection-lists.md).
 *
 * **What still keeps its own Tab.** Text fields, anything inside a
 * `[data-floating-panel]` (`useGlobalKeyHandler` gates both), and any open menu
 * or dialog — a setup form's fields must stay tabbable, and an open `<Menu>`
 * uses Tab to close itself. Modified chords go to the browser, so `Ctrl-Tab`
 * still switches browser tabs.
 *
 * A page with no SelectionList wants `useSwallowTab` instead: Tab there has
 * nothing to move to, which is a different statement from "it moves to the
 * list".
 */
export function useTabToLists(refs: Array<RefObject<HTMLElement | null>>): void {
  useGlobalKeyHandler((e: KeyboardEvent) => {
    // Leave modified chords to the browser/OS.
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key !== 'Tab') return
    const target = e.target instanceof Element ? e.target : null
    if (target?.closest('[role="menu"], [role="dialog"]')) return
    e.preventDefault()

    // Hidden lists are skipped rather than focused: the club page's mobile
    // layout renders one column at a time, and Tab must not park the keyboard
    // on the list that isn't on screen.
    const lists = refs
      .map((r) => r.current)
      .filter((el): el is HTMLElement => el !== null && el.offsetParent !== null)
    if (lists.length === 0) return

    // -1 (focus is on <body>, or on something that isn't one of these) wraps to
    // 0, so a stray click costs exactly one Tab to undo.
    const at = lists.indexOf(document.activeElement as HTMLElement)
    lists[(at + 1) % lists.length]!.focus()
  })
}
