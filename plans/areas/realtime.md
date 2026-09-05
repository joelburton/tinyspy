# Area: realtime

The folders it reads: `realtime`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — read 2026-09-05, findings recorded, none worked.**

## The roster

Agreed 2026-09-05 (Joel: "i agree. read and audit.") — every file of
`src/common/realtime/`:

| file | what it is | stamp |
|---|---|---|
| `src/common/realtime/useRealtimeRefetch.ts` | the subscribe-and-refetch factory every Pattern A hook calls (sixteen call sites: fourteen game hooks, the bee-games factory, HomePage) | `cs-audited-realtime` |
| `src/common/realtime/useRealtimeRefetch.test.ts` | its contract — mount load, SUBSCRIBED refetch, attach refetch and its filter, event refetch, multi-table fan-in, `id` rebuild, mounted-guard, the ref trick | `cs-audited-realtime` |
| `src/common/realtime/postgresAttached.ts` | `onPostgresAttached` — the deaf-window closer's filter on the `system` message | `cs-audited-realtime` |
| `src/common/realtime/postgresAttached.test.ts` | its contract — fires on attach ok, on every re-attach, on nothing else | `cs-audited-realtime` |
| `src/common/realtime/channelDedup.ts` | `channelDedupSuffix` — a private channel name that can never be reused | `cs-audited-realtime` |
| `src/common/realtime/channelDedup.test.ts` | its contract — platform UUID when present, the fallback's shape and monotonic counter | `cs-audited-realtime` |
| `src/common/realtime/channelTeardown.ts` | `channelLeaving` / `releaseChannel` — the stable-name room's leave-before-rejoin gate | `cs-audited-realtime` |
| `src/common/realtime/channelTeardown.test.ts` | its contract — per-name gate, bare-name keying, resolves on a rejected leave, a second release supersedes | `cs-audited-realtime` |
| `src/common/realtime/realtimeDiag.ts` | `rtLog`, `rtVerbose`, `SystemPayload`, `bareName`, `instrumentChannel` — the `[rt]` console trail every channel writes | `cs-audited-realtime` |
| `src/common/realtime/realtimeDiag.test.ts` | its contract — every wrapper logs AND forwards the app's callback untouched | `cs-audited-realtime` |
| `src/common/realtime/useRealtimeReconnect.ts` | the app-wide socket nudge on visible / focus / online | `cs-audited-realtime` |
| `src/common/realtime/useRealtimeReconnect.test.ts` | its contract — reconnect only when down and visible; listeners removed on unmount | `cs-audited-realtime` |
| `src/common/realtime/useClubPresence.ts` | the `club:<handle>` presence roster: who is in the club orbit and which game they are viewing | `cs-audited-realtime` |
| `src/common/realtime/useClubPresence.test.ts` | the teardown gate only; the roster is pinned by `e2e/presence.e2e.ts` | `cs-audited-realtime` |
| `src/common/realtime/useClubSetupPresence.tsx` | the `club-setup:<handle>` presence → "X is setting up a game…" toast; the only `.tsx`, the only source file with no test | `cs-audited-realtime` |
| `src/common/realtime/doc.md` | lede only at the open: "Supabase channels, reconnect, refetch, and presence." No Design; row on `DESIGNS_OWED` | (no stamp — markdown) |
| `src/common/realtime/todo.md` | empty under all four headings at the open | (no stamp — markdown) |

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
- **The thirty call sites are evidence.** `useCommonGame`, `ClubPage`,
  `useClubChat`, `useScratchpad`, `useGameInvitations`, `usePeerCursors`,
  `useSharedMove`, connections' `useGame`, `useCells` and the fourteen game
  hooks may be read as research; a finding or a change here is about
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

### F-realtime-1 · self-dot-absent-on-first-paint · the club page paints its own member hollow until the first presence sync

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

### F-realtime-2 · setup-presence-untested · `useClubSetupPresence` has no unit test

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

### F-realtime-3 · untrack-try-catch-is-dead · a `try` around an async call catches nothing

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

### F-realtime-4 · someone-default-is-dead · a `?? 'Someone'` that can never fire

**Where:** `useClubSetupPresence.tsx:148`:
`void ch.track({ user_id: selfId, username: username ?? 'Someone', brand, mode })`.

The branch is entered only when `brand && mode`, which means `announce` was
non-null, whose type says `username: string`. The fallback is a slot-filler
default with no case behind it — a default is a decision, and this one
decides nothing. The OTHER two — `e.username ??
'Someone'` and `e.brand ?? 'game'` at lines 96–97 — are real: they read the
wire shape, where every field is optional.

