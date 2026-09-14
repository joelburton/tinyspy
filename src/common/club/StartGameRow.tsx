// cs-audited-club-page

import type { GameManifest } from '../manifest/gameManifest'
import { playerCountShort } from '../manifest/gameManifest'
import { GameEntry } from './GameEntry'

type Props = {
  // The gametype this row offers.
  game: GameManifest
  // Whether this is a solo club (handle starts with '='). Suppresses the
  // "Co-op" badge and the player count — both are noise when there's only one
  // member and every game there is played by them.
  soloClub: boolean
}

/**
 * One startable gametype's row in ClubPage's "Start a new game" list.
 *
 * A `<GameEntry>` whose second line is the gametype's description and player
 * count, and which has no date — nothing has been played yet. What is left
 * here is deciding those words; the shape is the shared one.
 *
 * The list owns the box, the hover, the cursor ring and the click; it also owns
 * whether this row is choosable at all — a gametype the club's member count
 * doesn't fit is passed to `disabled`, and the list dims it and declines Enter.
 * (docs/ui.md → Selection lists).
 *
 * The name is the prominent first line, the description the subtle second, so a
 * column of these reads as "options to consider" rather than "actions to take"
 * — the actual primary action (Start) lives inside the SetupGameModal one
 * click later.
 */
export function StartGameRow({ game, soloClub }: Props) {
  return (
    <GameEntry
      manifest={game}
      title={game.name}
      // One node, not a text run: `.meta` is a flex row and would space the
      // pieces apart. No `date` — nothing has been played yet.
      meta={
        <>
          {game.shortDescription}
          {!soloClub && ` · ${playerCountShort(game.numberOfPlayers)}`}
        </>
      }
      soloClub={soloClub}
    />
  )
}
