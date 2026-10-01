// cs-fixed-actions

import { useSyncExternalStore } from 'react'
import type { ActionId } from './registry'
import type { Action } from './useBindAction'

/**
 * Every action bound on the page right now. `useBindAction` puts each action
 * here while its component is mounted (`registerAction`); everything that
 * shows or fires actions without binding them reads from here — Help's key
 * list and the game menu (`useActions`, `useAction`), and the key
 * dispatcher (`getActions`).
 */

// The stack of live actions, in the order they mounted. Module-level rather
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
const bindingRefs: Array<{ current: Action }> = []

// A listener is a callback: each `useActions()` / `useAction()`
// caller adds one, and an action joining or leaving calls every one.
const listeners = new Set<() => void>()

// How many times an action has joined or left. The hooks read it so a surface
// that draws a LIST of actions re-renders; deliberately not counted when an
// action merely re-renders: what an action says is read by asking it,
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
 *  calls it from an effect, so each action sits in the stack for exactly as
 *  long as its component is mounted. */
export function registerAction(ref_: { current: Action }): () => void {
  bindingRefs.push(ref_)
  notify()
  return () => {
    bindingRefs.splice(bindingRefs.indexOf(ref_), 1)
    notify()
  }
}

/** Every action on the page right now, in stack order. Re-renders the caller
 *  when an action joins or leaves — not when one changes what it would say, so
 *  a surface built from this asks each action as it draws. */
export function useActions(): Action[] {
  useSyncExternalStore(subscribe, getBindingChangeCount)
  return bindingRefs.map((ref_) => ref_.current)
}

/** Every action on the page right now, in stack order, for a reader that is
 *  not a component — the key dispatcher. Read at the moment of the keystroke,
 *  never held. */
export function getActions(): Action[] {
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
export function useAction(id: ActionId): Action | null {
  useSyncExternalStore(subscribe, getBindingChangeCount)
  // The first in stack order — the one the dispatcher would fire.
  return bindingRefs.find((ref_) => ref_.current.id === id)?.current ?? null
}
