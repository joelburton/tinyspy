# utils

Small helpers that belong to no feature: a class-name combiner, a friendly
relative date, clickable URLs in a run of text, the console timestamp, and a
seedable random-number generator. Each is a plain function with no hooks, no
React state and no Supabase, and each has its test beside it when it has a
contract worth pinning.

## Design

- **The test for belonging here is what a helper knows, not who calls it.** A
  util names no club, game, chat or player, and imports nothing from the rest
  of `src/`. `friendlyDate` has two callers and both are the club page, but it
  knows nothing about clubs; a helper that has to know its feature belongs in
  that feature's folder. This is the same principle as
  [where a new file goes](../../../docs/common-folders.md#where-does-a-new-file-go):
  count is not the test.
- **A util the edge functions import carries no imports at all.** Deno reaches
  into this folder by relative path with an explicit `.ts` (`mulberry32`), so
  such a file cannot use the `@/` alias, React or the DOM. `linkify` is `.tsx`
  and browser-only, which is fine; it is simply not one Deno can load.
- **Randomness is seeded where the sequence must repeat, and `Math.random()`
  everywhere else.** `mulberry32` exists for the repeat cases — a board rolled
  from a stored seed, a test that names its seed, server work that must be
  idempotent — and its docstring is the one place that rule is argued.
- **There is no `index.ts`.** Every import names the file it wants, so a
  helper's callers are one grep away and nothing here is re-exported under a
  second name.