**Recommendation:** delete the fallback; `username` is a string there.

### F-realtime-5 · channel-ref-type-drift · one hook types its channel differently from every sibling

**Where:** `useClubSetupPresence.tsx:54` —
`useRef<ReturnType<typeof supabase.channel> | null>`. `useClubPresence.ts:4`,
`channelTeardown.ts:3`, `postgresAttached.ts:3` and `realtimeDiag.ts:3` all
import `RealtimeChannel` from `@supabase/supabase-js` for the same thing.

**Recommendation:** import the type like the siblings do. Accidental drift,
not a deliberate difference.

### F-realtime-6 · refetch-log-topic-lacks-suffix · one channel's trail is written under two topic strings

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

### F-realtime-7 · deaf-window-explained-four-times · the two-phase-subscribe story has four homes in one folder

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

### F-realtime-8 · stale-lib-supabase-paths · comments still write the pre-reorg path

**Where:** the folder was `common/lib/supabase/` before the restructure.
Sites that still say so, by file:

| file | sites |
|---|---|
| `src/common/realtime/useRealtimeRefetch.ts` | 1 (line 88) |
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

### F-realtime-9 · stale-counts-in-test-docstrings · two counts that stopped being true

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

### F-realtime-10 · canonical-example-points-at-non-callers · "see `useGame.ts` files" for a function no `useGame.ts` calls

**Where:** `channelDedup.ts:27` — "See `useGame.ts` files for the canonical
example." No game's `useGame.ts` calls `channelDedupSuffix`; they call the
factory, which calls it. The direct callers are `useRealtimeRefetch.ts`,
`useCells.ts`, `ClubPage.tsx`, `useClubChat.ts` and `useGameInvitations.ts`.
docs/code-conventions.md:207 has the same sentence, pointing at
`codenamesduet/hooks/useGame.ts`.

**Recommendation:** point at `useRealtimeRefetch.ts:194` — the one place a
reader will actually find the suffix spent — in both places.

### F-realtime-11 · code-conventions-channel-list-drifted · a second channel list, wrong in three ways

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

### F-realtime-12 · lost-events-doc-cause-list-omits-attached · the doc's own table forgets the cause it exists for

**Where:** docs/realtime-lost-events.md:209 — the `[rt]` table row for
`refetch #3 (event)` says the causes are "`mount` / `subscribed` / `event`".
The factory's fourth cause is `attached` (`useRealtimeRefetch.ts:176`), and
it is the one the document is about; the e2e greps for it by name.

**Recommendation:** add `attached` to the row. One word.

### F-realtime-13 · supabase-md-misplaces-the-publication-guard · "each game's schema_test.sql pins its publication membership"

**Where:** docs/supabase.md:352. No game's schema test does; the one guard is
`supabase/tests/common/realtime_publication_test.sql`, whose header says it
is "the single, registry-driven guard for that invariant across the whole
app", and it is the only file under `supabase/tests/` that reads
`pg_publication_tables`.

**Recommendation:** name the one file. The publication invariant is this
layer's rule (a missing table kills a channel this folder opens), so the
sentence is about this area's subject; the file it names is evidence here.

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
- **`useClubChat.test.ts:13`** says its mock replaces `../lib/supabase`; the
  mock is of `../supabase/supabase`. `session` recorded the same line in
  `useSession.test.ts`. Counted in F-realtime-8's sweep table.
- **ESLint is clean on the folder** (`npx eslint src/common/realtime`, no
  output), so none of the deliberate `exhaustive-deps` choices is a warning.
- **Owed by every area from `mobile`, checked:** no boolean-returning hook
  here (`useRealtimeReconnect` and `useClubSetupPresence` return `void`,
  `useClubPresence` a roster); `channelDedup.ts` tests the FEATURE
  (`typeof crypto`, `typeof crypto.randomUUID`), not `window`.

## Predicted test breaks

*(written when the area starts changing things)*

- F-realtime-1: `useClubPresence.test.ts` asserts nothing about the roster's
  contents, so it stays green; `e2e/presence.e2e.ts` gains a case rather than
  losing one.
- F-realtime-6: `useRealtimeRefetch.test.ts` mocks `channelDedupSuffix` to
  `'test-suffix'` and asserts channel NAMES, not log lines — green.
  `e2e/realtime-deaf-window.e2e.ts:95–97` matches `wordwheel:<id>` by
  `includes`, so a suffixed topic still matches.
- F-realtime-8/9/10: comments and docstrings only; `americanSpelling` and
  `csStamps` are the guards that read them, neither cares.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
