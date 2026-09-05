# web-storage — todo

## Bugs

## Soon

- **`useStickyChoice.test.ts` should adopt `storage.fake.ts` and drop its
  guard exemption.** jsdom here ships no `localStorage` at all, so a test
  touching storage installs a Storage-shaped fake first; this file hand-rolls
  one, and `storage.fake.ts` already provides `installFakeStorage()` and a
  `block()` that makes every method throw — which is exactly what the hook's
  own "storage failures degrade to in-memory state" decision wants exercised.
  The file is one of the entries in `src/guards/rawStorage.test.ts`'s `ALLOWED`
  list, which is built to shrink. The hook itself already calls `readStored` /
  `writeStored`; only the test reaches for raw storage.

## Someday

## Maybe
