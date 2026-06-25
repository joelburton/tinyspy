/**
 * Profile-color → CSS variable resolver.
 *
 * Each user's `common.profiles.color` is a name from a fixed
 * 8-entry palette (see the column's check constraint and
 * common.color_for_username in the baseline migration). The FE
 * never hard-codes the hex — it asks `colorVarFor(name)` for a
 * `var(--color-member-NAME)` reference, and theme.css owns the
 * actual shade. That indirection means a future dark theme can
 * remap each palette entry without rewriting every consumer.
 *
 * Used wherever a member's identity needs a visual anchor — the
 * member-list circles, chat name labels, per-member in-game
 * affordances (tile-selection borders, etc.), per-game guess/
 * clue history rows.
 */

// The same 8 names as the DB check constraint on
// common.profiles.color.
//
// `MEMBER_COLORS` is the ordered palette, exported so the "Edit
// profile" color picker can map over it (each rendered as its
// `--color-member-NAME` swatch). Keep in sync with the DB CHECK and
// the `common.update_profile_color` RPC allow-list.
export const MEMBER_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const

// Mirrored as a Set so the FE can defend against an unknown value (a
// future palette extension that updated the DB but not the FE; in the
// meantime the unknown name falls through to the body-text color,
// which beats a broken `var(--color-member-undefined)` reference).
const VALID = new Set<string>(MEMBER_COLORS)

/**
 * Return the CSS variable reference for a profile color name.
 * Falls back to body-text color when the name is missing or
 * unknown — never throws, never returns an invalid CSS value.
 *
 * Use as a `style={{ color: colorVarFor(member.color) }}` or
 * `style={{ background: colorVarFor(member.color) }}` directly
 * — no need for a wrapping helper at every call site.
 */
export function colorVarFor(name: string | null | undefined): string {
  return name && VALID.has(name)
    ? `var(--color-member-${name})`
    : 'var(--color-text)'
}

/**
 * A deterministic default palette color for a username — what the claim
 * form pre-selects so a new player isn't picking from a blank slate.
 *
 * A *simple* FE-only hash (not Postgres' `hashtext`): the server doesn't
 * derive a color any more — `claim_username` just stores whatever color
 * the form sends — so this only needs to be stable and reasonably spread
 * across the 8 colors, not match any DB function. (`common.color_for_
 * username` still exists for direct SQL inserts like the test personas.)
 */
export function defaultColorFor(username: string): string {
  let h = 0
  for (let i = 0; i < username.length; i++) {
    h = (h * 31 + username.charCodeAt(i)) | 0 // keep it a 32-bit int
  }
  return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length]
}

/**
 * Build a `user_id → color CSS var` lookup map from a member
 * roster. Convenient for components that need to color N items
 * by their owner without doing the lookup themselves N times.
 * Values are pre-resolved to `var(--color-member-NAME)` strings —
 * ready to drop into a `style={{ ... }}` prop.
 */
export function colorByUserIdMap<
  M extends { user_id: string; color: string },
>(members: readonly M[]): ReadonlyMap<string, string> {
  return new Map(members.map((m) => [m.user_id, colorVarFor(m.color)]))
}
