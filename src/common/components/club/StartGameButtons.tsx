import type { GameManifest } from '../../lib/games'
import {
  playerCountFits,
  playerCountLabel,
  playerCountShort,
} from '../../lib/games'
import { GameLogo } from '../branding/GameLogo'
import { ModePill } from '../game/ModePill'
import styles from './StartGameButtons.module.css'

type Props = {
  /** The gametypes to render buttons for. The caller pre-filters
   *  (ClubPage by the club's allowed-gametype m2m). This
   *  component doesn't apply its own filtering on top. */
  games: GameManifest[]
  /** Member count used to derive each button's disabled state via
   *  the manifest's numberOfPlayers range. ClubPage passes the
   *  current club's `members.length`. */
  memberCount: number
  /**
   * Click handler. Receives the gametype string. Named
   * `onStartSetup` (not `onStart`) to disambiguate the two
   * phases that both used to be called "start":
   *
   *   - **startSetup** (this callback): user clicks a button
   *     here, ClubPage opens the setup dialog. The game does
   *     NOT exist yet.
   *   - **startGame**: user clicks Start inside the dialog,
   *     SetupGameDialog calls `manifest.startGameInClub`, the
   *     game is actually created.
   *
   * See docs/naming.md → "start" for the convention.
   */
  onStartSetup: (gametype: string) => void
  /** Whether this is a solo club (handle starts with '='). Forwarded
   *  to <ModePill> so the "Co-op" pill is suppressed — mode is noise
   *  when there's only one player. */
  soloClub: boolean
}

/**
 * Per-gametype "Start" buttons rendered on ClubPage. One outline
 * card per gametype in `games`, each showing:
 *
 *   [logo]  <gametype name>
 *           <short description> · <player-count badge>
 *
 * Logo on the left (the same `<GameLogo>` the GamePage header
 * uses, so the visual identity carries across surfaces), then a
 * stacked title + meta line on the right. The name is the
 * prominent first line; the description + player count is the
 * subtle second line. The button is an outline-style card (no
 * background fill) so a column of three buttons reads as
 * "options to consider" rather than "primary actions to take" —
 * the actual primary action (Start) lives inside the SetupGameDialog
 * one click later.
 *
 * Hover changes the border color to the accent so the affordance
 * still reads as clickable. Disabled state (when the club's member
 * count doesn't fit the gametype's range) greys the whole card and
 * the tooltip explains *why* via `playerCountLabel`.
 */
export function StartGameButtons({
  games,
  memberCount,
  onStartSetup,
  soloClub,
}: Props) {
  return (
    <div className={styles.list}>
      {games.map((g) => {
        const fits = playerCountFits(g.numberOfPlayers, memberCount)
        return (
          <button
            key={g.gametype}
            type="button"
            className={styles.button}
            onClick={() => onStartSetup(g.gametype)}
            disabled={!fits}
            // Tooltip only when the button is disabled — explains
            // WHY clicking would have done nothing. When enabled,
            // the meta line already tells the user the player
            // count, so no extra tooltip.
            title={fits ? undefined : playerCountLabel(g.numberOfPlayers)}
          >
            <GameLogo gametype={g.gametype} />
            <span className={styles.content}>
              <span className={styles.titleRow}>
                <span className={styles.title}>{g.name}</span>
                <ModePill mode={g.mode} soloClub={soloClub} />
              </span>
              <span className={styles.meta}>
                {g.shortDescription}
                {/* Player count is noise in a solo club — every game
                    there is played by the one member. Still shown for
                    friend clubs, where it's load-bearing. */}
                {!soloClub && (
                  <>
                    {' · '}
                    {playerCountShort(g.numberOfPlayers)}
                  </>
                )}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
