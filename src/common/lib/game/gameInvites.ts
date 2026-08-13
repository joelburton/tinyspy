/**
 * Game-invitation model — the data + pure logic behind the "Moth added
 * you to a new spellingbee game" popup (see `useGameInvitations`).
 *
 * Games seat every player at creation (a `common.game_players` row each),
 * but we no longer drag people into the game. Instead, wherever a player
 * is in the app, being added to a game pops an invitation they can Join
 * (or dismiss — the game also shows up on the club page either way).
 *
 * The "seen" set (localStorage) is what keeps a single invite from
 * re-popping: once a game's invite has been surfaced, it's marked seen,
 * so a reload (or the periodic refetch that recovers invites missed while
 * offline) won't show it again. Recovery if dismissed is the club page,
 * not a re-nag.
 */

/** A non-terminal game the caller is a player in, as fetched for the
 *  invitation check (before inviter-name / display-name resolution). */
export type InviteCandidate = {
  id: string
  gametype: string
  club_handle: string
  created_by: string
}

/** A pending invitation, ready to render as a popup. */
export type GameInvite = {
  gameId: string
  gametype: string
  /** Display name from the manifest registry (e.g. "spellingbee (coop)"). */
  gameName: string
  clubHandle: string
  /** The game's creator — "<inviterName> added you to a new …". */
  inviterName: string
}

/**
 * How recent a game must be to still be worth an invitation.
 *
 * **Why an age limit at all.** The scan's only other bound is
 * `is_terminal = false`, and that is NOT a proxy for "recent": an abandoned
 * game never becomes terminal — nobody ends it, it just sits there — so the
 * candidate pool is every unfinished game you have ever been seated in, and it
 * grows forever. The `seen` set below hid that, right up until it was empty:
 * signing in on a new device / another browser / after clearing storage popped
 * the whole accumulated backlog at once. (`SEEN_CAP` eviction gets there too,
 * more slowly.) Capping the age fixes the cause; `seen` still does its own job
 * of not nagging twice about one fresh invite.
 *
 * An hour, not minutes: the backlog this kills is games days or weeks old, and
 * a longer window costs nothing while still catching an invite you stepped away
 * from. Past it, the game is still on the club page — an invitation is a nudge,
 * not the only route in.
 *
 * The cutoff is computed against the CLIENT clock, so a device more than an
 * hour off would misjudge it. Deliberately not defended against: doing it
 * server-side means an RPC, and half-hour clock skew doesn't happen on
 * NTP-synced devices.
 */
export const INVITE_MAX_AGE_MS = 60 * 60_000

/** The oldest `common.games.started_at` an invitation may carry, as the ISO
 *  string PostgREST wants. (`started_at` is the creation stamp — `common.games`
 *  has no `created_at`.) */
export function inviteCutoffIso(now: number = Date.now()): string {
  return new Date(now - INVITE_MAX_AGE_MS).toISOString()
}

/**
 * Pure: of the games the caller is a player in, which are *new*
 * invitations? Drops games the caller created (they're already in it)
 * and ones already surfaced (`seen`). The currently-viewed game is NOT
 * filtered here — that's a display concern handled at render, so a game
 * you're actively in still gets marked seen and never pops later.
 *
 * Age is NOT filtered here — that rides on the query (`inviteCutoffIso`), so
 * the stale rows never leave the database.
 */
export function newInviteCandidates(
  candidates: InviteCandidate[],
  ctx: { selfId: string; seen: ReadonlySet<string> },
): InviteCandidate[] {
  return candidates.filter(
    (c) => c.created_by !== ctx.selfId && !ctx.seen.has(c.id),
  )
}

// ─── seen-set (localStorage, survives reloads) ──────────────────────
const SEEN_KEY = 'puzpuzpuz:gameInvitesSeen'
const SEEN_CAP = 200 // bound growth; keep the most recent

export function loadSeenInvites(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function markInviteSeen(gameId: string): void {
  try {
    const seen = loadSeenInvites()
    seen.add(gameId)
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-SEEN_CAP)))
  } catch {
    // localStorage unavailable (private mode, etc.) — invites just won't
    // dedup across reloads. Acceptable; the club page is still the
    // durable entry point.
  }
}
