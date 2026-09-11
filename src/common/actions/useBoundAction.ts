// cs-audited-actions

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { ACTIONS, type ActionId, type ActionSpec } from './registry'
import type { AppIcon } from '../icons/icons'
import { askConfirmation } from '../floating-panels/confirmationService'
import type { ConfirmAnswer } from '../floating-panels/useConfirmation'
import { useSingleFlight } from '../single-flight/useSingleFlight'

/**
 * Give an action a body: what it does here, whether it is available right now,
 * and what it says right now.
 *
 *     const actNewGame = useBoundAction('act-new-game', {
 *       run: createNewGame,
 *       describe: () => (loading ? 'disabled' : 'active'),
 *       terminal: isTerminal,
 *     })
 *
 * Bind it once and hand the same value to everything that shows it — the button
 * you place, the menu row, nothing else. Its key comes with it: **binding IS
 * offering**, so an action you bind is one the dispatcher will fire and the help
 * list will show, and one you do not bind does not exist on this page. There is
 * no second list of "which keys this game wants".
 *
 * What you get back is a `BoundAction`, and the two things on it are `run` and
 * `describe`. Everything outside the game — menu rows, buttons, the key
 * dispatcher — reads only those, which is what makes a row gray, a button
 * disable and a key do nothing for one reason, stated once.
 *
 * The run is not quite the callback you passed. It asks the action's question
 * first when the registry gives it one and the game is not terminal, and it is
 * single-flight, so a second press while the first is still out is dropped and
 * every surface shares the wait.
 */

/** Whether an action applies right now, and how. `hidden` is "not here at this
 *  moment" — a play-only action at terminal; `disabled` is "here, and not right
 *  now" — Submit with an empty entry. */
export type ActionState = 'active' | 'hidden' | 'disabled'

/**
 * What a binding says about itself when asked.
 *
 * The words and the glyph are optional and fall back to the registry's, so an
 * action that always looks the same answers with a bare state.
 *
 * **What may vary is how an action LOOKS right now; what it IS does not.** A
 * toggle has two faces — "Reveal secrets" with the boxed eye, "Hide secrets"
 * with the crossed-out one — and on an icon-only control the glyph IS the
 * label, so letting the words move without the glyph would have the two saying
 * different things at the same moment. Its name, its keys, its tone and its
 * question never move: those are what make it the same command in every game,
 * and none of them depends on the moment.
 */
export type Described = {
  state: ActionState
  label?: string
  // The face to wear right now — from `common/icons/icons.ts`, like the
  // registry's own. For a toggle, and nothing else: an action that draws an
  // unrelated glyph here is a different action wearing this one's name.
  icon?: AppIcon
  // WHY it is the state it is, where that is worth a sentence — "A hint is
  // already showing", "Find 2 more valid words". A button shows it in its
  // hover bubble in place of the name and key; a menu row has no bubble and
  // ignores it. Given here rather than by the placement because the same
  // conditions that decide the state are the ones that know the reason.
  tooltip?: string
}

/** The live half a binding supplies. */
export type LiveAction = {
  // Do the thing. A pattern action (any letter, any arrow) receives the key
  // that fired it. May be async; the wrapper waits for it.
  run: (key?: string) => void | Promise<void>
  // The SECOND act, for an action whose registry entry has a `confirmChoice`:
  // supply this and the question with two ways to say yes is the one asked,
  // leave it out and the ordinary `confirm` is. So "does this game offer the
  // second act" is answered by whether there is a body for it, rather than by a
  // flag that could disagree with one. Concede is where this applies: a race
  // that can also stop the whole table passes the end-for-everyone call here.
  runAlternative?: () => void | Promise<void>
  // What the action looks like right now. Called at read time, so it may read
  // anything the component can see. A bare state is shorthand for `{ state }`.
  describe: () => Described | ActionState
  // Is the game over? The registry's confirmation is skipped when it is —
  // at terminal there is nothing left to interrupt.
  terminal?: boolean
}

/** A registry entry joined to a game's callbacks: the whole action, and the
 *  only shape any surface sees. */
export type BoundAction = {
  id: ActionId
  spec: ActionSpec
  run: (key?: string) => void
  describe: () => Described
  // Is a run still out? True from the moment it is triggered — the question
  // included, so a button behind an open confirm reads gray rather than live.
  pending: boolean
}

/**
 * THE STACK OF LIVE BINDINGS, in the order they mounted.
 *
 * A page binds its commands, a component mounted inside it binds its entry
 * keys, and the dispatcher walks this forward and fires the first live match.
 * Module-level rather than a context because the reader that has to decide is
 * a window listener, and a window listener sits in no subtree.
 *
 * **What the order is, exactly.** An entry joins here from an effect, and React
 * runs effects CHILDREN FIRST — so among components mounted in ONE commit, a
 * child's binding sits before its parent's and wins a key they both want. A
 * component mounted in a LATER commit joins at the end, behind everything
 * already there, whatever its depth in the tree. So "innermost first" holds
 * for a page and the components it mounts together, and not for one it mounts
 * later (`dispatcher.test.tsx` pins both). Two bindings in the SAME component
 * are in call order.
 *
 * **None of that is a tool.** Order only makes a tie deterministic; the rule
 * that keeps ties from mattering is that two actions which can be live at the
 * same moment do not share a chord, and the dispatcher complains in
 * development when they do. A binding must not lean on its position to win.
 *
 * Each entry holds a REF, refreshed every render, so a listener reading it at
 * keypress gets the current closure without anything re-registering.
 */
