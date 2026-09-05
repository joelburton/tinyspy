// cs-audited-routing

import { type AnchorHTMLAttributes, type ReactNode } from 'react'
import { navigate } from './router'

/**
 * `<Link>` — the router's JSX half, an anchor that moves the page in place.
 *
 * Its own file because Vite Fast Refresh requires a module that exports a
 * component to export *only* components; `usePath` and `navigate` are plain
 * functions and stay in `router.ts`. The split also keeps React JSX out of the
 * import graph of a caller that only wants `navigate()`.
 */

type LinkProps = {
  /** Destination path, e.g. `/c/joel-leah` or `/g/codenamesduet/<gameId>`. */
  to: string
  children: ReactNode
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>

/**
 * Path-based link. Renders a normal `<a href={to}>` so the browser's
 * "open in new tab" / "copy link" / hover-preview behaviors all work
 * exactly as they would for a vanilla anchor.
 *
 * The handler keeps the plain left-click and routes it through `navigate()`.
 * Every way of asking to open the link ELSEWHERE is handed back to the
 * browser: a cmd/ctrl/shift/alt click, and a `target` other than `_self`,
 * which is that same request in attribute form.
 *
 * A middle-click needs nothing here. A non-primary button fires `auxclick`,
 * not `click`, so it never reaches this handler — the browser opens the href
 * in a new tab on its own, which is the affordance users expect.
 */
export function Link({ to, children, ...rest }: LinkProps) {
  return (
    <a
      href={to}
      onClick={(e) => {
        // Let the browser handle "open in new tab/window" gestures.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        // `target` asks for the same thing declaratively, so it gets the same
        // answer. `_self` is the default and means this frame, so it routes.
        if (rest.target && rest.target !== '_self') return
        e.preventDefault()
        navigate(to)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
