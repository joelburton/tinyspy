// cs-blessed-psychicnum

import type { GGameData } from '../types'


/**
 * psychicnum's core live-state readout — "1/3 found · 4/7 guesses used". The
 * counts are the team's in coop and my own in compete: `gd.team` where the
 * game has one, else `gd.me` (plans/team-facts.md).
 *
 * Its own component because it's rendered TWICE, in two places that must never
 * drift: the info column's `.infoState` line (desktop) and the mobile
 * `<MobileStatusBar>` above the board (below the `--mobile` breakpoint, where
 * the info column is off-canvas in the InfoSheet). Bare inline content — each
 * caller supplies its own wrapper element + text styling.
 *
 * The counters are bold and the labels aren't: the numbers are what's read at
 * a glance.
 */
export function StateLine({ gd }: { gd: GGameData }) {
  const counts = gd.team ?? gd.me
  return (
    <>
      <strong>
        {counts.foundSecretsCount}/{gd.me.requiredSecretsCount}
      </strong>{' '}
      found ·{' '}
      <strong>
        {counts.guessesUsed}/{gd.me.maxGuesses}
      </strong>{' '}
      guesses used
    </>
  )
}
