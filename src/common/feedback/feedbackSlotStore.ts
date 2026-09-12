// cs-audited-feedback

import type { FeedbackMessage } from './FeedbackMessage'

/**
 * The feedback slot's list rules, with no React in them: `FeedbackSlot` is
 * the shape every host hands around (its docstring is the one to read first),
 * and `createFeedbackSlot` makes one. `useFeedbackSlot` is the hook that owns
 * an instance for a component's life.
 */

export type SlotName = 'local' | 'global'

/** A live message in a slot, with the id `show` stamped on it. */
export type SlotEntry = {
  id: string
  message: FeedbackMessage
}

/**
 * A FEEDBACK SLOT — the list of live feedback messages one place on screen
 * holds, and the rule for which one it draws.
 *
 * Made by `useFeedbackSlot` and handed around as this type: `show(msg)` is the
 * one door in and returns an id; `retract(id)` is how the owner of a condition
 * takes its message back; `dismiss()` and `close()` are the player's two ways
 * out, a gesture and the ×, each honored only by the kinds that leave that
 * way. The pill subscribes to `top`.
 *
 * One rule, and it is the whole design of the list: the slot draws the LOWEST
 * rank, and ties go to the newest. Nothing is discarded on the way in — a
 * message leaves only the way its kind says it leaves, so when the message on
 * top is retracted, whatever is still live underneath is drawn again.
 */
export type FeedbackSlot = {
  readonly name: SlotName
  // Put a message up. Returns its id, for `retract`.
  show: (message: FeedbackMessage) => string
  // Take a message down by id — the owner of a condition, when it ends.
  // No-op if it is already gone.
  retract: (id: string) => void
  // The player's next action (a key, a tile click, a tap): removes the top
  // message if it leaves by gesture.
  dismiss: () => void
  // The × on the pill: removes the top message if it leaves by the ×.
  close: () => void
  // The message the slot draws, or null. Reference-stable per change.
  getTop: () => FeedbackMessage | null
  // Subscribe to changes of `top`; the hook wires this to `useSyncExternalStore`.
  subscribe: (listener: () => void) => () => void
  // Every live entry, lowest rank first — a test seam, and the console's.
  peek: () => readonly SlotEntry[]
  // Clear every timer. Called by the hook on unmount; the slot is dead after.
  destroy: () => void
}

let seq = 0

/** The pure ordering rule: lowest rank first, and within a rank the newest first. */
function byRankThenNewest(entries: readonly SlotEntry[]): SlotEntry[] {
  // `sort` is stable, so reversing first makes "newest first" the tie order.
  return [...entries].reverse().sort((a, b) => a.message.rank - b.message.rank)
}

/**
 * The toast store's shape held per instance rather than as a module
 * singleton, because a slot must die with its PlayArea or page: `destroy()`
 * clears every pending timer, and the hook calls it on unmount.
 */
export function createFeedbackSlot(name: SlotName): FeedbackSlot {
  let entries: SlotEntry[] = []
  let top: FeedbackMessage | null = null
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const listeners = new Set<() => void>()

  function emit(): void {
    const next = byRankThenNewest(entries)[0]?.message ?? null
    // `useSyncExternalStore` needs a stable snapshot when nothing changed.
    if (next === top) return
    top = next
    for (const l of listeners) l()
  }

  function drop(id: string): void {
    const t = timers.get(id)
    if (t !== undefined) {
      clearTimeout(t)
      timers.delete(id)
    }
    entries = entries.filter((entry) => entry.id !== id)
  }

  function show(message: FeedbackMessage): string {
    const id = `${name}-${++seq}`
    entries = [...entries, { id, message }]
    if (message.leavesBy === 'timer' && message.ms !== null) {
      timers.set(id, setTimeout(() => retract(id), message.ms))
    }
    emit()
    return id
  }

  function retract(id: string): void {
    if (!entries.some((entry) => entry.id === id)) return
    drop(id)
    emit()
  }

  function removeTopIf(leavesBy: FeedbackMessage['leavesBy']): void {
    const first = byRankThenNewest(entries)[0]
    if (first === undefined || first.message.leavesBy !== leavesBy) return
    retract(first.id)
  }

  return {
    name,
    show,
    retract,
    dismiss: () => removeTopIf('gesture'),
    close: () => removeTopIf('close'),
    getTop: () => top,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    peek: () => byRankThenNewest(entries),
    destroy: () => {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
      entries = []
      emit()
    },
  }
}
