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
// common.profiles.color. Mirrored here so the FE can defend
// against an unknown value (a future palette extension that
// updated the DB but not the FE; in the meantime the unknown
// name falls through to the body-text color, which beats a
// broken `var(--color-member-undefined)` reference).
const VALID = new Set([
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
])

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
