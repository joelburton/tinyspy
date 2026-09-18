# The stale-build check — the plan

**A PLAN, not a description.** It is here to be built and then deleted. The
durable parts fold into `src/common/boot/doc.md` (or the new area's own
`doc.md`) and [docs/common.md](../docs/common.md) where code-splitting and the
deploy are described; this file goes away when they land.

The feature: **a tab notices that the build it is running has been replaced,
and tells the person to refresh.**

## The failure this is for

On **2026-09-18** a `gmake deploy ENV=prod` from `app-audit` shipped the
envelope conversion — SQL applied 08:02 UTC, edge functions 08:03 UTC, FE in
the same run. Thirteen hours later a browser tab that had been open since
before that deploy tried to start an NYT crossword.

The edge-function logs for 21:10:26 UTC:

```
21:10:25.651  [rpc] next_nyt_date_for_club ok 65ms
21:10:26.760  [rpc] create_game ok 86ms
21:10:26.762  POST | 200 | .../functions/v1/crosswords-import-nyt
```

Everything succeeded. The person was shown `Error · new game · failed to start
CrossPlay (coop) game · no-code`, pressed Start again, and **two real games
were created in `mothlandia`** — both `playing`, both `is_current_view: false`,
because the frontend never navigated to a game it believed had failed.

Two symptoms, one cause. The setup dialog read `Next Wednesday: [object
Object]` because the old frontend did `${data}` on what had become an envelope;
the start "failed" because the old `invokeStartGameEdgeFn` looked for a
top-level `{ id }` in a body that now carries `{ type: 'ok', data: { id } }`.
Neither line exists in the tree any more — `b935a23a` replaced the first,
the error sprint replaced the second. The tab was simply running code from
before both.

**The generalization, which is the reason to build this:** any deploy that
changes a wire shape makes every tab open across it *silently wrong* rather
than loudly broken. The app-audit sprint changes wire shapes constantly, so
the exposure is unusually high right now and drops when it ends.

## What we already have, and the half it misses

`src/common/boot/reloadOnStaleChunk.ts` (installed by `main.tsx`) listens for
`vite:preloadError` and reloads once, capped at one reload per minute per tab.
It exists for a real case and handles it well: a deploy deletes the previous
build's hashed assets, so a tab that opens its first game after a deploy asks
for a chunk that is gone.

**A stale tab fails in two ways, and that covers one of them.**

| how the tab is stale | what happens | caught today? |
|---|---|---|
| it still needs a chunk, and that chunk is gone | dynamic import 404s → `vite:preloadError` | **yes** — reload |
| the chunk is already in memory | nothing fetches, nothing throws, old code just runs | **no** |

The second is the larger half and it is permanent: no loader-error hook can
ever see a module that is already loaded. On 2026-09-18 the crosswords
SetupForm chunk had been fetched before the deploy, so nothing 404'd.

## The stamp

**Decided (Joel, 2026-09-18): a build stamp, not sniffing `index.html`.**

The alternative considered was deriving the build's identity from the
`assets/index-<hash>.js` reference inside a re-fetched `index.html` — no new
files, nothing to keep in sync. It was rejected on deploy risk: `gmake deploy`
is a chain of targets (`project-link db-schema-sql deploy-funcs deploy-fe`) and
partial deploys are a thing that happens. A scheme whose correctness depends on
remembering a step is the wrong scheme for this Makefile.

**So the stamp must be a product of the build, not a step beside it.**
`deploy-fe` → `supabase/deploy/fe.sh` → `npm run build` → `npx netlify deploy -p
-d dist`. If the same vite run that writes `dist/assets/*` also writes
`dist/version.json`, there is no step to skip: you cannot ship a bundle without
its matching stamp because one command emits both.

Two outputs, one source value (git SHA, or a build timestamp — either works;
the SHA is more useful in a report):

- a `define`d constant baked into the JS, which **is** this tab's identity,
  frozen at build time;
- `dist/version.json`, fetched at runtime and compared against it.

