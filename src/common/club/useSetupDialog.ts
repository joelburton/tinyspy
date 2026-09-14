// cs-blessed-club-page

import { useCallback, useState, type RefObject } from 'react'
import { navigate } from '../routing/router'
import { manifestFor } from '@/gametypes'
import { showFaultModal } from '../faults/faultStore'
import type { GameManifest } from '../manifest/gameManifest'

/**
 * Whether ClubPage's setup dialog is open, and on which gametype.
 *
 * Two ways in, one way out. Pressing a start row calls `open`; arriving at
 * `/c/<handle>?new=<gametype>` opens it on that gametype without a press. The
 * second exists for games whose board IS their identity — crosswords cannot
 * offer "same again", since replaying the setup re-serves the puzzle you just
 * solved — so their terminal row sends the player here to pick the NEXT one.
 *
 * `manifest` is the whole answer: non-null means the dialog is mounted, and
 * both openings collapse into it, so nothing downstream has to ask which way
 * it was opened.
 *
 * Takes the start list's ref, because closing hands focus back to it: the
 * dialog autofocuses a field inside itself, so on unmount that focus dies and
 * lands on `<body>`, which blanks the list's Up/Down cursor.
 */
export function useSetupDialog(startListRef: RefObject<HTMLDivElement | null>) {
  // The manifest a press chose, or null. Set by `open`, cleared by `close`.
  const [pressed, setPressed] = useState<GameManifest | null>(null)

  // Read ONCE at mount: the value is a navigation intent, not live state.
  const [requestedGametype] = useState(
    () => new URLSearchParams(window.location.search).get('new'),
  )
  // Set once the intent has been acted on, so the derived value below stops
  // re-opening the dialog.
  const [requestConsumed, setRequestConsumed] = useState(false)

  // What `?new=` asked for. `ClubPageLoader` has already ended the route in an
  // error page if the value named no game OR named one this club does not play,
  // so by the time this hook runs the intent is startable or absent.
  const requested = requestedGametype ? (manifestFor(requestedGametype) ?? null) : null

  // A press wins; otherwise the `?new=` intent until it is consumed. DERIVED at
  // render rather than pushed into state by an effect (the repo bans
  // setState-in-effect); both setters run in the dialog's own handlers.
  const manifest = pressed ?? (requestConsumed ? null : requested)

  // Open it on a gametype, from a start row's press.
  const open = useCallback((gametype: string) => {
    const game = manifestFor(gametype)
    if (!game) {
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
    setPressed(game)
  }, [])

  // Close it, whichever way it was opened, and drop `?new=` from the URL so a
  // refresh does not re-open it. Focus goes back to the start list, which keeps
  // its cursor index in state rather than deriving it from focus — so the
  // cursor comes back exactly where it was.
  const close = useCallback(() => {
    setPressed(null)
    setRequestConsumed(true)
    if (window.location.search) navigate(window.location.pathname, true)
    startListRef.current?.focus({ preventScroll: true })
  }, [startListRef])

  return { manifest, open, close }
}
