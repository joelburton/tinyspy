// cs-blessed-actions

import { vi } from 'vitest'
import { ACTIONS, type ActionId } from './registry'
import type { Action, Described } from './useBindAction'

/**
 * An action for a TEST — the registry's real definition, a stub's
 * options.
 *
 * For the tests that render a surface which takes an action but isn't the thing
 * binding it: a game's `ctx.menu.actBackToClub`, a `<WordEntryRow>`'s two keys, a
 * menu built from rows. Binding for real would drag a React tree and the key
 * dispatcher in with it, and neither is what those tests are about.
 *
 *     actBackToClub: ZTest_actionFixture('act-back-to-club')
 *     expect(ctx.menu.actBackToClub.run).toHaveBeenCalled()
 *
 * `run` is a `vi.fn()`, so a test can assert the surface fired the right one.
 * Override `describe` to place an action that is disabled or hidden.
 */
export function ZTest_actionFixture(
  id: ActionId,
  describe: () => Described = () => ({ state: 'active' }),
): Action {
  return {
    id,
    defn: ACTIONS[id],
    run: vi.fn(),
    describe,
    pending: false,
  }
}
