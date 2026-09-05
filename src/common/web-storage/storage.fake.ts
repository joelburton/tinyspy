// cs-blessed-utils

/**
 * A Storage-shaped stand-in for tests, plus a switch that makes it throw.
 *
 * **`window.localStorage` is `undefined` under vitest here, and that is Node's
 * doing, not jsdom's.** jsdom provides both storages — `sessionStorage` is the
 * real one, and `reloadOnStaleChunk.test.ts` clears it raw — but recent Node
 * also defines its own experimental `localStorage` global, which reads as
 * `undefined` until Node is started with `--localstorage-file`, and vitest
 * leaves that one in place over jsdom's. (Node prints exactly that warning at
 * the top of a run.) So a test that merely calls `localStorage.getItem` fails
 * with "cannot read properties of undefined" rather than testing anything, and
 * every test touching local storage installs a fake. Two did it by hand before
 * this existed — `useStickyChoice.test.ts`, whose note points at
 * `chatOpenStore.test.ts`'s copy.
 *
 * The reason it is worth sharing rather than copying a third time is the two
 * switches, {@link InstalledStorage.blockAccess} and
 * {@link InstalledStorage.failCalls}: making storage FAIL is the interesting
 * case — it is the entire reason `common/web-storage/storage.ts` exists — and it
 * is the fiddly part. A browser blocking site data throws on the property
 * ACCESS (`window.localStorage` itself), which a fake can only model if it is
 * installed as an accessor; a full quota throws on the CALL, which needs the
 * methods on a prototype. Either way `vi.spyOn` has to have something to
 * replace, and a plain object with arrow-function fields gives it nothing.
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
   * Make `window.localStorage` / `window.sessionStorage` THEMSELVES throw, the
   * way a browser blocking site data does — before any method is reached. This
   * is the case `storage.ts` names its storages for rather than taking them as
   * arguments, so it is the one to assert against.
   *
   * Undone by `vi.restoreAllMocks()`, so a test that calls this should restore
   * in `afterEach` — otherwise the next case inherits broken storage.
   */
  blockAccess: () => void
  /**
   * Leave the storages reachable but make every method throw, the way a full
   * quota does on a write (and a storage that died mid-session does on any
   * call). Same restore rule as {@link InstalledStorage.blockAccess}.
   */
  failCalls: () => void
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
    // An accessor, not a data property, so `blockAccess` has a getter to spy.
    Object.defineProperty(window, name, { get: () => value, configurable: true })
  }
  const boom = () => {
    throw new DOMException('access denied', 'SecurityError')
  }
  return {
    local,
    session,
    clear: () => {
      local.clear()
      session.clear()
    },
    blockAccess: () => {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(boom)
      vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(boom)
    },
    failCalls: () => {
      vi.spyOn(FakeStorage.prototype, 'getItem').mockImplementation(boom)
      vi.spyOn(FakeStorage.prototype, 'setItem').mockImplementation(boom)
      vi.spyOn(FakeStorage.prototype, 'removeItem').mockImplementation(boom)
    },
  }
}
