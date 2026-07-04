import { FloatingPanel } from '../panels/FloatingPanel'

type Props = {
  onClose: () => void
}

/**
 * The club page's help / rules modal — opened from the "Help" item in the club
 * logo menu (or the `?` shortcut, which opens that menu). It's the club-page
 * counterpart to each game's `Help` modal on GamePage, added so the club menu
 * has the same Help affordance games do (parity — see docs/common.md → ClubPage).
 *
 * **Placeholder content for now.** A club is just a named venue where friends
 * start games together; there isn't much to explain yet, so this is a couple of
 * orienting sentences. Flesh it out when clubs grow features (invites, roles).
 */
export function ClubHelp({ onClose }: Props) {
  return (
    <FloatingPanel
      title="About clubs"
      onClose={onClose}
      defaultSize={{ width: 420, height: 260 }}
      minWidth={280}
      minHeight={180}
    >
      <p>
        A <strong>club</strong> is a named group of friends who play games
        together — your shared space between games, where the chat thread lives
        and where you start a new game for everyone.
      </p>
      <p>
        Pick a game to start one, or open the chat with <kbd>/</kbd>. This help is
        available anywhere with <kbd>?</kbd>, and you can look up a word with{' '}
        <kbd>~</kbd>.
      </p>
    </FloatingPanel>
  )
}
