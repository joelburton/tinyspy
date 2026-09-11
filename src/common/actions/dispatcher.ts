// cs-audited-actions

import { useEffect } from 'react'
import { isEditableField, isNonGameField } from '../keyboard/editableField'
import { isPattern, isWildcard, matches, type KeySpec } from './chord'
import { liveBindings, type BoundAction } from './useBoundAction'

/** Ties already reported, so holding a key doesn't fill the console with the
 *  same sentence. Keyed by the ids, since that pair IS the finding. */
const reportedTies = new Set<string>()

/**
 * **A development-only complaint: two actions wanted the same keystroke.**
 *
 * Which one got it came down to where each was bound — a fact about React's
 * effect order, not a decision anybody made — so this is always worth a look,
 * even where the winner happens to be the one you wanted.
 *
 * It is not the same as an action bound in two places. That is one command
 * offered twice (a game's End and the pause overlay's), and those are written
 * so they are never live together; this fires on two DIFFERENT commands, which
 * is the case nothing else can catch. A static check cannot: whether two
 * actions can be on screen at once depends on what is mounted and on what each
 * one's `describe` says at that moment.
 */
function reportChordTie(claimants: BoundAction[]): void {
  const ids = claimants.map((a) => a.id)
  if (new Set(ids).size < 2) return
  const seen = ids.join(' ')
  if (reportedTies.has(seen)) return
  reportedTies.add(seen)
  console.warn(
    `[actions] ${ids.join(' and ')} are both live and both answer ` +
      `${claimants[0]!.spec.keys?.[0]?.label ?? 'this key'} — ${ids[0]} won because of ` +
      'where it was bound, which is not a decision. Give one of them a different key, ' +
      'or make sure they cannot be active at the same time.',
  )
}

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
 * **Two gates come first, and they are the app's, not an action's.** A
 * keystroke aimed at a focused text field, or at anything inside a floating
 * panel, belongs to that field or that panel — a left arrow typed in chat
 * cannot move a board cursor. The field gate is the one an action can opt out
 * of, per its `inField`; the panel gate is absolute.
 *
 * **Then three passes, because a keystroke can mean three different kinds of
 * thing.**
 *
 *   1. **Watchers** — a wildcard that consumes nothing. Every active one runs
 *      and the key carries on to whoever really wanted it: that is how any key
 *      dismisses the last message and still types its letter. Position in the
 *      stack is deliberately not consulted — "dismiss the message" happens on
 *      every key there is, so making it depend on which component bound it
 *      first would be a bug waiting for the first reordering.
 *   2. **Interceptors** — a wildcard that DOES consume. The surface has
 *      declared a MODE: while it holds, the next keystroke means one thing and
 *      nothing else. `act-exit-viewer` is the one we have — a key with a past
 *      turn open means "back to the live board", whatever else is bound. That
 *      is a claim about the moment rather than about specificity, so it is
 *      settled here rather than by where the action happens to be bound.
 *   3. **Commands** — everything with a real key, in stack order: a component
 *      mounted with its page sits ahead of the page and wins a key they both
 *      want. That is a tiebreak, not a channel — see the stack's docstring.
 *
 * In every pass a hidden or disabled binding is skipped rather than swallowing
 * the key, so a key falls through to an outer binding that wants it. When no
 * binding takes it, a DISABLED one that matched still keeps it from the
 * browser: "here, and not right now" claims the key and does nothing with it,
 * so Space with no legal peel does not scroll the page. Anything matching
 * nothing at all goes to the browser, which is what keeps Cmd-R and Ctrl-Tab
 * working.
 *
 * **In development it also complains when two commands claim one keystroke** —
 * see `reportChordTie`. Position in the stack decides that today, and position
 * is a fact about effect order rather than a decision.
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

      // 1. The watchers, all of them, claiming nothing.
      for (const action of live) {
        if (action.spec.consumes === false && takes(action)) action.run(e.key)
      }

      // 2. An interceptor, if a surface has one live: a consuming wildcard is a
      //    MODE, and a mode outranks any particular key.
      // 3. Otherwise the command that answers.
      //
      // Both walk the stack forward, so a component mounted with its page wins
      // a key they both want; one mounted later does not. What the order is and
      // why it must not be leaned on is the stack's own docstring
      // (`useBoundAction.ts`); two actions live at once must not share a chord.
      const answers = (wildcard: boolean) => {
        const claimants: BoundAction[] = []
        let first: KeySpec | null = null
        for (const action of live) {
          if (action.spec.consumes === false) continue
          if ((action.spec.keys?.some(isWildcard) ?? false) !== wildcard) continue
          const key = takes(action)
          if (!key) continue
          claimants.push(action)
          if (first === null) first = key
          // In production the walk stops at the winner. In development it keeps
          // going, for the sole purpose of noticing a tie — see `reportChordTie`.
          if (!import.meta.env.DEV) break
        }
        const winner = claimants[0]
        if (!winner || first === null) return false
        if (import.meta.env.DEV && claimants.length > 1) reportChordTie(claimants)
        e.preventDefault()
        // A pattern action is told which key it got; a chord already knows.
        winner.run(isPattern(first) ? e.key : undefined)
        return true
      }
      if (answers(true)) return
      if (answers(false)) return

      // Nothing live took it. A binding that is here but DISABLED still keeps
      // the key from the browser — Space with no legal peel must not scroll the
      // page — without standing in the way of a sibling that wanted it, which
      // the walks above already gave their chance.
      for (const action of live) {
        if (action.spec.consumes === false || action.spec.keys?.some(isWildcard)) continue
        const key = action.spec.keys?.find((spec) => matches(spec, e))
        if (!key || !reachable(action)) continue
        if (action.describe().state === 'disabled') {
          e.preventDefault()
          return
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
