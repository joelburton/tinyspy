// cs-blessed-psychicnum

import type { GPlayer } from '../types'


/**
 * psychicnum's core live-state readout — "1/3 found · 4/7 guesses used" — for
 * one player: the viewer's own counts in compete, the team's in coop, as the
 * player carries them.
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
export function StateLine({ player }: { player: GPlayer }) {
  return (
    <>
      <strong>
        {player.foundSecretsCount}/{player.requiredSecretsCount}
      </strong>{' '}
      found ·{' '}
      <strong>
        {player.guessesUsed}/{player.maxGuesses}
      </strong>{' '}
      guesses used
    </>
  )
}
