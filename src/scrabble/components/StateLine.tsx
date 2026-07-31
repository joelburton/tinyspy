import { Dot } from '../../common/components/text/Dot'
import type { Member } from '../../common/lib/games'

/**
 * scrabble's core live-state readout — "Your turn · 7 in bag" (compete, mine),
 * "Turn: ● moth · 7 in bag" (compete, theirs), or "Team score: 152 · 7 in bag"
 * (coop).
 *
 * Its own component because it's rendered TWICE, in two places that must never
 * drift: the info column's `.infoState` line (desktop) and the mobile
 * `<MobileStatusBar>` above the board (below the `--mobile` breakpoint, where
 * the info column is off-canvas in the InfoSheet). Bare inline content — each
 * caller supplies its own wrapper element + text styling. Same shape as
 * psychicnum's and waffle's `StateLine` (docs/mobile.md → the status bar).
 *
 * The other player's turn reads "Turn: ● name" — a leading color disc and the
 * bare name, never the possessive "name's turn" (we don't apostrophize
 * usernames).
 */
export function StateLine({
  isCompete,
  myTurn,
  currentMember,
  teamScore,
  bagCount,
}: {
  isCompete: boolean
  /** Compete: is it my seat's turn? (Always true in coop, which has no turns.) */
  myTurn: boolean
  /** Whose turn it is — a human from the roster, or the synthetic "AI n" member. */
  currentMember: Member | undefined
  /** Coop's shared score (compete reads per-player scores off the OpponentStrip). */
  teamScore: number | null
  /** Tiles left in the bag — the shared clock of a scrabble game. */
  bagCount: number
}) {
  return (
    <>
      {isCompete ? (
        myTurn ? (
          <strong>Your turn</strong>
        ) : (
          <>
            Turn: <Dot color={currentMember?.color} /> {currentMember?.username ?? 'someone'}
          </>
        )
      ) : (
        <>
          Team score: <strong>{teamScore ?? 0}</strong>
        </>
      )}
      {' · '}
      {bagCount} in bag
    </>
  )
}
