// cs-blessed-club-page

import { useCallback, useEffect, useState, type RefObject } from 'react'
import { navigate } from '../routing/router'
import { manifestFor } from '@/gametypes'
import { showFaultModal } from '../faults/faultStore'
import { showToast } from '../toasts/toastStore'
import type { GameManifest } from '../manifest/gameManifest'

type SetupDialogOptions = {
  // The start list, which gets focus back when the dialog closes.
  startListRef: RefObject<HTMLDivElement | null>
  // The club's name and its gametypes, to check a `?new=` link against.
  clubName: string
  clubGametypes: Set<string>
}

/** What a `?new=` link asked for: the game to open the dialog on, or why it
 *  can't be. */
type NewGameLink = { manifest: GameManifest } | { problem: string }

/** Read `?new=<gametype>` and check it the way a start row is checked: the app
 *  has the game, and this club plays it. Null when the URL has no `?new=`. */
function readNewGameLink(
  clubName: string,
  clubGametypes: Set<string>,
): NewGameLink | null {
  const gametype = new URLSearchParams(window.location.search).get('new')
  if (!gametype) return null

  const manifest = manifestFor(gametype)
  if (!manifest) {
    return {
      problem: `There's no game type called "${gametype}". The link is wrong, ` +
        'or the game was removed from the app.',
    }
  }
  if (!clubGametypes.has(gametype)) {
    return {
      problem: `${clubName} doesn't play ${manifest.name}. A club's games are ` +
        'chosen in Edit club.',
    }
  }
  return { manifest }
}

/** Drop `?new=` from the URL, so a refresh doesn't act on it again. */
function dropNewGameLink() {
  if (window.location.search) navigate(window.location.pathname, true)
}

/**
 * Whether ClubPage's setup dialog is open, and on which gametype.
 *
 * Two ways in, one way out. Pressing a start row calls `open`; arriving at
 * `/c/<handle>?new=<gametype>` opens it on that gametype without a press. The
 * second exists for games whose board IS their identity — crosswords cannot
 * offer "same again", since replaying the setup re-serves the puzzle you just
 * solved — so their ending row sends the player here to pick the NEXT one.
 *
 * **A `?new=` link it can't honor opens nothing and says why**, in a toast that
 * stays until dismissed: the game doesn't exist, or this club doesn't play it.
 * The club page is still there, so the player can pick a game themselves. The
 * link is read once, at mount, and dropped from the URL once it has been acted
 * on — by closing the dialog, or by the toast.
 *
 * `manifest` is the whole answer: non-null means the dialog is mounted, and
 * both openings collapse into it, so nothing downstream has to ask which way
 * it was opened.
 *
 * Closing hands focus back to the start list: the dialog autofocuses a field
 * inside itself, so on unmount that focus dies and lands on `<body>`, which
 * blanks the list's Up/Down cursor.
 */
export function useSetupDialog({
  startListRef,
  clubName,
  clubGametypes,
}: SetupDialogOptions) {
  // The manifest a press chose, or null. Set by `open`, cleared by `close`.
  const [pressed, setPressed] = useState<GameManifest | null>(null)

  // Read ONCE at mount: the value is a navigation intent, not live state.
  const [link] = useState(() => readNewGameLink(clubName, clubGametypes))
  // Set by the first close. `link` outlives the URL it came from, so without
  // this the derived value below would re-open the dialog the moment it closed.
  const [hasBeenClosed, setHasBeenClosed] = useState(false)

  useEffect(function sayWhyTheLinkOpensNothing() {
    if (!link || !('problem' in link)) return
    // A stable id, so a second run of this effect replaces the toast rather
    // than stacking another.
    showToast({ id: 'new-game-link', message: link.problem, tone: 'error' })
    dropNewGameLink()
  }, [link])

  const linkManifest = link && 'manifest' in link ? link.manifest : null

  // A press wins; otherwise the link's manifest until the first close. DERIVED at
  // render rather than pushed into state by an effect (the repo bans
  // setState-in-effect); both setters run in the dialog's own handlers.
  const manifest = pressed ?? (hasBeenClosed ? null : linkManifest)

  // Open it on a gametype, from a start row's press.
  const open = useCallback((gametype: string) => {
    const manifest = manifestFor(gametype)
    if (!manifest) {
      // Unreachable: the start list calls this with the gametype off a manifest
      // it is already holding (`onActivate={(g) => …(g.gametype)}`). It screams
      // rather than returning quietly, because quiet here is a press that does
      // nothing and says nothing.
      showFaultModal({
        text: "Something went wrong opening that game's setup.",
        diagnostics: `BUG: no manifest for gametype ${gametype} at setup open`,
      })
      return
    }
    setPressed(manifest)
  }, [])

  // Close it, whichever way it was opened, and drop `?new=` from the URL so a
  // refresh does not re-open it. Focus goes back to the start list, which keeps
  // its cursor index in state rather than deriving it from focus — so the
  // cursor comes back exactly where it was.
  const close = useCallback(() => {
    setPressed(null)
    setHasBeenClosed(true)
    dropNewGameLink()
    startListRef.current?.focus({ preventScroll: true })
  }, [startListRef])

  return { manifest, open, close }
}
