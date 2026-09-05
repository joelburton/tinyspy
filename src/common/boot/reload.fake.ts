// cs-unmet

import { vi, type Mock } from 'vitest'

/**
 * A pressable `location.reload()` for tests, and the way back afterwards.
 *
 * Reach for this in any test where the code under test reloads the page —
 * `panic.ts`'s Reload button and `reloadOnStaleChunk`'s recovery are both boot's
 * own, which is why the fake lives here.
 *
 * **Why a whole `location` object.** `location.reload` is non-configurable in
 * jsdom, so `vi.spyOn(location, 'reload')` cannot replace it; what CAN be
 * replaced is the `location` property on `window`. The stub spreads the real
 * location so `href`, `search` and the rest still read correctly, and puts a
 * mock in `reload`'s place.
 *
 * **`restore()` is not optional, and `vi.restoreAllMocks()` will not do it** —
 * that undoes spies, and this is a defined property. A test that skips it
 * leaves the next file in the worker with a `location` whose `reload` does
 * nothing.
 *
 * Not a `.test.ts` file, so it ships no cases of its own, the way
 * `common/web-storage/storage.fake.ts` does not.
 */
export type FakeReload = {
  /** Stands in for `location.reload` — assert calls on this. */
  reload: Mock
  /** Put the real `location` back; call it in `afterEach`. */
  restore: () => void
}

/** Swap `window.location` for a stub whose `reload` is a mock. */
export function installFakeReload(): FakeReload {
  const real = window.location
  const reload = vi.fn()
  const define = (value: unknown) =>
    Object.defineProperty(window, 'location', { value, writable: true, configurable: true })

  define({ ...real, reload })
  return { reload, restore: () => define(real) }
}
