import { Dot } from '../../common/components/text/Dot'
import type { Member } from '../../common/lib/games'

/**
 * scrabble's core live-state readout — "Your turn · 7 in bag" (compete, mine),
 * "Turn: ● moth · 7 in bag" (compete, theirs), or "Team score: 152 · 7 in bag"
 * (coop). At terminal the compete line reads "Ended · 0 in bag".
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
  isTerminal,
  myTurn,
  currentMember,
  teamScore,
  bagCount,
}: {
  isCompete: boolean
  /**
   * The game is over, so no clause may claim a turn.
   *
   * Only compete needs this: its first clause IS the turn indicator, and left
   * alone a finished game went on saying "Your turn". Coop's first clause is the
   * team score, which stays true at terminal, so it is untouched.
   *
   * The other seven turn games get this for free from the shared
   * `<TurnStatusLine>`, which goes inert at terminal — scrabble compete is the
   * one game that doesn't render it (the turn indicator is folded in here, and
   * this line predates the shared one it was extracted into).
   */
  isTerminal: boolean
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
        // "Ended" rather than a blank, because unlike the shared TurnStatusLine
        // this line has a SECOND clause to carry: a bare "0 in bag" with nothing
        // in front of it reads as a fragment. The bullet is the same separator
        // the live line uses, so terminal isn't a new shape — just a new subject.
        isTerminal ? (
          <>Ended</>
        ) : myTurn ? (
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
