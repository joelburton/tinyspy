// cs-audited-members

/**
 * Profile-color → CSS variable resolver.
 *
 * Each user's `common.profiles.color` is a name from a fixed
 * 8-entry palette (the column's check constraint holds the eight;
 * `common.color_for_username` picks one, in `supabase/sql/common.sql`). The FE
 * never hard-codes the hex — it asks `colorVarFor(name)` for a
 * `var(--member-NAME-fill-color)` reference, and `core-css/fixed.css` owns the
 * actual shade. The point of that indirection is that the hex lives in ONE
 * file: a consumer names the player and never the shade. (It is not theme
 * groundwork — the eight member colors are exempt from theming, docs/ui.md →
 * "Player identity = a colored disc".)
 */

/**
 * The eight profile colors, by name — the palette a player picks from and the
 * only values `common.profiles.color` will hold.
 *
 * The same names the SQL writes out in four places: the CHECK on that column,
 * the array `color_for_username` picks from, and the two allow-lists that
 * reject anything else. They are held together by
 * `src/guards/memberPalette.test.ts`, not by remembering.
 *
 * The ORDER is this list's own — it is the palette a swatch grid lays out, so
 * reordering here reorders the picker, and SQL has no opinion about it.
 */
export const MEMBER_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'brown',
  'blue',
  'purple',
  'pink',
] as const

// Mirrored as a Set so the FE can defend against a name it does not know. The
// guard above keeps the repo consistent; what it cannot cover is a DEPLOY that
// is not — a migration adding a ninth color reaches the database before the
// bundle that knows it, and a tab left open is older still. An unknown name
// falls through to the body-text color, which beats a broken
// `var(--member-undefined-fill-color)` reference.
const VALID = new Set<string>(MEMBER_COLORS)

/**
 * Return the CSS variable reference for a profile color name.
 * Falls back to body-text color when the name is missing or
 * unknown — never throws, never returns an invalid CSS value.
 *
 * The reference paints a SHAPE the player owns — a disc's fill, a glyph, a
 * tile tint. It does not paint their NAME: identity rides the disc and never
 * the text (docs/ui.md → "Player identity = a colored disc"), so a name beside
 * a disc stays body-text color. Reach for `<ActorDot>` / `<DotActor>`
 * (`common/members/ActorMention`) when what you want is the pair.
 */
export function colorVarFor(name: string | null | undefined): string {
  return name && VALID.has(name)
    ? `var(--member-${name}-fill-color)`
    : 'var(--page-text-color)'
}

/**
 * The paired EDGE shade for a profile color — the ring the shared `<Dot>`
 * draws around the fill (`core-css/fixed.css` defines a
 * `--member-NAME-edge-color` companion for every fill, OKLCH-darkened so a
 * light fill like yellow stays visible against the page background). Same
 * fallback contract as `colorVarFor`: a missing/unknown name gets the
 * body-text color.
 */
export function borderVarFor(name: string | null | undefined): string {
  return name && VALID.has(name)
    ? `var(--member-${name}-edge-color)`
    : 'var(--page-text-color)'
}

/**
 * A deterministic default palette color for a username — what the claim form
 * pre-selects so a new player isn't picking from a blank slate. Stable: the
 * same username always gets the same color.
 */
export function defaultColorFor(username: string): string {
  // A simple hash, deliberately not Postgres' `hashtext`. The server doesn't
  // derive a color any more — `claim_username` stores whatever the form sends
  // — so this only has to be stable and reasonably spread across the eight,
  // not agree with any DB function. (`common.color_for_username` still exists,
  // for direct SQL inserts such as the test personas.)
  let h = 0
  for (let i = 0; i < username.length; i++) {
    h = (h * 31 + username.charCodeAt(i)) | 0 // keep it a 32-bit int
  }
  return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length]
}

/**
 * Build a `user_id → color CSS var` lookup map from a member roster — for a
 * surface painting many owned things at once, so it resolves the roster once
 * instead of per item.
 *
 * Values are `colorVarFor`'s, and carry its rule with them: they paint a shape
 * the player owns, never their name.
 */
export function colorByUserIdMap<
  M extends { user_id: string; color: string },
>(members: readonly M[]): ReadonlyMap<string, string> {
  return new Map(members.map((m) => [m.user_id, colorVarFor(m.color)]))
}
