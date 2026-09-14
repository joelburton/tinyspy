// cs-unmet

import { ErrorPage } from '../error-page/ErrorPage'

type Props = {
  // Which way there is no game, for the CONSOLE — the page never shows it.
  detail: string
}

/**
 * **The one "no such game" page**, for every way to have no game: an id that
 * cannot name one, an id that names one which is not there, and a game deleted
 * while somebody had it open. `GamePageGate` shows it for the first two and
 * `GamePageLoader` for the third.
 *
 * It IS `<ErrorPage>` — the same card, in its Not-Found shape: no `k=v` line,
 * because nothing broke and there is nothing to diagnose out loud (Joel,
 * 2026-08-31). `detail` still says which case it was, but to the console:
 * worth having when someone reports "it says there's no game", worth nothing
 * to the person reading the page.
 *
 * One component rather than three call sites picking the same props, so the
 * sentence a player reads has one home.
 */
export function NoSuchGamePage({ detail }: Props) {
  console.debug(`[ui] no-such-game | ${detail}`)
  return (
    <ErrorPage
      title="Not Found"
      message="There's no game here. It may have been deleted, or the link you followed might be wrong or out of date."
    />
  )
}