const bindings: Array<{ current: BoundAction }> = []

const listeners = new Set<() => void>()

// Bumped when a binding joins or leaves, so a surface that draws a LIST of them
// re-renders. Deliberately not bumped when a binding merely re-renders: what a
// bound action says is read by asking it, not by watching it.
let version = 0

function notify(): void {
  version += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Every binding on the page right now, in stack order. Re-renders the caller
 *  when a binding joins or leaves — not when one changes what it would say, so
 *  a surface built from this asks each action as it draws. */
export function useBoundActions(): BoundAction[] {
  useSyncExternalStore(subscribe, () => version)
  return bindings.map((b) => b.current)
}

/** Every binding on the page right now, in stack order, for a reader that is
 *  not a component — the key dispatcher. Read at the moment of the keystroke,
 *  never held. */
export function liveBindings(): BoundAction[] {
  return bindings.map((b) => b.current)
}

/**
 * An action somebody ELSE bound, for a surface that wants to show it.
 *
 * The game menu's chat row is the case: `/` is bound once at the app root, and
 * the row should be that action rather than a second copy of its name and its
 * key. Null when nothing has bound it — a page with no chat panel — and the
 * caller drops the row.
 */
export function useAppAction(id: ActionId): BoundAction | null {
  useSyncExternalStore(subscribe, () => version)
  // The first in stack order — the one the dispatcher would fire.
  return bindings.find((b) => b.current.id === id)?.current ?? null
}

/** Normalize the shorthand: a bare state means that state and the fixed label. */
function described(answer: Described | ActionState): Described {
  return typeof answer === 'string' ? { state: answer } : answer
}

export function useBoundAction(id: ActionId, live: LiveAction): BoundAction {
  const spec = ACTIONS[id] as ActionSpec

  // The live half changes every render (it closes over the game's state), so it
  // is read through a ref and nothing below has to be rebuilt when it does.
  //
  // Refreshed DURING the render, not in an effect. `describe()` is read while
  // the tree is rendering — a game's info column asks about an action its
  // PlayArea bound in the same pass — so an effect-refreshed ref would answer
  // from the render before, and every surface would show the previous moment's
  // truth for a beat: the row saying the game is over beside a button still
  // saying it is not. (An effect IS right for a value only a listener reads,
  // which is why `useTabRing` uses one.)
  //
  // The rule this waives guards against a render being discarded and its writes
  // outliving it. Nothing here is at risk: what the ref holds is only ever read
  // BACK during the same render, or later at keypress.
  //
  // It also keeps the bound action's IDENTITY still, which a game's menu effect
  // lists in its deps. That is an optimization (`gameMenuStore`), and the cheap
  // kind: without it every keystroke in a game would rebuild that game's menu
  // rows.
  const liveRef = useRef(live)
  // eslint-disable-next-line react-hooks/refs -- read back in this same render
  liveRef.current = live

  // The run every surface shares: ask the action's question, then do the thing.
  // Asking here rather than in the callback is what stops every game from
  // having to remember to ask — and stops one of them from forgetting.
  const ask = useCallback(
    async (key?: string) => {
      const asked = liveRef.current
      // Which question, if any: the one with two ways to say yes when this
      // binding has a body for the second act, otherwise the plain one. At
      // terminal neither is asked — there is nothing left to interrupt.
      const question = asked.runAlternative ? (spec.confirmChoice ?? spec.confirm) : spec.confirm
      let answer: ConfirmAnswer = 'confirm'
      if (question && !asked.terminal) {
        answer = await askConfirmation(question)
        if (answer === null) return
      }
      // Read AGAIN after the wait: the game keeps rendering while the question
      // is up (realtime, the clock), and the body that runs must be the one
      // from the moment of the answer, not the moment of the press.
      const now = liveRef.current
      if (answer === 'alternative' && now.runAlternative) {
        await now.runAlternative()
        return
      }
      await now.run(key)
    },
    [spec],
  )
  // Guards a non-idempotent request from firing twice; see `useSingleFlight`.
  // On the handler, so the button, the menu row and the key are covered at once.
  const [run, pending] = useSingleFlight(ask)

  const describe = useCallback(() => described(liveRef.current.describe()), [])

  // Identity changes only when `pending` flips, so a surface holding this value
  // is holding something that stays true: `run` and `describe` are stable and
  // read the ref, and `pending` is the one thing on here that is a snapshot.
  const bound = useMemo<BoundAction>(
    () => ({ id, spec, run, describe, pending }),
    [id, spec, run, describe, pending],
  )

  // The stack entry, refreshed during the render for the same reason as above:
  // the help list draws from this stack while rendering, and the dispatcher
  // reads it at keypress — both want the newest one, neither wants last one.
  const boundRef = useRef(bound)
  // eslint-disable-next-line react-hooks/refs -- the stack must hold this render's
  boundRef.current = bound

  // Join the stack for as long as this is mounted — binding is offering, and
  // leaving is what takes the key back. Empty deps: the entry is the ref, so
  // it never needs re-registering.
  useEffect(function joinTheBindingStack() {
    bindings.push(boundRef)
    notify()
    return () => {
      bindings.splice(bindings.indexOf(boundRef), 1)
      notify()
    }
  }, [])

  return bound
}
