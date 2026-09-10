// cs-unmet

import { useEffect } from 'react'
import { isEditableField, isNonGameField } from '../keyboard/editableField'
import { isPattern, matches, type KeySpec } from './chord'
import { liveBindings, type BoundAction } from './useBoundAction'

/**
 * The app's one key listener: every keystroke, matched against whatever actions
 * are bound right now.
 *
 * Mounted ONCE, in `App.tsx`. Nothing else calls it, and no page or game writes
 * a key branch of its own — a component gets a key by binding an action
 * (`useBoundAction`), never by listening for one. That is what makes the help
 * list honest: the keys that work on a page are exactly the ones registered
 * there.
 *
 * **Two gates come first, and they are the same two the app has always had.** A
 * keystroke aimed at a focused text field, or at anything inside a floating
 * panel, belongs to that field or that panel — a left arrow typed in chat
 * cannot move a board cursor. The field gate is the one an action can opt out
 * of, per its `inField`; the panel gate is absolute.
 *
 * **Then order.** Non-consuming wildcards run first and claim nothing: that is
 * how any key dismisses the last message and still types its letter. After
 * them, the innermost binding whose key matches and whose state is `active`
 * runs, stops the keystroke, and ends the walk. A hidden or disabled binding is
 * skipped rather than swallowing the key, so a key can fall through to an outer
 * binding that wants it. Anything matching nothing goes to the browser, which
 * is what keeps Cmd-R and Ctrl-Tab working.
 */
export function useActionDispatcher(): void {
  useEffect(function attachActionDispatcher() {
    function onKeyDown(e: KeyboardEvent) {
      // A floating panel with focus owns the keyboard entirely — its Enter
      // activates its button and its Tab moves between its controls.
      const target = e.target
      if (target instanceof Element && target.closest('[data-floating-panel]')) return

      const editable = isEditableField(target)
      const nonGame = isNonGameField(target)

      // Is this action allowed to fire from where the focus is?
      function reachable(action: BoundAction): boolean {
        if (!editable) return true
        switch (action.spec.inField ?? 'never') {
          case 'always':
            return true
          case 'game-inputs':
            return !nonGame
          case 'never':
            return false
        }
      }

      // Which of this action's keys is this keystroke, if any — and is the
      // action in a state to take it? Returns the matched key, because a
      // pattern action has to be told which one it got.
      function takes(action: BoundAction): KeySpec | null {
        const key = action.spec.keys?.find((spec) => matches(spec, e))
        if (!key) return null
        if (e.repeat && !action.spec.repeat) return null
        if (!reachable(action)) return null
        return action.describe().state === 'active' ? key : null
      }

      const live = liveBindings()

      // The watchers, first and all of them: a wildcard that claims nothing
      // sees the key go past whatever else answers it. Position in the stack is
      // deliberately not consulted — "dismiss the message" happens on every key
      // there is, so making it depend on which component bound it first would
      // be a bug waiting for the first reordering.
      for (const action of live) {
        if (action.spec.consumes === false && takes(action)) action.run(e.key)
      }

      // Then the one action that answers, innermost first.
      for (let i = live.length - 1; i >= 0; i -= 1) {
        const action = live[i]!
        if (action.spec.consumes === false) continue
        const key = takes(action)
        if (!key) continue
        e.preventDefault()
        // A pattern action is told which key it got; a chord already knows.
        action.run(isPattern(key) ? e.key : undefined)
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
