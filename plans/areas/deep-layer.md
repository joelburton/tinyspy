# Area: deep-layer

The first area of app-audit's step 7, and the first one to run under the
2026-09-02 restart. The process is [app-audit.md](../app-audit.md) §21; the plan
holds the order, this file holds everything else.

**Opened 2026-09-02.** It was added to the top of §7's order the same day, ahead
of `homepage`. Scope, set by Joel when he asked for it:

> "there's a new area to add at the very top of the list: the deep stuff that is
> used in most places (the router, App.tsx, the rpc/edge-fn/query wrappers). I
> want to go through those files first to tidy and understand them before we hit
> even the homepage (otherwise the homepage, which is theoretically simple, will
> have dozens of dependencies)."

**The membership rule is "it names no game and no page."** "Deep" on its own
describes all 83 files of `src/common/lib/`, `trie.ts` and `rankLadder.ts`
included; the rule is what keeps game logic that merely lives in `lib/` out.

**Why it runs first, and it is not the dependency count.** Of the homepage's 33
listed dependencies this area absorbs six, and that page will still list around
twenty-two afterwards — the bulk being shared components and stylesheets owned by
`simple-page` and `shared-game-chrome`. The reason is that those twenty-two are
components: you can look at one and see what it does. **The deep layer is the
part you cannot understand by looking**, so "listed and left" costs the most
here, and reading it once pays into every area after.

**Its exit criterion is different, and that is deliberate.** This area renders
nothing, so it does not close on Joel looking at a surface. It closes on *read,
understood, tidied* — `cs-blessed` here means he has read the file, not seen it.

**Every heading will say its status**; a heading with **no status prefix means
OPEN**. No findings yet — the area is open at its roster.

## The roster — 31 files, 4,797 lines

Agreed with Joel 2026-09-02 before anything was read, and stamped **`cs-met`** —
the eighth stamp, added the same day for exactly this state: on an open area's
roster, agreed, and not yet read (app-audit.md §21 → The stamp). About half the line count is tests.

**The boot path — 7 files, 596 lines**

| file | lines | |
|---|---|---|
| `src/main.tsx` | 59 | |
| `src/App.tsx` | 231 | **the boot half only** — its per-page and per-game routing rows belong to the areas that own those pages and games |
| `src/common/lib/routing/router.ts` | 97 | |
| `src/common/lib/routing/router.test.ts` | 93 | |
| `src/common/lib/routing/Link.tsx` | 44 | the homepage writes no link at all now (its F36 took the last one); the file is still the router's |
| `src/common/lib/util/reloadOnStaleChunk.ts` | 36 | filed under `util/`, but it is boot machinery |
| `src/common/lib/util/reloadOnStaleChunk.test.ts` | 36 | |

**The data path — 11 files, 2,867 lines**

| file | lines |
|---|---|
| `src/common/lib/supabase/supabase.ts` | 128 |
| `src/common/db.ts` | 26 |
| `src/common/lib/supabase/envelope.ts` | 156 |
| `src/common/lib/supabase/dbEnvelope.ts` | 321 |
| `src/common/lib/supabase/dbResult.ts` | 530 |
| `src/common/lib/supabase/dbResult.test.ts` | 759 |
| `src/common/lib/supabase/dbFetch.ts` | 282 |
| `src/common/lib/supabase/dbFetch.test.ts` | 289 |
| `src/common/lib/supabase/callEdgeFn.ts` | 99 |
| `src/common/lib/supabase/callEdgeFn.test.ts` | 95 |
| `src/common/lib/supabase/dbLog.ts` | 175 |

**The realtime plumbing — 7 files, 651 lines**

| file | lines |
|---|---|
| `src/common/lib/supabase/channelDedup.ts` + `.test.ts` | 56 + 110 |
| `src/common/lib/supabase/channelTeardown.ts` + `.test.ts` | 108 + 86 |
| `src/common/lib/supabase/postgresAttached.ts` + `.test.ts` | 42 + 54 |
| `src/common/lib/supabase/realtimeDiag.ts` | 195 |

**The fault sink — 2 files, 152 lines**

`src/common/lib/fault/faultStore.ts` (84) + `faultStore.test.ts` (68). Its modal
is a floating-panel instance, not this area's.

**One util — 1 file, 22 lines**

`src/common/lib/util/cls.ts`. It is in almost every component, and the homepage
already filed F47 (`cls-thirty-lines`) against it.

**The server side of the envelope — 3 files, 321 lines**

| file | lines |
|---|---|
| `supabase/functions/_shared/envelope.ts` | 168 |
| `supabase/functions/_shared/dbResult.ts` | 120 |
| `supabase/functions/_shared/http.ts` | 33 |

In because the envelope has two halves that have to agree, and reading one
without the other is how they drift. `supabase/functions/_shared/startGame.ts`
(151) is **out** — it names games, so the rule excludes it.

## Listed and left OUT, each with the rule that excludes it

| | why |
|---|---|
| `src/games.ts`, `src/common/lib/games.ts` + test | name every game |
| all 32 files of `src/common/lib/game/` | same |
| `supabase/functions/_shared/startGame.ts` | same |
| `src/types/db.ts` (4,422 lines) | generated, and it names every game's schema. **Set `cs-na` 2026-09-02** (Joel): it carries a stamp it could never earn its way off, because nobody will ever hand-read it |
| `lib/util/`: `mulberry32`, `friendlyDate`, `linkify`, `layoutWidth`, `keyboardHandoff` | picked up by whichever area uses them — a util has no shared design language to settle |
| the common non-game **hooks** — `useProfile`, `useTabRing`, `useAppShortcuts`, `useRealtimeRefetch` and the rest | Joel, 2026-09-02: *"we should do the common non-game ones, but not here."* They are the same kind of thing, but taking ~60 files under `hooks/` would double the area and mix two vocabularies. **A candidate area of its own** |
| `base.css`, `utilities.css`, `fixed.css`, `breakpoints.css` | the vocabularies; owned by the page areas |

## Findings

*(none yet — the area is open at its roster)*
