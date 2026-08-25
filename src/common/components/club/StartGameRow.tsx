// cs-audited

import type { GameManifest } from '../../lib/games'
import { playerCountShort } from '../../lib/games'
import { GameLogo } from '../branding/GameLogo'
import { ModePill } from '../game/ModePill'
import styles from './StartGameRow.module.css'

type Props = {
  /** The gametype this row offers. */
  game: GameManifest
  /** Whether this is a solo club (handle starts with '='). Suppresses the
   *  "Co-op" pill and the player count — both are noise when there's only one
   *  member and every game there is played by them. */
  soloClub: boolean
}

/**
 * One startable gametype's row in ClubPage's "Start a new game" list — the
 * CONTENTS of a `<SelectionList>` row, not the row itself:
 *
 *   [logo]  <gametype name> <mode pill>
 *           <short description> · <player count>
 *
 * The list owns the box, the hover, the cursor ring and the click; it also owns
 * whether this row is choosable at all — a gametype the club's member count
 * doesn't fit is passed to `disabled`, and the list dims it and declines Enter.
 * That predicate used to be evaluated twice, once for the paint here and once
 * for the keyboard in ClubPage (plans/selection-lists.md).
 *
 * The name is the prominent first line, the description the subtle second, so a
 * column of these reads as "options to consider" rather than "actions to take"
 * — the actual primary action (Start) lives inside the SetupGameModal one
 * click later.
 */
export function StartGameRow({ game, soloClub }: Props) {
  return (
    <>
      <GameLogo gametype={game.gametype} />
      <span className={styles.content}>
        <span className={styles.titleRow}>
          <span className={styles.gametypeName}>{game.name}</span>
          <ModePill mode={game.mode} soloClub={soloClub} aiOpponent={game.aiOpponent} />
        </span>
        <span className={styles.meta}>
          {game.shortDescription}
          {!soloClub && (
            <>
              {' · '}
              {playerCountShort(game.numberOfPlayers)}
            </>
          )}
        </span>
      </span>
    </>
  )
}
