// cs-audited-actions

import { vi } from 'vitest'
import { ACTIONS, type ActionId } from './registry'
import type { BoundAction, Described } from './useBoundAction'

/**
 * A bound action for a TEST — the registry's real fixed half, a stub's live
 * half.
 *
 * For the tests that render a surface which takes an action but isn't the thing
 * binding it: a game's `ctx.menu.actBackToClub`, a `<MoveRow>`'s two keys, a
 * menu built from rows. Binding for real would drag a React tree and the key
 * dispatcher in with it, and neither is what those tests are about.
 *
 *     actBackToClub: boundActionFixture('act-back-to-club')
 *     expect(ctx.menu.actBackToClub.run).toHaveBeenCalled()
 *
 * `run` is a `vi.fn()`, so a test can assert the surface fired the right one.
 * Override `describe` to place an action that is disabled or hidden.
 */
export function boundActionFixture(
  id: ActionId,
  describe: () => Described = () => ({ state: 'active' }),
): BoundAction {
  return {
    id,
    spec: ACTIONS[id],
    run: vi.fn(),
    describe,
    pending: false,
  }
}
