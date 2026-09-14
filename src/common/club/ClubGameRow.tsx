// cs-audited-club-page

import type { GameManifest } from '../manifest/gameManifest'
import { friendlyDate } from '../utils/friendlyDate'
import { GameEntry, type ClubGameState } from './GameEntry'
import { ClubGameDeleteButton } from './ClubGameDeleteButton'

type Props = {
  /** The gametype's manifest — drives the logo and the mode badge. ClubPage has
   *  it in hand for every row it builds. */
  manifest: GameManifest
  // The algorithmic per-game title, from `common.games.title` — `not null`
  // there, and resolved by ClubPage before it builds the row.
  title: string
  /** Gametype-rendered status string, e.g. "13/16 agents" or "lost (assassin)".
   *  Produced by the manifest's `labelFor`. */
  statusLabel: string
  /** `common.games.last_active_at`, ISO — the last status/progress write (or end
   *  time), a "last played" proxy. Rendered via friendlyDate. */
  lastActiveAt: string
  // Where in the lifecycle this game sits. Drives exactly one thing: the corner
  // flag <GameEntry> draws (orange = the club's current game, yellow = shelved
  // but still open, none = finished).
  state: ClubGameState
  /** Whether this row's club is a solo club. Forwarded to <ModeBadge> so the
   *  "Co-op" badge is suppressed there. */
  soloClub: boolean
  /** Omit and the row is read-only — no delete affordance renders. */
  onDelete?: () => Promise<void> | void
}

/**
 * One game's row in ClubPage's "Your games" list — the CONTENTS of a
 * `<SelectionList>` row, not the row itself. The list owns the box, the hover,
 * the cursor ring and the click; this owns what is inside it:
 *
 *   [logo]  <title> <mode badge>
 *           <status> ······················ <last played>
 *
 * with a corner flag when the game is still open and a hover-revealed delete ×.
 *
 * **A row, not a card.** `.card` is a page-level pattern in this repo — a
 * bordered section of a page — and a list item is not one. The standalone
 * current-game callout above the list is a separate component that happens to
 * wear a similar face; it is not a list of one (Joel, 2026-08-24), and the two
 * sharing an inner shape is a question for the club-page area rather than for
 * this pass (docs/ui.md → Selection lists).
 */
export function ClubGameRow({
  manifest,
  title,
  statusLabel,
  lastActiveAt,
  state,
  soloClub,
  onDelete,
}: Props) {
  // Friendly relative date — see friendlyDate.ts. Doesn't tick; re-renders when
  // ClubPage refetches via realtime, which is often enough for a game list.
  const dateLabel = friendlyDate(lastActiveAt)

  return (
    <>
      <GameEntry
        manifest={manifest}
        title={title}
        meta={statusLabel}
        date={dateLabel}
        soloClub={soloClub}
        state={state}
      />
      {onDelete && <ClubGameDeleteButton onDelete={onDelete} />}
    </>
  )
}
