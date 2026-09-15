// cs-blessed-game-page

import { Component, type ReactNode } from 'react'
import { ErrorPage } from '../error-page/ErrorPage'
import { diagnosticsLine } from '../supabase/dbLog'
import { StandardButton } from '../buttons/StandardButton'

/**
 * Error boundary around the play surface.
 *
 * Without one, any error thrown during a PlayArea render unmounts React's
 * whole tree to a blank page with the explanation buried in the console. The
 * two known ways in:
 *
 *   - a lazy game chunk failing to load, which reaches here on BOTH of the
 *     stale-chunk path's branches (`boot/reloadOnStaleChunk`, installed by
 *     main.tsx). When
 *     that path declines to reload — its once-a-minute guard tripped, so the
 *     chunk is failing for a real reason — the import throws and the card is
 *     the answer. When it DOES reload, it calls `preventDefault()` on the
 *     preload error, and Vite's helper then returns instead of throwing: the
 *     import resolves to `undefined`, the manifest's
 *     `.then((m) => ({ default: m.PlayArea }))` reads a property off nothing,
 *     and this catches that too. The card paints for the frame before
 *     `location.reload()` replaces the page, which is why nobody reports it;
 *   - a plain render bug in a game.
 *
 * Either way the person gets a card saying what broke and a Reload button
 * instead of a blank page. A class component because error boundaries have no
 * hook equivalent (React 19 still requires `getDerivedStateFromError`).
 *
 * The shell mounts it around the play surface and nothing else, so the chrome
 * (header, chat, back-to-club) survives a broken game and there is still a way
 * out of the page. The shell is keyed by gameId, so navigating to another game
 * remounts the boundary and clears a caught error.
 */
export class PlayAreaErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error === null) return this.props.children
    // Reload is offered ALONGSIDE the shared "← Back home", not instead of it:
    // a crashed render is the one dead end where retrying the same URL is a
    // real fix, and the one where leaving might lose a game in progress.
    return (
      <ErrorPage
        message={this.state.error.message}
        diagnostics={diagnosticsLine('FAULT', {
          call: 'render play area',
          severity: 'fault',
          detail: `${this.state.error.name}: ${this.state.error.message}`,
        })}
        action={
          <StandardButton show="label" label="Reload" weight="primary" onClick={() => window.location.reload()} />
        }
      />
    )
  }
}