The comparison is against the compile-time constant, never against storage. If
the tab's own identity came from `localStorage`, two tabs of different ages
would overwrite each other's notion of "current" and both would be wrong.

`public/_headers` needs **no change**: `version.json` is not under `/assets/`,
so it falls to the `/*` rule (`max-age=0, must-revalidate`) — a cheap
conditional request that mostly answers 304. That is exactly the policy it
wants.

## When the check runs

The events are the ones the app already treats as *the person is back after
being away* — `src/common/realtime/useRealtimeReconnect.ts` registers this
exact set for the same underlying reason (a tab that was asleep):

```
document.addEventListener('visibilitychange', onVisible)
window.addEventListener('focus', onVisible)
window.addEventListener('online', reconnectIfDown)
```

| trigger | why it earns a request |
|---|---|
| `visibilitychange` → visible, `focus`, `online` | the workhorse. People leave this app open and come back to it; this fires when a human is about to interact. Needs a floor (a few minutes) or alt-tabbing hammers it |
| entering a game page | a lazy chunk is being fetched at that boundary anyway, so the check rides along free. It also pairs with `reloadOnStaleChunk`, which guards the same boundary from the other side |
| **`reportUnhandled`** | the trigger that would have caught 2026-09-18. No floor, no network guess: the frontend has just met an envelope shape no branch can read, which is the server saying something this build has never heard of |
| a slow heartbeat while visible (~30 min) | fallback only, for the tab that is visible and in one game for hours and so fires none of the above. Build it if it earns it, not before |

**Boot is not a trigger.** A tab that just loaded `index.html` is current by
definition; boot is where the constant is captured, not where it is checked.

**Do not pre-flight the check before Start.** That puts a round-trip in front of
the most latency-sensitive action in the app to catch a rare condition. Let the
action fail and let the *failure* ask the question — which is what the
`reportUnhandled` trigger is. That turns the 2026-09-18 experience from
`no-code`, no information, into a true and actionable sentence.

## The modal

**Decided (Joel, 2026-09-18): a modal telling people to refresh**, not a silent
auto-reload.

A Netlify deploy propagates, so there is a window where a tab can fetch a new
`version.json` while still holding old assets, or the reverse. With a modal the
worst case of that race is one spurious "please refresh" — harmless, and
refreshing is the right answer anyway. With an auto-reload the worst case is a
loop. `reloadOnStaleChunk` already learned this lesson and caps itself; the
modal makes the cap unnecessary.

**Tier: `modal-blocking` (5000).** This is derived, not chosen by feel —
`--z-pause-gate: 3000` in `base.css` is a render gate, and everything below it
is *gone* while the game is paused. A stale-build message has to be readable in
a paused game (pause is exactly when people wander off and come back), so it
must sit above 3000. That rules out `modal-normal` (2200) and leaves
`modal-blocking`, whose own description fits: *"the world stops. Answer it now;
nothing underneath is live."* The app underneath genuinely is untrustworthy.

Not `modal-fault` (5100) — this is not an error, nothing has gone wrong, and a
fault must stay readable above it.

## Why the modal needn't protect anything — the evidence

The question was whether a forced refresh can destroy work. **It cannot.**

React effect cleanups do not run when the browser tears a page down, so
save-on-unmount protects pause and navigate-away but **not** a reload. Nothing
in the app listens for `beforeunload` or `pagehide` — the only lifecycle
listener anywhere is the `visibilitychange` in `useRealtimeReconnect`. So for a
refresh, the only protection is whatever a debounce has already flushed:

| state | write path | lost on refresh |
|---|---|---|
| crosswords cells | `set_cell` per keystroke, no debounce (`useCells.ts`) | at most one in-flight letter |
| bananagrams board | 800 ms debounce (`AUTOSAVE_MS`) + unmount save that a reload skips | ≤ 800 ms of placements |
| scrabble staged move | never stored — Broadcast-only, ephemeral by design (`useSharedMove.ts`) | the staged word; the tiles return to the server-owned rack |
| scratchpad | 300 ms debounced full-text flush (`FLUSH_MS`) | ≤ 300 ms of typing |
| chat draft | `useState('')` in `ChatBody.tsx` | the unsent message |
| selections, typed word, drag path, wordle guess | component state | all of it |

