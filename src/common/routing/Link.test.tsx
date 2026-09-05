// cs-audited-routing

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { Link } from './Link'

/**
 * `<Link>`'s one job beyond rendering an anchor: decide which clicks it keeps
 * and which it hands back to the browser. Everything it hands back is an "open
 * this somewhere else" gesture, and there is a test below per way of asking —
 * a modifier key, and the `target` attribute.
 *
 * Reading the assertions: a routed click changes `window.location.pathname`,
 * because `navigate()` ran. A handed-back one leaves it alone — jsdom does not
 * follow an href, so an unchanged path means nothing in our code handled the
 * click, which is exactly the browser's turn.
 *
 * The modifier cases use `fireEvent` rather than `userEvent`: they are
 * assertions about one field of the click event, and `fireEvent` sets that
 * field directly instead of routing it through pointer-state bookkeeping that
 * has to be held across two calls to be true.
 */
describe('Link', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  // Swallow the anchor's default action, which is the whole point of a
  // handed-back click: jsdom cannot follow an href and says so on the console
  // ("Not implemented: navigation to another Document") once per such test,
  // which buries a console message that would matter. This listener is on
  // `document` and therefore runs AFTER the component's handler — React
  // delegates to the root and the event bubbles — so a click the component
  // routed has already called `preventDefault` itself, and one it handed back
  // still reaches the assertion untouched.
  beforeEach(() => {
    const swallow = (e: Event) => e.preventDefault()
    document.addEventListener('click', swallow)
    return () => document.removeEventListener('click', swallow)
  })

  it('renders a real anchor with the href, so browser gestures work', () => {
    render(<Link to="/c/joel-leah">Club</Link>)
    expect(screen.getByRole('link', { name: 'Club' })).toHaveAttribute('href', '/c/joel-leah')
  })

  it('routes a plain left-click in-page', async () => {
    render(<Link to="/c/joel-leah">Club</Link>)
    await userEvent.click(screen.getByRole('link'))
    expect(window.location.pathname).toBe('/c/joel-leah')
  })

  it.each(['metaKey', 'ctrlKey', 'shiftKey', 'altKey'])(
    'hands a %s-click back to the browser',
    (modifier) => {
      render(<Link to="/c/joel-leah">Club</Link>)
      fireEvent.click(screen.getByRole('link'), { [modifier]: true })
      expect(window.location.pathname).toBe('/')
    },
  )

  it('hands a click on a targeted link back to the browser', async () => {
    // The failure this pins: `target` arrives through the props spread, so a
    // handler that only checked modifier keys would route it in-page — eating
    // the one "open elsewhere" gesture that is written declaratively rather
    // than held down.
    render(
      <Link to="/c/joel-leah" target="_blank">
        Club
      </Link>,
    )
    await userEvent.click(screen.getByRole('link'))
    expect(window.location.pathname).toBe('/')
  })

  it('routes target="_self", which names this frame', async () => {
    render(
      <Link to="/c/joel-leah" target="_self">
        Club
      </Link>,
    )
    await userEvent.click(screen.getByRole('link'))
    expect(window.location.pathname).toBe('/c/joel-leah')
  })
})
