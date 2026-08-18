import { Component, type ReactNode } from 'react'

/**
 * Error boundary around the play surface — the only boundary in the app.
 *
 * Without one, any error thrown during a PlayArea render unmounts React's
 * whole tree to a blank page with the explanation buried in the console. The
 * two known ways in:
 *
 *   - a lazy game chunk failing to load. The common cause (a deploy replaced
 *     the hashed assets an old tab references) is auto-recovered by a reload
 *     before it ever throws — see `reloadOnStaleChunk` in main.tsx — so this
 *     boundary only sees a chunk failure when that path declined to reload
 *     (its loop guard tripped: the chunk is failing for a real reason);
 *   - a plain render bug in a game.
 *
 * Either way the person gets a card saying what broke and a Reload button
 * instead of a blank page. A class component because error boundaries have no
 * hook equivalent (React 19 still requires `getDerivedStateFromError`).
 *
 * Mounted in App.tsx around the PlayArea Suspense, INSIDE the GamePage
 * render-prop — so the GamePage chrome (header, chat, back-to-club) survives
 * a broken play surface, and the gameId key remounts the boundary (clearing a
 * caught error) on navigation to another game.
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
    return (
      <div className="card">
        <h1>Something went wrong</h1>
        <p className="error">{this.state.error.message}</p>
        <p>
          <button type="button" className="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </p>
      </div>
    )
  }
}
