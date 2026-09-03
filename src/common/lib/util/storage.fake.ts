// cs-unmet

/**
 * A Storage-shaped stand-in for tests, plus a switch that makes it throw.
 *
 * **jsdom in this project ships no real `localStorage`** — `window.localStorage`
 * is `undefined` under our config, so a test that merely calls it fails with
 * "cannot read properties of undefined" rather than testing anything. Every
 * test touching storage therefore installs a fake, and two did it by hand
 * before this existed (`useStickyChoice.test.ts`, `chatOpenStore.test.ts`, which
 * cross-reference each other's copy).
 *
 * The reason it is worth sharing rather than copying a third time is
 * {@link installedStorage.block}: making storage FAIL is the interesting case —
 * it is the entire reason `common/lib/util/storage.ts` exists — and it is the
 * fiddly part, because the methods have to live on a prototype for `vi.spyOn`
 * to replace them.
 *
 * Not a `.test.ts` file, so it ships no cases of its own; it is imported by the
 * tests that need it, the way boggle's `solver.fixture.ts` is.
 */

import { vi } from 'vitest'

/** Methods on the prototype, deliberately — `vi.spyOn` cannot replace an
 *  instance field defined as an arrow property. */
class FakeStorage {
  private store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

export type InstalledStorage = {
  /** What `readStored('local', …)` and friends will see. Assert against this
   *  rather than `window.localStorage`, so a test needs no exemption from
   *  `src/guards/rawStorage.test.ts`. */
  local: FakeStorage
  session: FakeStorage
  /** Empty both, e.g. between cases. */
  clear: () => void
  /**
   * Make every method throw the way a browser blocking site data does.
   *
   * Undone by `vi.restoreAllMocks()`, so a test that calls this should restore
   * in `afterEach` — otherwise the next case inherits broken storage.
   */
  block: () => void
}

/**
 * Put a fake `localStorage` and `sessionStorage` on `window` and hand back the
 * handles. Call it once in `beforeAll`.
 */
export function installFakeStorage(): InstalledStorage {
  const local = new FakeStorage()
  const session = new FakeStorage()
  for (const [name, value] of [
    ['localStorage', local],
    ['sessionStorage', session],
  ] as const) {
    Object.defineProperty(window, name, { value, configurable: true })
  }
  return {
    local,
    session,
    clear: () => {
      local.clear()
      session.clear()
    },
    block: () => {
      const boom = () => {
        throw new DOMException('access denied', 'SecurityError')
      }
      vi.spyOn(FakeStorage.prototype, 'getItem').mockImplementation(boom)
      vi.spyOn(FakeStorage.prototype, 'setItem').mockImplementation(boom)
      vi.spyOn(FakeStorage.prototype, 'removeItem').mockImplementation(boom)
    },
  }
}