**Joel's ruling, 2026-09-18:** losing a staged scrabble word and losing an
unsent chat message are both fine — nobody refreshes a tab expecting either to
survive.

And the app already does all of this to people routinely.
[docs/states.md](../docs/states.md) §pause: `PauseBoundary` *unmounts the
PlayArea entirely*, so "PlayArea-local state (form input, transient tile
selections) clears on pause and rebuilds clean on resume". Presence-pause fires
whenever anyone's connection blips. Every row above except the chat draft is
already discarded several times a session by design. **A refresh is not a new
category of loss**, which is what licenses a blocking modal.

## The hole to know about

The stamp describes the **frontend**. A backend-only deploy — `gmake
deploy-funcs`, or a `supabase/sql/` re-apply — changes wire shapes without
changing the bundle, so `version.json` does not move and the check does not
fire, while every open tab is stale relative to the server.

This is tolerable because `gmake deploy` is the routine path and ships all
three together, making the FE stamp a good proxy for "the backend moved". It is
worth writing down rather than discovering later. The `reportUnhandled` trigger
is the partial backstop: it fires on shape surprise regardless of which half
moved, so the modal can still appear — it just cannot *prove* staleness from
the stamp alone in that case.

## Where it lands

A new area, `src/common/stale-build/`, holding both halves: the detector and
the modal.

Not `boot/`. That folder's `doc.md` is explicit that it "deliberately borrows
nothing from the rest of the app" — `panic.ts` paints with plain DOM precisely
because the stylesheet chain may be what failed. A React modal contradicts
that remit.

The new area joins the app-audit roster when it is created, per §4 of
[app-audit.md](app-audit.md).

**Dev and test.** There is no `version.json` under `vite dev`, so the check
no-ops there — which also means the modal cannot be seen by running the app.
Cover it with a unit test the way `reloadOnStaleChunk.test.ts` covers its
sibling. The e2e suite runs against a build; confirm the check stays quiet
there rather than firing mid-spec.

## What's decided

| | |
|---|---|
| detection | a build stamp emitted by the vite build — not `index.html` sniffing |
| stamp shape | a `define`d constant in the bundle + `dist/version.json`, one source value |
| comparison | fetched file vs. the compile-time constant; never storage |
| headers | no change — `version.json` inherits `/*`'s `must-revalidate` |
| response | a modal asking the person to refresh; no auto-reload |
| tier | `modal-blocking` (5000), because it must clear the pause gate at 3000 |
| state safety | nothing needs protecting; a refresh loses no more than a pause already does |

## What's open

1. **Is the modal dismissible?** Nothing is at risk, so data safety does not
   argue for it. The one real argument is social: refreshing drops your
   presence, which pauses the table for everyone else
   ([docs/states.md](../docs/states.md) §multi-player) — so one person obeying
   the modal mid-word gives their friends a "Waiting for…" overlay out of
   nowhere. A possible answer is to keep it blocking but word it for the table
   ("everyone should refresh") so the group does it together. **Joel's call.**
2. **Does `reloadOnStaleChunk` move into the new area?** Both halves are the
   same fact — this tab is stale — and keeping them apart means two places to
   look. Against: it is `cs-blessed-boot`, and boot's `doc.md` describes it as
   one of that folder's two reasons to exist. Moving it rewrites a blessed
   area's narrative.
3. **SHA or timestamp for the stamp?** A SHA is more useful when someone
   reports a problem; a timestamp is readable without a checkout.
4. **When is this scheduled?** It is not, yet. The argument for doing it during
   app-audit rather than after is in "The failure this is for": the sprint is
   what makes stale tabs dangerous, so the value is highest now.
