# Area: realtime

The folders it reads: `realtime`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-05 (Joel: "mark files as blessed, then close area").**
Read, eighteen findings recorded and all eighteen worked, re-read in one
sitting, `doc.md` Design written, every roster file `cs-blessed-realtime`.

## The roster

Agreed 2026-09-05 (Joel: "i agree. read and audit.") — every file of
`src/common/realtime/`:

| file | what it is | stamp |
|---|---|---|
| `src/common/realtime/useRealtimeRefetch.ts` | the subscribe-and-refetch factory every Pattern A hook calls — every hook that reloads its rows on any event rather than applying the event | `cs-blessed-realtime` |
| `src/common/realtime/useRealtimeRefetch.test.ts` | its contract — mount load, SUBSCRIBED refetch, attach refetch and its filter, event refetch, multi-table fan-in, `id` rebuild, mounted-guard, the ref trick | `cs-blessed-realtime` |
| `src/common/realtime/postgresAttached.ts` | `onPostgresAttached` — the deaf-window closer's filter on the `system` message | `cs-blessed-realtime` |
| `src/common/realtime/postgresAttached.test.ts` | its contract — fires on attach ok, on every re-attach, on nothing else | `cs-blessed-realtime` |
| `src/common/realtime/channelDedup.ts` | `channelDedupSuffix` — a private channel name that can never be reused | `cs-blessed-realtime` |
| `src/common/realtime/channelDedup.test.ts` | its contract — platform UUID when present, the fallback's shape and monotonic counter | `cs-blessed-realtime` |
| `src/common/realtime/channelTeardown.ts` | `channelLeaving` / `releaseChannel` — the stable-name room's leave-before-rejoin gate | `cs-blessed-realtime` |
| `src/common/realtime/channelTeardown.test.ts` | its contract — per-name gate, bare-name keying, resolves on a rejected leave, a second release supersedes | `cs-blessed-realtime` |
| `src/common/realtime/realtimeDiag.ts` | `rtLog`, `rtVerbose`, `SystemPayload`, `bareName`, `instrumentChannel` — the `[rt]` console trail every channel writes | `cs-blessed-realtime` |
| `src/common/realtime/realtimeDiag.test.ts` | its contract — every wrapper logs AND forwards the app's callback untouched | `cs-blessed-realtime` |
| `src/common/realtime/useRealtimeReconnect.ts` | the app-wide socket nudge on visible / focus / online | `cs-blessed-realtime` |
| `src/common/realtime/useRealtimeReconnect.test.ts` | its contract — reconnect only when down and visible; listeners removed on unmount | `cs-blessed-realtime` |
| `src/common/realtime/useClubPresence.ts` | the `club:<handle>` presence roster: who is in the club orbit and which game they are viewing | `cs-blessed-realtime` |
| `src/common/realtime/useClubPresence.test.ts` | the teardown gate, and the roster claim that needs no server (self is in it from the first render); the synced roster is pinned by `e2e/presence.e2e.ts` | `cs-blessed-realtime` |
| `src/common/realtime/useClubSetupPresence.tsx` | the `club-setup:<handle>` presence → "X is setting up a game…" toast; the only `.tsx` | `cs-blessed-realtime` |
| `src/common/realtime/useClubSetupPresence.test.tsx` | its contract — the toast reconcile and where it sits in the stack, announce vs the join ack, the teardown gate (written by F-realtime-2) | `cs-blessed-realtime` |
| `src/common/realtime/channel.fake.ts` | the folder's fake channel: the server's two moves, the join ack and a presence sync, under the test's hand (written by F-realtime-2) | `cs-blessed-realtime` |
| `src/common/realtime/doc.md` | rewritten at the close: a two-sentence lede and a Design built on the one question that shapes the folder — is a channel's name private, or is it the room? Off `INTROS_OWED` | (no stamp — markdown) |
| `src/common/realtime/todo.md` | empty at the open; carries the two cosmetic items the re-read left under Maybe | (no stamp — markdown) |

**Decided at the opening, and why:**

- **Three files outside the folder are evidence, not roster:**
  `e2e/realtime-deaf-window.e2e.ts` (pins the attach refetch),
  `supabase/tests/common/realtime_publication_test.sql` (the publication
  invariant's pgTAP guard) and `docs/realtime-lost-events.md` (the only doc
  whose whole subject is this folder). Same ruling `supabase` and `session`
  made for their docs: a forward fix happens where a sentence is about this
  folder's files, and nothing else is touched. Joel's "i agree" was to the
  list as proposed, with these three posed as his call; recorded as evidence
  because that is the reversible reading — a later word can add them.
- **Every call site is evidence.** `useCommonGame`, `ClubPage`,
  `useClubChat`, `useScratchpad`, `useGameInvitations`, `usePeerCursors`,
  `useSharedMove`, connections' `useGame`, `useCells` and every game hook may
  be read as research; a finding or a change here is about
  `src/common/realtime/`.
