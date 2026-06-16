import type { SetupMember } from '../../common/lib/games'

type Props = {
  /** Tightened to only terminal values — the parent renders this
   *  component conditionally, gated on the active-state check.
   *  The narrow type enforces the convention at compile time:
   *  passing 'active' is a TS error. */
  status: 'won' | 'lost'
  /** The user_id of the player who guessed the target, or null. */
  winnerId: string | null
  /** The 1..10 secret. Sourced from `game.target` on the
   *  PlayArea side — the hook reveals it post-terminally and
   *  surfaces it as a regular field. Null while the lazy reveal
   *  is in flight; banner copy renders either way. */
  target: number | null
  /** True when the FE clock ran to zero. Switches the lost-state
   *  reason between "Out of time." and "Out of guesses." */
  timerExpired: boolean
  /** Roster, for resolving `winnerId` → username on the won case.
   *  Only read inside `usernameFor`, so the helper lives with the
   *  banner rather than in PlayArea. */
  members: SetupMember[]
}

/**
 * The win / lost outcome panel. Rendered conditionally by PlayArea
 * — only when there's a result to show. The component's name reads
 * truthfully ("ResultBanner" presupposes a result), and a reader
 * scanning PlayArea sees the win/loss gating at the parent without
 * needing to dive into this file.
 *
 * Why this is its own component even in a tiny game like
 * psychic-num:
 *
 *   - **Read-locality.** When you're scanning PlayArea to follow
 *     the active-game flow, you don't have to also scan two
 *     terminal branches. The terminal copy lives where it's used.
 *   - **Helper locality.** `usernameFor` is only meaningful on the
 *     won case; co-locating it with the component that needs it
 *     keeps it out of PlayArea's body.
 *
 * The pattern travels forward to larger games — a Tinyspy
 * `<ResultBanner>` will own its own status-summary copy and the
 * "who-broke-which-key-card" details that don't belong in the
 * main play render either.
 */
export function ResultBanner({
  status,
  winnerId,
  target,
  timerExpired,
  members,
}: Props) {
  const usernameFor = (userId: string) =>
    members.find((m) => m.user_id === userId)?.username ?? 'someone'

  if (status === 'won') {
    return (
      <section>
        <h2>We won!</h2>
        <p>
          {winnerId
            ? `${usernameFor(winnerId)} guessed it.`
            : 'Somebody guessed it.'}
          {target !== null && ` The number was ${target}.`}
        </p>
      </section>
    )
  }

  return (
    <section>
      <h2>We lost.</h2>
      <p>
        {timerExpired ? 'Out of time.' : 'Out of guesses.'}
        {target !== null && ` The number was ${target}.`}
      </p>
    </section>
  )
}
