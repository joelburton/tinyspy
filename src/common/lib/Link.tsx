import { type AnchorHTMLAttributes, type ReactNode } from 'react'
import { navigate } from './router'

type LinkProps = {
  /** Destination path, e.g. `/c/joel-leah` or `/g/tinyspy/<gameId>`. */
  to: string
  children: ReactNode
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>

/**
 * Path-based link. Renders a normal `<a href={to}>` so the browser's
 * "open in new tab" / "copy link" / hover-preview behaviors all work
 * exactly as they would for a vanilla anchor.
 *
 * The click handler intercepts plain left-clicks (button 0, no
 * modifier keys) and routes them through `navigate()`. cmd/ctrl/
 * shift/alt clicks and middle-clicks fall through to the browser,
 * opening a new tab/window — preserving the affordance users expect
 * from any link they see.
 *
 * Lives in its own file (split from `router.ts`) because Vite Fast
 * Refresh requires a file to export *only* components if it exports
 * any. Pure-function exports (`usePath`, `navigate`) stay in
 * `router.ts`; this is just the component.
 */
export function Link({ to, children, ...rest }: LinkProps) {
  return (
    <a
      href={to}
      onClick={(e) => {
        // Let the browser handle "open in new tab/window" gestures.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        if (e.button !== 0) return
        e.preventDefault()
        navigate(to)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
