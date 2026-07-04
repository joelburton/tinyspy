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
 * Pure: of the games the caller is a player in, which are *new*
 * invitations? Drops games the caller created (they're already in it)
 * and ones already surfaced (`seen`). The currently-viewed game is NOT
 * filtered here — that's a display concern handled at render, so a game
 * you're actively in still gets marked seen and never pops later.
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
