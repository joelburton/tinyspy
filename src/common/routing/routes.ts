// cs-audited-routing

/**
 * The app's URL shapes, in one place: the two paths anything links to, and the
 * two matchers that recognize them coming back.
 *
 * Every destination in the app is a club or a game. A caller sending someone
 * somewhere calls `clubPath` or `gamePath` instead of writing the slashes
 * itself, and a caller asking "what is this path?" calls `matchClubRoute` or
 * `matchGameRoute`. Writers and readers sit in the same file on purpose: a
 * shape can only be tightened in one place, so the two sides cannot drift into
 * disagreeing about what a game id may look like.
 *
 * What each path SHOWS is still `App.tsx`'s question — this file knows how a
 * URL is spelled and nothing about the page behind it. The query string is the
 * caller's too: `?new=` is written by whoever hands off to ClubPage's setup
 * dialog and read there, and `router.ts` says why none of it is reactive.
 */

/** A club's page: `/c/joel-leah`. */
export function clubPath(handle: string): string {
  return `/c/${handle}`
}

/**
 * A game's page: `/g/wordle/<gameId>`.
 *
 * The gametype rides in the URL so a game id never has to be resolved across
 * schemas — with sixteen games, `/g/<id>` alone would not say which schema to
 * look the id up in, and the route stays purely structural this way.
 */
export function gamePath(gametype: string, gameId: string): string {
  return `/g/${gametype}/${gameId}`
}

/** `/c/<handle>`, with or without a trailing slash. */
const RE_CLUB_ROUTE = /^\/c\/(?<handle>[^/]+)\/?$/

/**
 * `/g/<gametype>/<gameId>`, with or without a trailing slash.
 *
 * The gametype allows UNDERSCORES so the sibling-manifest pair strings match
 * (`connections_coop`, `connections_compete`, `psychicnum_coop`, …); without
 * that, opening a sibling game falls through to the home page. It is matched
 * case-INSENSITIVELY and handed back exactly as the URL spelled it, because a
 * caller reporting an unknown gametype should echo what was typed; a caller
 * doing a registry lookup lowercases first.
 *
 * The id is matched LOOSELY — anything that is not a slash. Whether a string
 * could name a game is `GamePage`'s question, not this one's: it is where the
 * other "no such game" is answered, so both arrive at the same page instead of
 * a URL-shaped rule here and a row-shaped rule there.
 */
const RE_GAME_ROUTE = /^\/g\/(?<gametype>[a-z0-9_]+)\/(?<gameId>[^/]+)\/?$/i

/** The handle a club path names, or null if the path is not a club path. */
export function matchClubRoute(path: string): { handle: string } | null {
  const groups = path.match(RE_CLUB_ROUTE)?.groups
  return groups ? { handle: groups.handle } : null
}

/** The gametype and id a game path names, or null if it is not a game path. */
export function matchGameRoute(path: string): { gametype: string; gameId: string } | null {
  const groups = path.match(RE_GAME_ROUTE)?.groups
  return groups ? { gametype: groups.gametype, gameId: groups.gameId } : null
}
