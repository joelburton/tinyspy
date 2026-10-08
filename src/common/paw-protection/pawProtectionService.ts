// cs-unmet

import { useSyncExternalStore } from 'react'
import { db } from '../supabase/db'
import { readRows } from '../supabase/dbResult'
import type { Database } from '@/types/db'

/**
 * Ask paw protection before a game is started, from anywhere, with no
 * component in the way:
 *
 *     if (!(await ensureCanStart({ clubHandle, gametype }))) return
 *
 * A club can cap how many games of a gametype are started each day
 * (docs/common-schema.md → Paw protection). This reads the club's row for the
 * gametype fresh — friends start games while a page sits open — and either
 * answers true, or shows the paw-protection modal and answers false once it
 * is dismissed. The server counts and refuses too; this is what makes its
 * refusal a fault, since every start asks here first.
 *
 * **Two callers, one question.** The club page asks at the press of a start
 * row, with the club and gametype in hand. The game page's New game is an
 * action whose shared run asks, wherever the action was bound, and the run
 * cannot know the club — so the page REGISTERS its subject
 * (`registerPawSubject`) and the run asks `ensureCanStartRegistered`.
 *
 * The modal is drawn by `<PawProtectionHost>` at the app root, the way a
 * confirmation is: the code asking is usually not a component. With no host
 * mounted the answer is no — a start the modal could not refuse would be one
 * the server refuses as a fault.
 */

/** Which club's gametype a start is about. */
export type PawSubject = { clubHandle: string; gametype: string }

/** The two columns the gate reads off `clubs_gametypes_today`: the cap and
 *  today's count, with the UTC-day rule already applied. */
type PawRow = Pick<
  Database['common']['Views']['clubs_gametypes_today']['Row'],
  'max_daily_games' | 'used_today'
>

/** A refusal on screen: whose cap, and what it is, for the card's words. */
type Pending = { gametype: string; cap: number; resolve: () => void }

let pendingRefusal: Pending | null = null
// Whether a `<PawProtectionHost>` is mounted to draw the refusal.
let isHostMounted = false
// The page's subject, for the New game action's run.
let registeredSubject: PawSubject | null = null
// A listener is a callback: each `usePendingRefusal()` caller adds one, and
// showing or dismissing a refusal calls every one to say it has changed.
const listeners = new Set<() => void>()

/** Tell the host the pending refusal changed. */
function notify(): void {
  for (const listener of listeners) listener()
}

/** The host's subscription, in the shape `useSyncExternalStore` takes. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getPendingRefusal(): Pending | null {
  return pendingRefusal
}

/** Show the modal and resolve false once it is dismissed. */
function refuse(gametype: string, cap: number): Promise<boolean> {
  if (!isHostMounted) {
    console.error(
      'ensureCanStart: no <PawProtectionHost> is mounted — refusing the start')
    return Promise.resolve(false)
  }
  return new Promise<boolean>((resolve) => {
    // A refusal already up resolves; the new one replaces it. Unreachable from
    // a modal-blocked UI, but it beats a dangling promise.
    pendingRefusal?.resolve()
    pendingRefusal = { gametype, cap, resolve: () => resolve(false) }
    notify()
  })
}

/**
 * May a game of this gametype be started in this club now? True when the club
 * has no cap on it or the cap is not spent. False after the modal has been
 * dismissed — or at once when the read failed, since the wrapper has shown
 * that fault and a start on top of it would show another.
 *
 * A club with no row for the gametype answers true: the club page lists only
 * what the club has, so a missing row is a bug, and the server's refusal is
 * the one that should name it.
 */
export async function ensureCanStart(subject: PawSubject): Promise<boolean> {
  const res = await readRows(
    db
      .from('clubs_gametypes_today')
      .select('max_daily_games, used_today')
      .eq('club_handle', subject.clubHandle)
      .eq('gametype', subject.gametype),
  )
  if (res.type === 'not-ok') return false
  const row = res.data[0] as PawRow | undefined
  if (!row || row.max_daily_games === null) return true
  // The view answers a number; the generated type cannot say so.
  if (row.used_today! < row.max_daily_games) return true
  return refuse(subject.gametype, row.max_daily_games)
}

/**
 * The same question, about the subject the page registered. For the shared
 * action run, which knows the action is paw-protected and nothing else. A
 * page that bound a paw-protected action without registering is a bug; it is
 * reported and the start is let through, so the server's fault names it
 * rather than a button that silently does nothing.
 */
export function ensureCanStartRegistered(): Promise<boolean> {
  if (!registeredSubject) {
    console.error(
      'ensureCanStartRegistered: no subject registered — letting the start through')
    return Promise.resolve(true)
  }
  return ensureCanStart(registeredSubject)
}

/**
 * Register the club and gametype the page's New game would start, for as long
 * as the page is up. Returns the release, for the page's mount effect; a
 * release after another page has registered leaves that page's subject alone.
 */
export function registerPawSubject(subject: PawSubject): () => void {
  registeredSubject = subject
  return () => {
    if (registeredSubject === subject) registeredSubject = null
  }
}

/** Dismiss the pending refusal. The host's button, and Escape. */
export function dismissRefusal(): void {
  pendingRefusal?.resolve()
  pendingRefusal = null
  notify()
}

/** The refusal on screen, or null. The host subscribes; nobody else needs to. */
export function usePendingRefusal(): Pending | null {
  return useSyncExternalStore(subscribe, getPendingRefusal)
}

/** Claim the host slot, and return the release — for `<PawProtectionHost>`'s
 *  own mount effect. */
export function registerPawProtectionHost(): () => void {
  isHostMounted = true
  return () => {
    isHostMounted = false
  }
}

/** Forget the host, the subject and any refusal: a test's clean slate. */
export function ZTest_resetPawProtection(): void {
  pendingRefusal?.resolve()
  pendingRefusal = null
  isHostMounted = false
  registeredSubject = null
  notify()
}
