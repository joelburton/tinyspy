/**
 * What the Hint button says when it's clicked too early.
 *
 * A one-line ternary in a component would do the job, and normally would — this
 * is a separate, tested function because of WHICH variant is the risky one.
 * `short === 1` isn't an edge case: it's the state a player sits in immediately
 * before every hint they ever earn, so "1 words needed" would be the most-seen
 * string in the whole economy. Pinning it costs three assertions.
 *
 * The count is literally words: `spend_hint`'s ledger adds exactly one point
 * per valid non-theme word (`hint_points + 1`, capped at the cost — see
 * supabase/sql/strands.sql), so "words" here is the unit, not an approximation
 * of one.
 */
export function hintShortfallText(short: number): string {
  return `${short} more word${short === 1 ? '' : 's'} needed for a hint`
}
