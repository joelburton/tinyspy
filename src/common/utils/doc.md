# utils

Small helpers that belong to no feature: a class-name combiner, a friendly
relative date, clickable URLs in a run of text, the console timestamp, a
seedable random-number generator, and a shuffle. Plain functions — no React
state, no Supabase, and no knowledge of clubs, games or players.

## Design

Every codebase grows a folder like this one, and most of them turn into a junk
drawer, because "small helper that didn't fit anywhere" describes an unlimited
number of things. What keeps this one honest is a test about what a helper
**knows**, not about who calls it or how many callers it has: a util names no
club, game, chat or player, and imports nothing else from `src/`. A friendly
date and a clickable URL are general even when the only caller is the club page
or chat; a helper that has to know what a game is belongs in that game's folder,
however many places use it.

The second thing shaping the folder is that two different runtimes read it. Most
of the app is a browser bundle, but the Deno edge functions reach into this
folder directly, by relative path, and they have no React, no DOM and no path
aliases. So a helper that the server might one day want is written as if the
server already wanted it — which is a real constraint on what may be imported
here, and the reason two files that look similar can have different rules
applied to them.

Randomness comes in two kinds and the folder holds both, deliberately. Anything
whose sequence must be reproducible — a board rolled from a stored seed, a test
that names its seed, server work that has to land on the same answer twice —
takes the seeded generator; everything else takes `Math.random()`. The shuffle
is here for the same reason any shared helper is: nine hand-rolled copies of the
same loop had drifted apart before it existed.

Nothing here is re-exported through a barrel file. Every import names the file it
wants, so a helper's callers are one grep away and no function acquires a second
name on the way out of the folder.

## Details

- **The Deno-safe rule, concretely.** `mulberry32` is imported by edge
  functions today and `shuffle` is written to the same standard: no `@/` alias,
  no React, no DOM. `linkify` is a `.tsx` file and browser-only, which is
  allowed — it simply is not one Deno can load.
- **Where the seeded-versus-not argument lives**: `mulberry32`'s docstring. It
  is the one place that rule is made, so a caller deciding between the two reads
  it there rather than here.
- **The belonging test in practice.** `friendlyDate` has two callers and both
  are the club page; `linkify` has one, in chat. Neither is a candidate for
  moving, because neither knows anything about clubs or chat. Count is not the
  test — see
  [where a new file goes](../../../docs/common-folders.md#where-does-a-new-file-go).
- **Tests sit beside the file** when it has a contract worth pinning, which is
  most of them.
