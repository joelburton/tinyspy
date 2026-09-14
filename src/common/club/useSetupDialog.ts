// cs-audited-club-page

import { useCallback, useState, type RefObject } from 'react'
import { navigate } from '../routing/router'
import { gametypes } from '@/gametypes'
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

  // A press wins; otherwise the `?new=` intent until it is consumed. DERIVED at
  // render rather than pushed into state by an effect (the repo bans
  // setState-in-effect); both setters run in the dialog's own handlers.
  //
  // An unknown gametype resolves to null and the dialog simply does not open —
  // the same forward-compat posture the start list takes, since `?new=` can
  // name a game this bundle does not have.
  const manifest =
    pressed ??
    (requestConsumed
      ? null
      : (gametypes.find((g) => g.gametype === requestedGametype) ?? null))

  // Open it on a gametype, from a start row's press. Unknown gametype: no-op.
  const open = useCallback((gametype: string) => {
    const game = gametypes.find((g) => g.gametype === gametype)
    if (!game) return
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
