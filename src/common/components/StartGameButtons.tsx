import type { GameManifest } from '../lib/games'
import { playerCountFits, playerCountLabel } from '../lib/games'

type Props = {
  /** The gametypes to render buttons for. The caller pre-filters
   *  (ClubPage by the club's allowed-gametype m2m). This
   *  component doesn't apply its own filtering on top. */
  games: GameManifest[]
  /** Member count used to derive each button's disabled state via
   *  the manifest's numberOfPlayers range. ClubPage passes the
   *  current club's `members.length`. */
  memberCount: number
  /** Build the button label per game. ClubPage uses
   *  `(g) => \`Start ${g.name}\``. */
  getLabel: (game: GameManifest) => string
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
}

/**
 * Per-gametype "Start X" buttons rendered on ClubPage. One
 * button per gametype in `games`, each labeled by `getLabel`
 * and disabled if the club's member count is outside the
 * gametype's `numberOfPlayers` range.
 *
 * Each click opens SetupGameDialog (via the parent's
 * `onStartSetup`); the actual game-create RPC fires when the
 * user confirms inside the dialog. The button label says
 * "Start" because that's what users expect; the code-side
 * naming reflects the two-phase reality.
 */
export function StartGameButtons({
  games,
  memberCount,
  getLabel,
  onStartSetup,
}: Props) {
  return (
    <div className="actions">
      {games.map((g) => {
        const fits = playerCountFits(g.numberOfPlayers, memberCount)
        const title = fits ? g.blurb : playerCountLabel(g.numberOfPlayers)
        return (
          <button
            key={g.gametype}
            type="button"
            onClick={() => onStartSetup(g.gametype)}
            disabled={!fits}
            title={title}
          >
            {getLabel(g)}
          </button>
        )
      })}
    </div>
  )
}
