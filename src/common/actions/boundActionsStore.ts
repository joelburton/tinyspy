// cs-fixed-actions

import { useSyncExternalStore } from 'react'
import type { ActionId } from './registry'
import type { BoundAction } from './useBindAction'

/**
 * Every action bound on the page right now. `useBindAction` puts each binding
 * here while its component is mounted (`registerBinding`); everything that
 * shows or fires actions without binding them reads from here — Help's key
 * list and the game menu (`useBoundActions`, `useBoundAction`), and the key
 * dispatcher (`getBoundActions`).
 */

// The stack of live bindings, in the order they mounted. Module-level rather
// than a context because the reader that has to decide is a window listener,
// and a window listener sits in no subtree. Each entry holds a REF, refreshed
// every render, so a reader at keypress gets the current closure without
// anything re-registering.
//
// The order: an entry joins from an effect, and React runs effects children
// first, so among components mounted in ONE commit a child sits before its
// parent; a component mounted in a LATER commit joins at the end, whatever its
// depth (`useActionDispatcher.test.tsx` pins both). That order is a tiebreak
// and not a tool — two actions live at once must not share a chord (doc.md).
const bindingRefs: Array<{ current: BoundAction }> = []

// A listener is a callback: each `useBoundActions()` / `useBoundAction()`
// caller adds one, and a binding joining or leaving calls every one.
const listeners = new Set<() => void>()

// How many times a binding has joined or left. The hooks read it so a surface
// that draws a LIST of bindings re-renders; deliberately not counted when a
// binding merely re-renders: what a bound action says is read by asking it,
// not by watching it.
let bindingChangeCount = 0

function getBindingChangeCount(): number {
  return bindingChangeCount
}

function notify(): void {
  bindingChangeCount += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Join the stack, and return the release that leaves it. `useBindAction`
 *  calls it from an effect, so each binding sits in the stack for exactly as
 *  long as its component is mounted. */
export function registerBinding(ref_: { current: BoundAction }): () => void {
  bindingRefs.push(ref_)
  notify()
  return () => {
    bindingRefs.splice(bindingRefs.indexOf(ref_), 1)
    notify()
  }
}

/** Every binding on the page right now, in stack order. Re-renders the caller
 *  when a binding joins or leaves — not when one changes what it would say, so
 *  a surface built from this asks each action as it draws. */
export function useBoundActions(): BoundAction[] {
  useSyncExternalStore(subscribe, getBindingChangeCount)
  return bindingRefs.map((ref_) => ref_.current)
}

/** Every binding on the page right now, in stack order, for a reader that is
 *  not a component — the key dispatcher. Read at the moment of the keystroke,
 *  never held. */
export function getBoundActions(): BoundAction[] {
  return bindingRefs.map((ref_) => ref_.current)
}

/**
 * An action somebody ELSE bound, for a surface that wants to show it.
 *
 * The game menu's chat row is the case: `/` is bound once at the app root, and
 * the row should be that action rather than a second copy of its name and its
 * key. Null when nothing has bound it — a page with no chat panel — and the
 * caller drops the row.
 */
export function useBoundAction(id: ActionId): BoundAction | null {
  useSyncExternalStore(subscribe, getBindingChangeCount)
  // The first in stack order — the one the dispatcher would fire.
  return bindingRefs.find((ref_) => ref_.current.id === id)?.current ?? null
}