- **The presence that PAUSES a game is not in this folder.** The areas table
  says "presence is what pauses a game and the pause boundary that reads it
  is `pause-suspend`'s; whichever opens second inherits what the first
  decided." Read against the tree: the roster `computePause` reads is
  `presentUserIds`, tracked on the `game:<id>` room by `useCommonGame`
  (`game-page`). This folder's two presence hooks carry the CLUB orbit
  (member dots, the abandoned-pointer heal, the setup toast) and never feed a
  pause. So what this area decides is the club-presence contract; the pause
  input stays `game-page`'s to hold and `pause-suspend`'s to read.

## Findings

Shape findings first, prose findings after, so the prose is written once.

### WORKED · F-realtime-1 · self-dot-absent-on-first-paint · the club page paints its own member hollow until the first presence sync

**Where:** `useClubPresence.ts:43,82,115`; the report is docs/deferred.md:84
("BUG — my own member dot reads as absent on the first paint of a club
page", Joel on prod 2026-08-30, "we either have a logic bug or a race I
lost"). It has no home in any `todo.md`.

**What the code does:** `roster` starts `[]` and is set only by the
`presence sync` handler, which fires after `subscribe` → SUBSCRIBED →
`track()` → the server's round-trip. `ClubPage` builds `presentUserIds`
from that roster and feeds it to the header strip, so for that whole window
the strip renders every member — including the one looking at it — as
"Away". A refresh looks fixed only because the second paint lands after the
sync.

**It is a logic gap, not a lost race.** Self is present by definition while
this hook is mounted with a handle: the hook is the thing announcing it.
Nothing needs to wait for the server to know that.

**Recommendation:** the hook's answer always contains self —
`{ userId: selfId, gameId: viewingGameId }` — merged with the synced roster
(the sync already carries self once it lands; the merge dedupes by
`userId`). `ClubPage`'s heal is unaffected: it asks whether anyone is viewing
`activeGameId`, and self on the club page has `gameId: null`. The e2e that
pins the roster (`e2e/presence.e2e.ts`) gains a case: the viewer's own dot is
filled on first paint. The deferred.md entry then comes out (it is a fixed
bug, not a deferral). Points for Joel: (1) work it here, or (2) move it to
`realtime/todo.md → Bugs` and leave it.

**Resolution (2026-09-05, Joel: "1.")** — done, as the hook change + an e2e
case + the deferred.md entry removed.

- **`useClubPresence.ts`** returns a memoized merge: with a handle, self is
  prepended unless the roster already names that `userId`, so once the sync
  lands `roster` itself is handed back. Memoized because the identity is a
  caller dependency — `ClubPage`'s heal has `presence` in its deps and
  restarts a 2.5s timer whenever it changes, so a fresh array per render
  would push that timer out indefinitely. That was not in the finding; it
  turned up on writing the return.
- **`useClubPresence.test.ts`** gains a second describe. The fake channel now
  records the `presence sync` handler and takes a `sync(state)` seam, which
  makes the DEFAULT fake the pre-sync window — the exact thing the club page
  paints in. Six cases: self before any sync, self carrying `viewingGameId`,
  no club → empty, self alongside a peer the sync did report, self exactly
  once when the sync reports us, and a stable identity across a rerender.
  Planted: with the merge removed three fail, with the `useMemo` removed the
  identity case fails.
- **`e2e/presence.e2e.ts`** gains "member dots: your own is filled before the
  channel answers" — `page.routeWebSocket` accepts the realtime socket and
  answers nothing, so no sync can land, and Alice's own dot must still be
  filled while Bob's stays hollow. **Unrun** (e2e runs when the area closes);
  it is also the suite's first `routeWebSocket`, so treat it as unproven
  until then.
- **docs/deferred.md** loses the BUG entry, and the profile-probe entry above
  it loses its closing "closely related to the entry below" sentence, which
  had nothing left to point at.

Green: `tsc -b`, `eslint` on the folder and the spec, and vitest over
`realtime`, `club`, `page-header` and `guards` (332 tests).

### WORKED · F-realtime-2 · setup-presence-untested · `useClubSetupPresence` has no unit test

**Where:** `useClubSetupPresence.tsx`, whole file; created in `40f6a7b0` with
no test, none since.

**What is unpinned:** the same leave-before-rejoin gate its sibling pins in
`useClubPresence.test.ts`, plus everything the sibling does not have — the
toast reconcile on each sync (show, replace-in-place by id, dismiss when the
setter leaves, never toast my own setup), the announce-after-SUBSCRIBED
ordering (dialog opened before the channel was up), track/untrack on
`announce` changing, and dismiss-all on unmount. `showToast` replacing by id
is what keeps a re-sync from stacking toasts, and nothing asserts it.

**Recommendation:** a `useClubSetupPresence.test.tsx` — a file per unit — with
the sibling's channel fake plus a `toastStore` spy. Cases: peer's setup →
one toast; second sync with the same peer → still one; peer gone → dismissed;
my own setup → no toast; `announce` set before SUBSCRIBED → tracked on
SUBSCRIBED; `announce` → null while subscribed → untrack; unmount → all
dismissed and the channel released. Plant each (every test in `boot` that
passed for the wrong reason was one that was not planted).

**Resolution (2026-09-05, Joel: "do it")** — done, all three ways it was
posed: the test written, the fake extracted, the real toast store used.

- **`channel.fake.ts`** (new) is the folder's fake channel. It answers
  nothing on its own: `subscribed()` plays the join ack and `sync(state)`
  plays a roster, so the two server moves are separable, which is what the
  announce-ordering cases need and what makes the pre-sync window the default
  state rather than something to race. `useClubPresence.test.ts` moved onto
  it — the fake it grew during F-realtime-1 was the same object, minus the
  join ack — and `lastFakeChannel(channel)` keeps the one cast in one place.
- **`useClubSetupPresence.test.tsx`** (new), thirteen cases in three groups:
  the peer-toast reconcile, announcing my own setup, and the teardown gate.
  The toast store is the real one, so "one toast per peer" is a claim about
  the stack rather than about an id we passed in.
- **The finding's reason was half wrong, and planting is what showed it.**
  It said the stable toast id is what keeps a re-sync from stacking toasts.
  It isn't — the reconcile loop dismisses anything not in the new roster, so
  a random id per sync still leaves ONE toast up. What the stable id actually
  buys is the toast's PLACE: `showToast` replaces in position, where a fresh
  id drops the toast and re-adds it at the corner, so a peer who keeps
  setting up would shuffle past every toast that arrived after them. That is
  the case that was added once the planted random id passed.
- **Planted, in four rounds:** the self-skip, the dismiss-gone loop, the
  dismiss-all on unmount, the catch-up track on the join ack, the
  `subscribedRef` wait, the untrack branch, `dismissible: false`, the random
  id, and the teardown gate. Each round failed exactly the cases it should
  and no others; the hook is byte-identical to HEAD afterward.

Not covered: the `?? 'Someone'` / `?? 'game'` wire fallbacks at `:96–97` — a
peer whose payload is missing a field — which F-realtime-4 keeps and is the
finding to fold a case into if it is worked.

### WORKED · F-realtime-3 · untrack-try-catch-is-dead · a `try` around an async call catches nothing

**Where:** `useClubPresence.ts:104–108`:

```ts
try {
  void ch.untrack()
} catch {
  // channel may already be closed
}
```

`untrack` is `async` in realtime-js 2.108.1 (`RealtimeChannel.js:235`), so it
cannot throw synchronously; the `catch` is unreachable and the comment
describes a failure that arrives as a REJECTED PROMISE, which `void` drops as
an unhandled rejection. The same shape sits at `useCommonGame.ts:603–607`
(`game-page`'s; listed and left).

**Recommendation:** `void ch.untrack().catch(() => {})` with the same
one-line comment, or drop the guard entirely and let `releaseChannel`'s
teardown be the only thing that speaks. Either way the comment stops
describing a `throw`.

**Resolution (2026-09-05, Joel: "do all")** — the guard is gone; the line is
`void ch.untrack()`, the way `useClubSetupPresence.tsx:151` already wrote it.

No `.catch()` either, and reading the library is what settled that. For a
presence push, `untrack` → `send` returns a promise that only ever RESOLVES —
`'ok'` / `'error'` / `'timed out'` (`RealtimeChannel.js:555–563`), so trouble
comes back as a value and there is no rejection to swallow. The one real
throw is the adapter's "tried to push … before joining"
(`phoenix/channelAdapter.js:46–53`), which this hook cannot reach: `join()`
always calls `subscribe()`, and the cleanup returns early when `join()` never
ran. `releaseChannel` follows on the next line and removes the channel
whatever untrack did.

### WORKED · F-realtime-4 · someone-default-is-dead · a `?? 'Someone'` that can never fire

**Where:** `useClubSetupPresence.tsx:148`:
`void ch.track({ user_id: selfId, username: username ?? 'Someone', brand, mode })`.

The branch is entered only when `brand && mode`, which means `announce` was
non-null, whose type says `username: string`. The fallback is a slot-filler
default with no case behind it — a default is a decision, and this one
decides nothing. The OTHER two — `e.username ??
'Someone'` and `e.brand ?? 'game'` at lines 96–97 — are real: they read the
wire shape, where every field is optional.

**Recommendation:** delete the fallback; `username` is a string there.

**Resolution (2026-09-05, Joel: "do all")** — deleted. The announce payload
now carries `username` as it arrived.

TypeScript still types that local `string | null`, because `brand && mode`
narrows those two consts and not a third — so the deletion does not turn the
runtime guarantee into a compile-time one. It does not need to: a payload
without a username is precisely what the RECEIVER's `?? 'Someone'` at `:97`
is for, and the sender inventing the same word first is what made the
fallback unreadable as a decision.

### WORKED · F-realtime-5 · channel-ref-type-drift · one hook types its channel differently from every sibling

**Where:** `useClubSetupPresence.tsx:54` —
`useRef<ReturnType<typeof supabase.channel> | null>`. `useClubPresence.ts:4`,
`channelTeardown.ts:3`, `postgresAttached.ts:3` and `realtimeDiag.ts:3` all
import `RealtimeChannel` from `@supabase/supabase-js` for the same thing.

**Recommendation:** import the type like the siblings do. Accidental drift,
not a deliberate difference.

**Resolution (2026-09-05, Joel: "do all")** — `import type { RealtimeChannel }
from '@supabase/supabase-js'`, and the ref is `useRef<RealtimeChannel |
null>`. Every file in the folder that names a channel type now names the same
one.

### WORKED · F-realtime-6 · refetch-log-topic-lacks-suffix · one channel's trail is written under two topic strings

**Where:** `useRealtimeRefetch.ts:178` logs `refetch #N (cause)` under
`${channelPrefix}:${id}`; the channel it belongs to is named
`${channelPrefix}:${id}:${suffix}` (line 195), which is what
`instrumentChannel` logs `subscribing` / `status` / `system ok` / `event`
under. Reading a trail therefore means matching two different prefixes for
one channel — and the doc's "Reading the trail" instructions pair a
`(subscribed)` refetch with the channel's `system ok` as if they shared a
topic. The e2e survives it only because it matches by `includes`.

**Recommendation:** build the name once (`const name = …`) and pass it to
both `supabase.channel` and `rtLog`. No behavior changes; the console lines
line up.

**Resolution (2026-09-05, Joel: "do it")** — done. `const name` at the top of
`realtimeRefetchEffect` is spent twice, by `rtLog` and by `supabase.channel`,
with a comment saying why one spelling matters. Console text only: nothing
else in the file describes the topic, `channelPrefix`'s docstring already
said the suffix is part of the full name, and the seventy tests in the folder
did not move.

### WORKED · F-realtime-7 · deaf-window-explained-four-times · the two-phase-subscribe story has four homes in one folder

**Where:** the "SUBSCRIBED is only the join ack; attaching to the WAL poller is
a second phase; events committed between are dropped" explanation is written
in full at `postgresAttached.ts:21–36`, `realtimeDiag.ts:14–30` (module
docstring), `realtimeDiag.ts:96–108` (`SystemPayload`'s docstring) and
`useRealtimeRefetch.ts:79–88` (point 3b) — and in docs/realtime-lost-events.md,
which is the story's actual home. A comment is not a second copy of an
explanation that lives somewhere else.

**Recommendation:** ONE home in code. `postgresAttached.ts` is the natural
one — it is the fix, and its opening paragraph already says it plainly. The
other three shrink to their own job plus a pointer: `realtimeDiag`'s module
docstring says what it makes VISIBLE and points at `onPostgresAttached` for
why the signal matters; `SystemPayload` keeps the wire shape and the
"two readers that must not fail together" sentence, drops the annotated
example; 3b becomes "refetch again when the attach is confirmed — see
`onPostgresAttached`". Fold in the nit at `realtimeDiag.ts:135` (a trailing
empty ` *` line closing `instrumentChannel`'s docstring) while that file is
open.

**Resolution (2026-09-05, Joel: "1. i'll take your rec")** — `postgresAttached.ts`
is the home and keeps its telling word for word; the others are down to their
own job plus a pointer.

- `realtimeDiag.ts`'s module docstring: "Why this exists" (18 lines, mechanism
  + annotated payload) → "What it makes visible" (7), which says the three
  channel states are indistinguishable to the app and sends the reader to
  `onPostgresAttached` for what the `system` message means.
- `SystemPayload`: keeps the wire shape, `status: 'ok'` vs `'error'` in one
  sentence, and the two-readers-that-must-not-fail-together paragraph; the
  annotated example — its second printing twenty lines below the first — is
  gone.
- Point 3b in `useRealtimeRefetch.ts`: seven lines → four, one sentence and
  the pointer.
- The nit at `instrumentChannel`'s docstring: gone.

**A fifth copy, not in the finding:** `useRealtimeRefetch.test.ts:219–221`
told the same story to explain one `act()`. Now it names the message being
fired and points at the helper. Found while checking what remained — the
grep for "join ack" / "Subscribed to PostgreSQL" / "WAL poller" over the
folder is what a re-read should repeat.

Net −17 lines of docstring; `tsc -b`, eslint and 338 tests green.

### WORKED · F-realtime-8 · stale-lib-supabase-paths · comments still write the pre-reorg path

**Where:** the folder was `common/lib/supabase/` before the restructure.
Sites that still say so, by file:

| file | sites |
|---|---|
| ~~`src/common/realtime/useRealtimeRefetch.ts`~~ | its one site went with F-realtime-7's rewrite of point 3b |
| `src/common/realtime/useRealtimeRefetch.test.ts` | 1 (line 63) |
| `src/common/realtime/useClubPresence.ts` | 1 (line 95) |
| `src/common/realtime/useClubPresence.test.ts` | 1 (line 9) |
| `src/common/realtime/useClubSetupPresence.tsx` | 1 (line 122) |
| `docs/realtime-lost-events.md` | 2 (lines 186, 199) |
| `docs/deferred.md` | 1 (line 64) |
| `e2e/realtime-deaf-window.e2e.ts` | 1 (line 11) |
| outside — `useClubChat.ts`, `useClubChat.test.ts`, `ClubPage.tsx` ×2, `useScratchpad.ts` ×2, `useCommonGame.ts` ×2, `useCommonGame.test.ts` ×2, `useGameInvitations.ts`, connections `useGame.ts`, `useCells.ts`, `useCells.test.ts` | 14, all pointing at THIS folder's files |
| outside, not ours — `faultStore.ts` ×2 | point at `dbEnvelope.ts` (`supabase`'s file; that area closed without it) |

**Recommendation:** fix the folder's five, the doc's two, deferred.md's one
and the e2e's one here. The fourteen outside are a rename sweep caused by
this folder moving — no decision in them — and the plan says such a sweep
ships with the area that found it, without opening those folders or moving
their stamps. The `faultStore.ts` pair is the same kind of sweep for a
sibling's file; include or leave, Joel's call. Every site becomes the bare
module name (`postgresAttached.ts`, `channelTeardown.ts`) the way the
folder's own newer comments already write it.

**Resolution (2026-09-05, Joel: "fix all")** — every site in the repo, the
fourteen outside and the `faultStore.ts` pair included. `grep -rn
"lib/supabase"` over `src/`, `docs/`, `e2e/`, `supabase/` and `scripts/`
returns nothing; what is left is in `plans/`, which is the record of the move
rather than a pointer to follow.

Code comments take the bare module name (`postgresAttached.ts`,
`channelTeardown.ts`, `dbEnvelope.ts`). The two docs keep a path, since a doc
is read away from the tree — `common/realtime/…`, and
realtime-lost-events.md's markdown link already resolved correctly, so only
its label was wrong. `useClubChat.test.ts:13` was the odd one: it named a
MOCKED MODULE rather than a file to go read, and now says
`../supabase/supabase`, which is what `vi.mock` is actually given at `:86`.

Nothing outside this folder was opened for anything else, and no stamps
moved. Full unit suite green (2650), eslint clean on every folder touched.

### WORKED · F-realtime-9 · stale-counts-in-test-docstrings · two counts that stopped being true

**Where:**

- `useRealtimeRefetch.test.ts:4` — "the factory four of the per-game data
  hooks share". Sixteen call sites today.
- `useClubPresence.test.ts:10` — "the ORDERING the other three share". Eight
  stable-name rooms open through the gate per the registry in
  docs/supabase.md.

Both are the same rot: a tally written in prose goes stale the first time
the roster moves. **Recommendation:** name the condition — "the
factory every Pattern A hook calls", "the ordering every stable-name room
depends on" — and let the registry carry the list.

**Resolution (2026-09-05, Joel: "yes")** — both name a condition now, so a
new game or a new room joins by definition and no number can rot.

**Measured before rewriting, since a recommendation that names a condition
still has to be true of the tree:** `useRealtimeRefetch(` has SEVENTEEN call
sites (codenamesduet ×3, bananagrams ×2, and one each in psychicnum, wordle,
stackdown, scrabble, waffle, boggle, wordiply, strands, letterboxed, setgame,
the bee-games factory and HomePage) — exactly the membership list under
Pattern A at docs/supabase.md:295–309. `channelLeaving(` has EIGHT, matching
the eight stable rows of that doc's channel registry. Neither four nor three
was ever close.

**A letter is not a meaning** (Joel, this session: *"i don't think i'd
remember what 'pattern A' is"*). Both rewrites gloss the label they use —
Pattern A arrives as "the app's default realtime shape: reload the rows on
any event rather than applying the event", and "stable-name room" as "the
rooms whose peers must all join the identical topic, so they can't take the
per-client dedup suffix". The registry is cited for the list rather than
copied. This area's own roster row for `useRealtimeRefetch.ts` carried the
same stale sixteen and now names the condition too.

### WORKED · F-realtime-10 · canonical-example-points-at-non-callers · "see `useGame.ts` files" for a function no `useGame.ts` calls

**Where:** `channelDedup.ts:27` — "See `useGame.ts` files for the canonical
example." No game's `useGame.ts` calls `channelDedupSuffix`; they call the
factory, which calls it. The direct callers are `useRealtimeRefetch.ts`,
`useCells.ts`, `ClubPage.tsx`, `useClubChat.ts` and `useGameInvitations.ts`.
docs/code-conventions.md:207 has the same sentence, pointing at
`codenamesduet/hooks/useGame.ts`.

**Recommendation:** point at `useRealtimeRefetch.ts:194` — the one place a
reader will actually find the suffix spent — in both places.

**Resolution (2026-09-05, Joel: "do all")** — both point at
`useRealtimeRefetch.ts` now, `channelDedup.ts`'s naming what a reader will
find there ("where the suffix is spent on the channel every per-game data
hook opens through it"). docs/code-conventions.md's copy went with
F-realtime-11's rewrite of the same paragraph.

### WORKED · F-realtime-11 · code-conventions-channel-list-drifted · a second channel list, wrong in three ways

**Where:** docs/code-conventions.md → "Realtime channel names" (lines
197–207) keeps a five-row channel list beside docs/supabase.md's registry,
which calls itself "every channel in the app, in one place". The copy has
drifted: it names `club-active:<club_handle>:<uuid>`, which nothing opens
(the club page's channel is `club-games:`); it says `game:<id>`'s StrictMode
collision is "handled by the hook's own `removeChannel` cleanup", which
`channelTeardown` replaced; and it lists five of the registry's eighteen
rows. The paragraph under it explains the suffix in terms this folder's
docstring already owns.

**Recommendation:** keep the naming pattern sentence and the "two kinds of
name" rule, replace the list with a pointer to the registry, and point the
suffix paragraph at `channelDedup.ts`. It is a doc paragraph about this
folder's two mechanisms, so the fix is this area's; but it is a docs-wide
file with no owning area, so: (1) fix here, or (2) leave it and note it.

**Resolution (2026-09-05, Joel: "do all")** — fixed here. The section keeps
the naming pattern and the two-kinds-of-name RULE (stable iff peers must
share the room; suffixed everywhere else) and states each kind's consequence
— a stable name opens through `channelTeardown.ts`, a suffixed one gives each
tab its own room. The five-row list is replaced by a pointer to the registry
in docs/supabase.md, which the surviving prose now names as "every channel in
the app, in one place". The suffix paragraph points at `channelDedup.ts` for
the reasoning and `useRealtimeRefetch.ts` for where it is spent, which is
F-realtime-10's half of the same paragraph. `club-active:<club_handle>:<uuid>`
appears nowhere in the repo now.

### WORKED · F-realtime-12 · lost-events-doc-cause-list-omits-attached · the doc's own table forgets the cause it exists for

**Where:** docs/realtime-lost-events.md:209 — the `[rt]` table row for
`refetch #3 (event)` says the causes are "`mount` / `subscribed` / `event`".
The factory's fourth cause is `attached` (`useRealtimeRefetch.ts:176`), and
it is the one the document is about; the e2e greps for it by name.

**Recommendation:** add `attached` to the row. One word.

**Resolution (2026-09-05, Joel: "do all")** — added, in the factory's own
order: `mount` / `subscribed` / `attached` / `event`.

### WORKED · F-realtime-13 · supabase-md-misplaces-the-publication-guard · "each game's schema_test.sql pins its publication membership"

**Where:** docs/supabase.md:352. No game's schema test does; the one guard is
`supabase/tests/common/realtime_publication_test.sql`, whose header says it
is "the single, registry-driven guard for that invariant across the whole
app", and it is the only file under `supabase/tests/` that reads
`pg_publication_tables`.

**Recommendation:** name the one file. The publication invariant is this
layer's rule (a missing table kills a channel this folder opens), so the
sentence is about this area's subject; the file it names is evidence here.

**Resolution (2026-09-05, Joel: "do all")** — the sentence names
`supabase/tests/common/realtime_publication_test.sql` and calls it what its
own header calls it: the single, registry-driven guard across every schema.
The clause about each game's migration adding its tables is untouched — that
half was true. Two game docs (wordiply, wordwheel) already described the
`schema_test.sql` → common-guard deferral correctly, so nothing else moved.

### WORKED · F-realtime-14 · effects-unnamed · non-trivial `useEffect` callbacks in this folder are anonymous

**Where:** raised by Joel, 2026-09-05, against `useClubPresence.ts:54` — the
subscribe effect, the largest in the folder. docs/code-conventions.md:30 and
its hook-callback rule: a non-trivial `useEffect` callback takes a named
function expression, so stack traces, the DevTools Hooks panel and prose all
have something to say other than "the third effect".

**Recommendation:** name every non-trivial one in the folder. Points for
Joel: (1) sweep them here, or (2) leave them and note it.

**Resolution (2026-09-05, Joel: "1 do these now")** — swept. The folder's four
non-trivial effects are `subscribeToClubPresence`
(`useClubPresence.ts`), `subscribeToSetupPresence` and `announceMySetup`
(`useClubSetupPresence.tsx`), and `reconnectOnReturn`
(`useRealtimeReconnect.ts`). `useRealtimeRefetch.ts:161`'s
`realtimeRefetchEffect` was already named — the anonymous callback in that
file is its one-line `loadRef.current = load` ref-sync, which the rule
exempts, as is `useClubSetupPresence.tsx:62`'s. Those two are all that is
left anonymous in the folder.

## From the re-read (2026-09-05)

The whole folder read in one sitting after the last group. **No behavior
problem anywhere** — every hook does what its docstring says, the two
presence hooks agree with each other now, and the suffixed/stable split holds
(`useRealtimeRefetch` calls `removeChannel` directly, which is what
`channelTeardown` says a suffixed channel should do). What the sitting turned
up is four prose findings and two nits, all of them the same species this
area has been fixing.

### WORKED · F-realtime-15 · teardown-lists-four-of-eight-rooms · a room list in prose beside the registry

**Where:** `channelTeardown.ts:11–12` — "Channels whose name is the ROOM —
`game:<id>`, `club:<handle>`, `club-setup:<handle>`, `scratchpad:<id>` —
can't take the random suffix". There are EIGHT stable rooms (the registry in
docs/supabase.md), and connections', scrabble's and crosswords' are missing.
It reads as a list, not an example, and it is the exact rot F-realtime-9 took
out of two docstrings a few files away.

**Recommendation:** name the condition — channels whose name is the room its
peers must share — and let the registry carry the list. Same fix, same reason.

**Resolution (2026-09-05, Joel: "fix all four")** — done, and the registry is
named as where to look.

### WORKED · F-realtime-16 · reading-the-trail-twice · the diagnosis recipe is in two places

**Where:** `realtimeDiag.ts:39–42` ("Reading the trail: a healthy channel
shows `status SUBSCRIBED` followed shortly by `system ok`…") and
docs/realtime-lost-events.md:215–220, which is the same recipe at more
length, under the same words. F-realtime-7 moved the MECHANISM to one home
and left this, its practical half, in two.

**Recommendation:** decide which home. The console lines are the module's
output, so a short "healthy is SUBSCRIBED → system ok" belongs with them; the
longer reading — what a stale client's last lines look like — is the doc's.
Either keep the one sentence and point at the doc, or drop it and point.

**Resolution (2026-09-05, Joel: "fix all four")** — the module keeps one
sentence, "healthy is `status SUBSCRIBED` → `system ok`", and sends every
other shape to the doc.

### WORKED · F-realtime-17 · fake-channel-invitation-overreaches · three hand-built fakes and one shared one, and the shared one claims the job

**Where:** `channel.fake.ts:9` says "Reach for this in any test of a hook that
opens a channel." Three sibling tests keep their own, each for a reason:
`realtimeDiag.test.ts` needs bindings recorded BY TYPE and an uninstrumented
channel (it is testing the instrumentation), `postgresAttached.test.ts` needs
only a `system` binding, and `channelTeardown.test.ts` needs nothing but
`.topic`. Those are good reasons, and the invitation as written says they
were oversights.

**Recommendation:** narrow the sentence to what the fake is actually for — a
test that drives a hook through subscribe/presence — and say that a test of a
smaller surface should keep its own smaller double. One sentence.

**Resolution (2026-09-05, Joel: "fix all four")** — narrowed to "when a test
drives a HOOK through a channel's life", with the three narrower doubles named
and their reasons given, so the next reader sees four deliberate choices
rather than one rule and three exceptions.

### WORKED · F-realtime-18 · diag-docstring-dangling-above · "the health signal above" no longer points at anything

**Where:** `realtimeDiag.ts:31` — the wiring list says the module logs "the
`system` message — the postgres-changes health signal **above**". Before
F-realtime-7 the section above printed the payload and explained it; now it
says what the module makes visible and points at `onPostgresAttached`.

**Recommendation:** "the postgres-changes health signal (`SystemPayload`)" —
the type is twenty lines down in the same file and is where the shape lives.

**Resolution (2026-09-05, Joel: "fix all four")** — done, as
"(`SystemPayload`, below)".

### Nits, worth one line each

- **Archaeology in `realtimeDiag.test.ts`:** `:13` ("and it had no test") and
  `:169–170` ("which is why errored channels were invisible before this
  module existed"). Both describe the repo before the module rather than the
  code in front of the reader.
- **Docstring placement in test files splits 6–2:** six put the file
  docstring above the imports, `realtimeDiag.test.ts` and
  `useRealtimeReconnect.test.ts` put it below. Cosmetic, and only worth
  touching if the folder is being made uniform anyway.

## Notes

- **Listed and left, `game-page` / `pause-suspend`:** docs/deferred.md:241
  "A disconnected player is the one person who is not told" — pause is
  derived from `presentUserIds`, which only the server-pushed sync updates,
  and `useCommonGame`'s subscribe callback acts on nothing but SUBSCRIBED.
  Nothing in this folder can fix that; `useRealtimeReconnect` is the nearest
  piece and it only nudges the socket.
- **Listed and left, `game-page`:** `useCommonGame.ts:603–607` has the same
  dead `try` around `untrack()` as F-realtime-3.
- **`e2e/realtime-deaf-window.e2e.ts:13–15`** claims the deterministic guard
  asserts the `(attached)` refetch "appears after the data channel's
  `system ok`"; the test asserts only that the line APPEARS (line 96–104), not
  its order. Evidence, not roster — recorded so the doc's description of the
  test is not trusted as an ordering guarantee.
- **`__resetChannelTeardowns`** is the only dunder-prefixed test seam
  exported from app code in `src/`. Not a finding — nothing else needed one —
  but if a second appears, the convention should be named.
- **No import cycle through the client.** `supabase.ts` imports
  `realtimeDiag.ts` to wrap the channel factory; `realtimeDiag.ts` imports
  only `utils` and `web-storage`. The hooks and `channelTeardown` import
  `supabase.ts` — one direction each.
- **`useClubChat.test.ts:13`** said its mock replaces `../lib/supabase` when
  the mock is of `../supabase/supabase`; fixed with F-realtime-8's sweep.
  `session` recorded the same line in `useSession.test.ts`, which is already
  correct in the tree.
- **ESLint is clean on the folder** (`npx eslint src/common/realtime`, no
  output), so none of the deliberate `exhaustive-deps` choices is a warning.
- **Owed by every area from `mobile`, checked:** no boolean-returning hook
  here (`useRealtimeReconnect` and `useClubSetupPresence` return `void`,
  `useClubPresence` a roster); `channelDedup.ts` tests the FEATURE
  (`typeof crypto`, `typeof crypto.randomUUID`), not `window`.

## Predicted test breaks

*(written when the area starts changing things)*

- F-realtime-1 (worked): held. The teardown-gate cases never read the roster,
  so they stayed green while the file gained roster cases of its own, and
  `e2e/presence.e2e.ts` gained a case rather than losing one.
- F-realtime-6 (worked): held. `useRealtimeRefetch.test.ts` mocks
  `channelDedupSuffix` to `'test-suffix'` and asserts channel NAMES, not log
  lines — green. `e2e/realtime-deaf-window.e2e.ts:95–97` matches
  `wordwheel:<id>` by `includes`, so the suffixed topic still matches (unrun,
  like every e2e until the area closes).
- F-realtime-2 (worked): held — nothing existed to break. `useClubPresence`'s
  own cases moved onto the shared fake unchanged and stayed green.
- F-realtime-3/4/5 (worked): held — nothing reads the deleted `catch`, the
  deleted fallback or the ref's type. All three files' tests stayed green.
- F-realtime-8/9/10: comments and docstrings only; `americanSpelling` and
  `csStamps` are the guards that read them, neither cares.

## Closing

- [x] the whole area re-read in one sitting after the last group — done
      2026-09-05; no behavior problem, four prose findings (F-realtime-15
      through -18) and two nits recorded above
- [x] the folder's `doc.md` Design written; its row off `INTROS_OWED` —
      2026-09-05, planted (the row back on turns the guard red)
- [x] `todo.md` holds everything still owed; nothing durable left in this file
      — the two cosmetic items from the re-read, under Maybe. Everything else
      the area found was worked
- [x] every file on the roster blessed, or its stamp says why not — all
      seventeen read `cs-blessed-realtime` (Joel, 2026-09-05); the two
      markdown files carry no stamp, as markdown never does

## Closing summary

Moved here from `plans/app-audit.md` (its "Where to start" notes and its row in
the areas table) when that file was trimmed to the process, 2026-09-23.

**`realtime` is closed** (2026-09-05): seventeen files `cs-blessed-realtime` —
fifteen plus the two the area wrote — and eighteen findings, all worked. The one
bug was the club page painting the viewer's OWN member dot hollow until the
presence server answered, filed on prod and never diagnosed: the roster started
empty and only a sync filled it, when self is present by definition while the
hook that announces it is mounted. It now carries self from the first render,
memoized because the club page restarts its 2.5s abandoned-game wait whenever
the roster changes. The folder's one untested hook — the "someone is already
setting up a game" toast — got thirteen cases and a shared `channel.fake.ts`
whose two seams are the server's two moves, the join ack and a presence sync;
holding those apart is what let the announce-before-SUBSCRIBED ordering be
tested at all. Planting corrected the finding that prompted it: the stable toast
id is NOT what stops a re-sync stacking toasts (the reconcile loop does), it is
what keeps the toast in its place in the stack, and that case only exists
because a planted random id passed. The rest was prose, and it was the same
defect over and over: **a count or a list written where a condition belonged.**
Two docstrings claimed "four" and "the other three" against seventeen and eight;
`code-conventions.md` kept a five-row channel list beside the registry that
calls itself every channel in one place, naming one channel nothing opens; a
teardown docstring listed four of eight stable rooms; `supabase.md` credited
each game's schema test with a publication guard that lives in one common file;
and the deaf-window story — the reason this whole folder exists — was written
out in full in four places plus a test comment. One home each now, and every
list replaced by the condition that decides membership. Twenty-one comments
across the repo still pointed at `common/lib/supabase/`, the folder's pre-reorg
path; that sweep shipped here, since this folder moving is what caused it. Also
from Joel this session, and now a standing rule: a label like "Pattern A" is an
index into a doc, not a meaning, so it always travels with a short gloss. **The
closing re-read earned its place again** — four more, three of them created by
this area's own fixes, including an invitation in the new fake that read the
three deliberate hand-built doubles as oversights. `todo.md` carries two
cosmetic items.

**CLOSED 2026-09-05.** presence, reconnect, the subscribe hooks. Presence is what pauses a game and the pause boundary that reads it is `pause-suspend`'s; whichever opens second inherits what the first decided — and this one decided the CLUB orbit only: the roster that pauses a game is tracked in `game-page`, so `pause-suspend` inherits nothing from here
