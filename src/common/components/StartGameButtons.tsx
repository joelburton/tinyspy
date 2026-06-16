import type { GameManifest } from '../lib/games'
import { playerCountFits, playerCountLabel } from '../lib/games'

type Props = {
  /** The gametypes to render buttons for. The caller pre-filters
   *  (e.g. ClubPage by the club's allowed-gametype m2m, HomePage by
   *  the user's solo-club allowed set). This component doesn't
   *  apply its own filtering on top. */
  games: GameManifest[]
  /** Member count used to derive each button's disabled state via
   *  the manifest's numberOfPlayers range. ClubPage passes the
   *  current club's `members.length`; HomePage passes 1 (solo). */
  memberCount: number
  /** Build the button label per game. ClubPage uses
   *  `(g) => \`Start ${g.name}\``; HomePage uses
   *  `(g) => \`Play ${g.name} solo\``. */
  getLabel: (game: GameManifest) => string
  /** The gametype currently being started (RPC in flight), or null.
   *  All buttons disable while one is in flight; the in-flight one
   *  shows "Starting…". */
  starting: string | null
  /** Click handler. Receives the gametype string. */
  onStart: (gametype: string) => void
}

/**
 * The "Start a new game" button row — one button per gametype in
 * `games`. Shared between ClubPage ("Start Wordknit", "Start Tinyspy")
 * and HomePage ("Play Wordknit solo").
 *
 * What's shared and what isn't:
 *
 *   - **Shared**: iterating the games list, per-button disabled
 *     state, per-button tooltip ("Tinyspy needs exactly 2 members"
 *     vs blurb), in-flight ("Starting…") label override, layout
 *     using the existing `.actions` flex stack.
 *
 *   - **Caller-supplied**: the games list (pre-filtered by the
 *     caller's allowed-gametype set), the label callback (so a
 *     button reads "Start X" or "Play X solo"), the member count
 *     (drives disabled-because-doesn't-fit state).
 *
 * Today's buttons are intentionally simple. The component exists so
 * the call sites stay short and so the visual treatment can mature
 * here (thumbnails, blurbs, hover affordances) without touching
 * three callers.
 */
export function StartGameButtons({
  games,
  memberCount,
  getLabel,
  starting,
  onStart,
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
            onClick={() => onStart(g.gametype)}
            disabled={starting !== null || !fits}
            title={title}
          >
            {starting === g.gametype ? 'Starting…' : getLabel(g)}
          </button>
        )
      })}
    </div>
  )
}
