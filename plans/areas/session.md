# Area: session

The folders it reads: `session`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-05** (Joel: "bless files in this area and close it") —
twelve findings, all twelve worked, and four files `cs-blessed-session`, one of
them written by the area.

## The roster

Agreed 2026-09-05 (Joel: "1,2,3. you can read these areas for research, but
the findings & changes should be about src/common/session. go ahead and stamp
the files and audit.") — every file of `src/common/session/`:

| file | what it is | stamp |
|---|---|---|
| `src/common/session/useSession.ts` | the auth-state hook `App` gates on: `session`, `needsClaim`, `probeFailed`, `loading`, `refresh` (`probeFailed` added by F-session-2) | `cs-blessed-session` |
| `src/common/session/useSession.test.ts` | its contract — a case per state, per getUser failure class, and per "same user again" | `cs-blessed-session` |
| `src/common/session/useProfile.ts` | the `Profile` type, the module-level profile store, `useProfile`, `setProfile`, `setProfileColor` (`useCurrentProfile` deleted by F-session-1) | `cs-blessed-session` |
| `src/common/session/useProfile.test.ts` | **written by this area** (F-session-11): the store's four cases — one value to every reader, cleared for every reader, a saved color repainting the rest of the row intact, and a color save with nothing to save it into | `cs-blessed-session` |
| `src/common/session/doc.md` | lede only at the open ("Who is signed in, and their profile."), no Design. **Lede rewritten and Design written 2026-09-05** (Joel: "write the doc in the area"), before any finding was worked; its row is off `DESIGNS_OWED`. rewritten again as each finding landed, and read end to end at the close | (no stamp — markdown) |
| `src/common/session/todo.md` | empty at the close: its one item was F-session-7 and F-session-8, both worked | (no stamp — markdown) |

**Decided at the opening, and why:**

- **`common/auth/`, `common/account/` and `common/boot/` are out.** The sign-in
  and claim screens are `simple-page`'s, profile editing is `account`'s, the
  session gate at mount is `boot`'s. All three may be READ as research; a
  finding or a change here is about `src/common/session/`.
- **`common.profiles`, `claim_username` and `update_profile_color` in
  `common.sql` are evidence, not roster** — the same ruling `supabase` made for
  that file. `common.sql` is still unplaced in the areas table.
- **`docs/common.md` and `docs/supabase.md` are evidence.** A forward fix
  happens only where a sentence is about these two hooks (F-session-4 does
  that).

## Findings

Audited 2026-09-05. Every file read in one sitting; every cross-file claim
below was checked against the tree — the SQL, the callers, the auth-js error
classes, the docs — not taken from a docstring. The two hooks do their jobs
and the tests pass clean (`npx vitest run src/common/session`, 9 of 9, eslint
quiet). What the read turned up: one design question about two hooks reading
the same row, one behavior the prose itself calls over-permissive and whose
"no screen for it" excuse has lapsed, one redundant round trip per auth event,
and a lot of prose describing how things used to be.

Shape changes first (F-session-1 to -3), so prose is not written twice.

### WORKED · F-session-1 · `one-row-read-twice-two-hooks` · The profile row is read twice at boot, by two hooks whose names do not say how they differ

`useSession.probeProfile` reads `profiles.select('user_id').eq('user_id', …)`
(`useSession.ts:129`) to learn whether a row exists. Then, the moment
`needsClaim` is false, the account menu on every page calls `useProfile(session)`
(`useAccountMenuSection.ts:38`), which reads the same row again —
`select('username, color, can_edit_words')` (`useProfile.ts:59`) — into a
module-level store. Two reads of one row, back to back, on every sign-in.

The second half of the finding is the pair of hooks over that store.
`useProfile(session)` loads-and-subscribes; `useCurrentProfile()` subscribes
only, for `DefinitionView`, which has no session in reach. The names carry
none of that: both say "the signed-in user's profile", and the only signal is
the parameter. `useCurrentProfile`'s docstring spends four lines explaining
that it never loads and that the store is "warm in practice" because the menu
called the other hook first — a comment at the call site standing in for a
name that says the thing.

**Recommendation.** Let `useSession`'s probe read the full row and seed the
store. The probe already exists, already runs before anything renders, and
already answers "is there a row" — reading three more columns costs nothing.
Then there is one hook, `useProfile()`, with no argument, subscribe-only,
correct from any depth of the tree; the store is populated before the first
page mounts, so the "cold store" caveat and the `session` parameter both go
away. `refresh()` after a claim seeds it the same way; `SIGNED_OUT` clears it;
`setProfileColor` is unchanged. The four callers change their import and drop
an argument (`HomePage.tsx:62`, `EditProfileModal.tsx:52`,
`useAccountMenuSection.ts:38`, `DefinitionView.tsx:50`).

The smaller alternative, if the two-read shape is wanted for some reason: keep
both hooks and rename the subscribe-only one so the name says it —
`useLoadedProfile` — and let its docstring shrink to one line.

Numbered points to rule on:

1. Merge the probe and the load into one read that seeds the store (the
   recommendation), or keep the two reads and only rename?
2. If merged: does `useProfile.ts` keep its name with the store inside it, or
   does the store move into `useSession.ts` and `useProfile.ts` become the
   hook file only?

**Resolution (2026-09-05, Joel: "do it").** Merged, and the store stayed in
`useProfile.ts`. The probe now selects `username, color, can_edit_words` and
calls `setProfile(row ?? null)` before `loading` clears; `ensureLoaded` and
`useCurrentProfile` are gone, and `useProfile()` is arg-free and
subscribe-only. Three things came with it:

- **The store is now emptied on every signed-out path**, which nothing did
  before — a signed-out tab kept the last user's name and color until a
  different user signed in. The four identical clear-everything bodies became
  one `resolveSignedOut`.
- **`session` stopped being an argument anywhere it was only there for the
  lookup**: `useAccountMenuSection()` and `<EditProfileModal>` both dropped it,
  which reached `App.tsx`, `ClubPage`, `GamePage`, `HomePage` and the modal's
  test. Mechanical and type-checked.
- **`PN491` lost its only raiser** and is now reserved-but-unraised. With one
  read there is no window in which a row exists for the probe and not for the
  load; zero rows means unclaimed, and the claim screen is where a vanished row
  gets its real answer (re-claim, or PN018). The registry entry stays, with its
  comment rewritten to say so; `doc.md`'s bullet about it is gone. **Joel has
  not ruled on deleting the entry** — it was point 1 of the two offered, and
  "do it" answered the merge, so the reversible half was taken.

Tests: fixtures carry the real columns, and two new cases pin the seed and the
clear (`useSession seeds the profile store`). Full suite 2613 green, `tsc -b`
and eslint clean.

### WORKED · F-session-2 · `probe-failure-lands-on-claim-screen` · A failed probe sends the player to pick a username under a fault modal, and the comment excusing it is no longer true

`useSession.ts:133–145`: when the profiles read comes back `not-ok`, the hook
sets `hasProfile = false`, so `needsClaim` is true and `App` renders
`<ClaimHandleScreen>`. The comment says this "is over-permissive and always has
been … the honest answer is 'we don't know', and there is no screen for it."
`readRows` has already put the fault modal up (`dbResult.ts:473`), so the
player sees "The read failed." over a screen asking them to claim a username
they may already own. The test at `useSession.test.ts:129` pins this behavior
and calls the error "transient", which nothing in the hook checks.

There IS a screen for it now: `EnvelopeErrorPage` in
`common/error-page/ErrorPage.tsx`, which takes an envelope and renders it as a
page. Five PlayAreas already use it for exactly this shape of failure —
`if (failure) return <EnvelopeErrorPage envelope={failure} />`
(`codenamesduet/components/PlayArea.tsx:579`, `crosswords` 1008, `stackdown`
597, `wordiply` 388, `wordwheel` 525).

**Recommendation.** The hook returns the failed envelope as a fourth state and
`App` renders `<EnvelopeErrorPage>` for it, ahead of the `needsClaim` gate. The
modal from `readRows` then doubles the page; pass `presentFaults: false` on
the probe so the page is the one presentation, which is what that option is
for ("I will show my own faults", `callSiteShape.test.ts:115`).

3. Agree the fourth state, or keep routing a failed probe to the claim screen?

**Resolution (2026-09-05, Joel: "do it").** The hook returns `probeFailed:
NotOkEnvelope | null` and `needsClaim` is false while it is set; `App` renders
`<EnvelopeErrorPage>` for it between the login gate and the claim gate, with a
**Try again** that calls `refresh()`. The probe passes `presentFaults: false`.
Two cases pin it: the failed read reports its own state, and a successful retry
clears it (which is also the first test `refresh()` has ever had).

**F-session-10 came with it.** Rewriting that test is what the finding asked
for, so the leftover `console.warn` spy is gone: the noise is the `[db] FAULT`
line, written even when the modal is opted out of, so the spy is
`console.error` and the run is quiet — which it was not before.

**A guard had to change, and it is a rule change worth a look.**
`callSiteShape.test.ts` → "a file that opts out of presenting shows something
itself" is file-level and textual, and `useSession` opts out while its
presentation lives in `App`. Added a fourth way to satisfy it — handing the
envelope up, detected as `NotOkEnvelope` in the file — with the reasoning in
its docstring: the modal-vs-page rule in `ErrorPage` says a failure that takes
the whole route is a PAGE, and a modal over that page repeats it. Verified by
planting: a file with a bare `presentFaults: false` and none of the four
markers still fails. **If Joel would rather not widen that guard, the
alternative is to drop the opt-out and let the modal sit over the error page**
— which is what the game page does today.

**Left for `game-page`:** `useCommonGame.ts:313–326` keeps the same
whole-page failure but does NOT opt out, so a failed game load shows the modal
AND `<EnvelopeErrorPage>`. Same doubling, one area over.

### WORKED · F-session-3 · `every-auth-event-reprobes` · `getUser()` and the profile probe run on every auth event, not only on sign-in

`useSession.ts:160–169` calls `probeProfile` for every event that carries a
session. `onAuthStateChange` fires `TOKEN_REFRESHED` on every hourly refresh
and `USER_UPDATED` on a user change, and each one re-runs the `getUser()`
round trip, re-reads the profiles row, and calls `setSession(next)` with a new
object — a whole-tree re-render of `App`. A refresh that succeeded has just
proved the user still exists in `auth.users`, so the `getUser()` check answers
a question the refresh already answered.

No effect in the tree keys on the session OBJECT (grep: nothing outside the
hook depends on `[session]`), so the cost today is two round trips an hour and
one re-render, not a bug. With F-session-1 merged, the re-probe would also
re-seed the store hourly.

**Recommendation.** Probe on `INITIAL_SESSION` and `SIGNED_IN`; on
`TOKEN_REFRESHED` and `USER_UPDATED` only `setSession(next)`.

4. Agree, or keep re-probing on every event?

**The recommendation was wrong, and re-verifying caught it.** An
`INITIAL_SESSION`/`SIGNED_IN` allowlist does not hold: auth-js's own docs, in
the installed copy (`GoTrueClient.js:3330–3331`), say of `SIGNED_IN` — "Avoid
making assumptions as to when this event is fired, this may occur even when the
user is already signed in … This event can fire very frequently depending on
the number of tabs open" — and `:4006` emits it when a session is recovered
from storage. An allowlist would still re-probe on tab focus, and would have to
track the library's event set forever.

**Resolution (2026-09-05, Joel: "do f3").** Keyed on WHO instead: a
`probedFor` ref holds the user id the probe answered for, and an event carrying
that same id only calls `setSession(next)` — the fresher token still reaches
every page, and `getUser()` and the profiles read are both skipped. A different
id (or none yet) probes. This is what the library tells callers to do, and it
covers TOKEN_REFRESHED, repeat SIGNED_INs, USER_UPDATED and multi-tab noise
under one rule. A failed probe records nobody, so the next event retries rather
than inheriting the failure. `refresh()` bypasses the check by construction —
it calls the probe directly — which is right: after a claim the user is the
same and the ROW is what changed.

Three cases pin it: the same user's later event re-reads nothing but still
lands the new session object; a different user re-probes; a failed probe is
retried by the next event.

**F-session-12 was NOT folded in** — point 3 was not ruled on, and "do f3"
named one finding. `probeProfile` still takes `mountedRef` as a parameter.

### WORKED · F-session-4 · `stale-23503-story` · The stale-JWT case is described as a 23503 at claim time; the RPC raises PN018 and the claim screen reads that

`useSession.ts:40–41` ("fail with 23503 on submit") and `docs/common.md:671`
("the claim RPC eventually raises 23503 at submit-time and `<ClaimHandleScreen>`
signs the user out") both tell a story the code no longer tells.
`common.claim_username` catches `foreign_key_violation` and raises **PN018**
with `hint = 'fault'` (`supabase/sql/common.sql:2444–2452`), and
`ClaimHandleScreen.tsx:141` signs out on `res.dbcode === 'PN018'`. 23503 is the
Postgres code the RPC swallows on the way.

Fix: the docstring says the claim screen signs out on the RPC's PN018;
`docs/common.md:671` says the same — a sentence about `useSession`, so a
forward fix here. Left for others: the reject-reasons table at
`docs/common.md:345` still lists 23503, and `ClaimHandleScreen.tsx:53` still
maps 23503 in its own docstring — both about the RPC and the screen, not these
files (Notes).

**Resolution (2026-09-05, Joel: "then do F4,F5,F6").** The docstring now says
what is true: a stale session that reaches the claim screen raises `PN018`, and
that screen signs the user out on it — the safety net under the `getUser()`
check, not the plan. `docs/common.md`'s `useSession` paragraph says the same,
and while it was being rewritten it also stopped saying "three resolved states"
and `{session, needsClaim, loading, refresh}`, both of which F-session-2 had
made wrong. The two mentions left for others still stand.

### WORKED · F-session-5 · `friends-alpha-posture` · Three comments justify a branch by "friends-alpha", which the project is not

`useSession.ts:76` ("same friends-alpha posture as the profile-probe error
below"), `useSession.ts:89` ("the permissive friends-alpha treatment"), and
`useSession.test.ts:130` ("same friends-alpha tradeoff"). CLAUDE.md: the
project left alpha weeks before 2026-08-29, and advice leaning on that
predates the change and is wrong. The BEHAVIOR each comment defends stands on
its own reason — a 5xx or a fetch failure says nothing about the user, and
signing everyone out on a Supabase hiccup would be worse than one wasted
render — so the fix is the sentence, not the branch. Write that reason.

(`useCommonGame.ts:573` carries the fourth; `game-page`'s, in Notes.)

**Resolution (2026-09-05).** Both comments in `useSession.ts` now give the
reason itself: a 5xx or a retryable fetch error says nothing about the user, so
keeping the stored session costs one wasted render that the next event
corrects, while being strict would sign everyone out whenever Supabase hiccups.
One copy of the phrase went with F-session-2's rewrite. **A fourth was missed
here and caught by F-session-9** — in the transient-getUser test, where the
word is split across two lines, so the grep this finding was written from could
not see it.

### WORKED · F-session-6 · `archaeology-in-prose` · Both files narrate how things used to work

CLAUDE.md: no archaeological comments; "how it used to work" is not useful.
The read found:

- `useSession.ts:21–26` — "replaces the old auto-derived-username trigger flow".
- `useSession.ts:39–42` — "the previous behavior was 'ask them to pick a
  username, fail with 23503 on submit'".
- `useSession.ts:94–100` — "This used to gate only on a clean 4xx STATUS …
  Inverting the default … closes that gap." The live fact worth keeping is
  one sentence: an expired token's failed refresh arrives as
  `AuthSessionMissingError` with no `status`, so transient is tested by NAME
  and status, not status alone.
- `useSession.ts:135` — "(flagged in the 2026-06-16 review)".
- `useSession.ts:146–149` — "the read no longer asks PostgREST for a single
  row".
- `useProfile.ts:22–23` — "lifted out of the component tree"; `:25–26` — "is
  now editable".
- `useProfile.ts:75–78` — "the read no longer asks PostgREST for a single row.
  `.single()` turned 'no profile' into a 406 …".
- `useProfile.ts:83` ("rather than sharing one"), `:91–93` ("the alternative
  is what this used to do").
- `useProfile.ts:120–121` — "Same signature as before — consumers are
  unchanged; they just get live updates for free now."

Two claims in the same prose are also wrong today: `useSession.ts:53` says
"RLS on profiles is public-read" — the policy is `for select to authenticated
using (true)` (`common.sql:282–283`), authenticated-read; and
`useProfile.ts:118` says the hook returns "(`username` + `color`)" — it
returns `can_edit_words` too. The `useSession` docstring is 37 lines, most of
it the history above; what it needs to say is the three states, what
`refresh()` is for, and the getUser-first rule.

Depends on F-session-1 to -3: whichever way those go, this prose is rewritten
once, after. **The `useProfile.ts` half is done** — F-session-1 rewrote that
file, so every line listed above for it is gone and the two wrong claims with
them (`doc.md` and `dbEnvelope.ts`'s PN491 comment were corrected in the same
change). What remains is `useSession.ts`: its 37-line docstring and the four
inline blocks.

**Resolution (2026-09-05).** Done, with the three shape findings settled first
as planned. The docstring now says the four states, what `refresh()` is for and
the getUser-first rule, and nothing else; the getUser
comment block shrank to a sentence and a pointer, because the docstring above
it is the copy that stays right. The one live fact inside the archaeology was
kept: an expired token's failed refresh arrives as `AuthSessionMissingError`
with no status, which is why transient is tested by NAME and status.

**An absence this turned up.** `docs/deferred.md` carried "Stricter
`useSession` profile-verify at startup" — that a failed profile read is
uniformly permissive and "the user is let through" — and pointed at a
`// Fragile:` comment in `useSession.ts` that no longer exists. F-session-2 is
what fixed the behavior it describes, so the item is struck. (The neighboring
`useCommonGame` item is `game-page`'s and still real.)

### WORKED · F-session-7 · `orphaned-set-profile-color-docstring` · `setProfileColor`'s docstring sits above `useCurrentProfile`

`useProfile.ts:131–136` documents "Reflect a just-saved color across every
consumer in the tab" and is immediately followed by a second `/** … */` for
`useCurrentProfile` (`:137–143`); `setProfileColor` at `:148` has none. The
orphaned-docstrings guard carries the allowlist row
`'src/common/session/useProfile.ts › useCurrentProfile'`
(`orphanedDocstrings.test.ts:67`). This is the second half of the `todo.md`
Bugs item, and it is true.

Fix: move the docstring onto `setProfileColor`; its row leaves the allowlist
as the mechanical consequence. While there: "every reader (and any other
reader)" says reader twice.

**Resolution (2026-09-05).** Fell out of F-session-1: `useCurrentProfile` was
deleted, so the docstring sits on `setProfileColor` with nothing between them,
and the allowlist row went in the same change (the guard fails from both sides
— a stale row is a failure). The doubled "reader" is gone too.

### WORKED · F-session-8 · `todo-silent-fetch-is-stale` · The `todo.md` Bugs item's first half — "a failed profile fetch is SILENT" — is no longer true

Re-derived as the item asked. Both failure paths in `ensureLoaded` present:
a `not-ok` read has already been logged and shown by `readRows`
(`useProfile.ts:69–73`, `dbResult.ts:473`), and a missing row reports a
`PN491` fault of its own (`useProfile.ts:97–110`, `dbEnvelope.ts:221`). Fix:
strike that half from `todo.md`; F-session-7 is the half that remains, and
leaves too when worked.

**Resolution (2026-09-05).** Both halves went with F-session-1 — the fetch it
described no longer exists, and F-session-7 was fixed — so the whole `todo.md`
Bugs item is struck.

### WORKED · F-session-9 · `test-prose-stale` · The test file's header and comments describe a hook that is not this one

- `useSession.test.ts:18` — "vi.mock replaces `../lib/supabase`"; the mock is
  of `'../supabase/supabase'` (`:37`), and the hook queries through
  `../supabase/db`, which is `supabase.schema('common')` (`db.ts:26`) — why
  the `schema:` mock works.
- `:13–14` — "The 'no profile' state used to force a signOut; it now …".
- `:47–49` — "`eq()` IS the terminal now".
- `:129` — the test named "transient profile-query error" pins a branch that
  does not distinguish transient from anything (F-session-2).
- `:205` — "(the strand regression)" names a bug report, not a behavior.

Fix with F-session-2 and -6: header says what is mocked and why the chain
collapses to `eq`; test names say the behavior.

**Resolution (2026-09-05, Joel: "then fix F9").** The header names the four
states and says what is mocked and why: the client module, with `schema`
mocked because the hook queries through `db = supabase.schema('common')`. The
strand-regression name is now "signs out on an auth error carrying no status at
all", and its comment states the shape rather than the check that used to miss
it. Two more the finding had not listed: the deleted-user test still told the
23503 story (now PN018), and the transient-getUser test still argued from
"friends-alpha" — **the one F-session-5 missed**, because the phrase is broken
across two lines there and a grep for it does not match. A sweep of the folder
for it, and for "used to / no longer / previously", now comes back empty.

### WORKED · F-session-10 · `warn-spy-silences-nothing` · The probe-error test spies `console.warn` "so the run is clean", and the run is not clean

`useSession.test.ts:135` — the `not-ok` branch it exercises has no
`console.warn` (`useSession.ts:133–145`). The noise on that path is the
`[db]` line `readRows` writes on `console.error`, and it prints — verified:

```
stderr | useSession.test.ts > treats a transient profile-query error as needsClaim
[db] 10:40:22.487 | FAULT | read | severity=fault | outcome= | dbcode=PN490 | …
```

The spy is left over from a hook that warned there. Fix: drop it; if the line
is unwanted in the run, spy `console.error`, which is the method the FAULT kind
maps to (`dbLog.ts:50–52`). The four getUser tests spy `warn` correctly — the
hook does warn on those paths (`useSession.ts:106`, `:115`, `:120`).

**Resolution (2026-09-05).** Done with F-session-2, which rewrote that test:
the spy is `console.error` and the run is quiet. The four getUser tests keep
their `warn` spies, which were right all along.

### WORKED · F-session-11 · `untested-paths` · `refresh()`, the null-user branch, and all of `useProfile.ts` have no test

- `refresh()` is the one export `ClaimHandleScreen` depends on
  (`App.tsx:102`), and no case calls it.
- `useSession.ts:116–127`, the 200-with-`user: null` branch, has no case.
- `useProfile.ts` has no test file. Untested: the load-once guard, the
  superseded-load return (`:62`), retry after a failed read (`loadedFor`
  cleared, `:71`), the missing-row fault (`:97`), and `setProfileColor`
  reaching two subscribers. `EditProfileModal.test.tsx:23` mocks the module
  away, so nothing exercises it.

Fix after F-session-1 settles the shape: `useProfile.test.ts` for the store,
two more cases in `useSession.test.ts`. If the store moves under `useSession`,
the store's cases go there instead.

**Smaller after F-session-1**, which deleted the load path and its four
untested branches, and added two cases pinning the seed and the clear. What is
still untested: `refresh()`, the 200-with-`user: null` branch, and
`setProfileColor` reaching two subscribers.

**Resolution (2026-09-05, Joel: "then do f11").** `useProfile.test.ts` is
written — the store gets its own file, as a unit should. Its four cases are one
value reaching two readers with no parent in common, the clear reaching them
both, a saved color repainting everywhere with the rest of the row intact, and
a color save with no profile to save it into. That last one is why
`setProfileColor`'s `if (current)` exists, and nothing had ever exercised it —
`EditProfileModal.test.tsx` mocks the whole module away.

`useSession.test.ts` gains the two branches: a 200 carrying no user signs out,
and `refresh()` flips `needsClaim` off when it finds the row a claim just
wrote. The second is the case `refresh()` exists for, and the first test of it
that is about a claim rather than a retry.

### WORKED · F-session-12 · `refresh-throwaway-mountedref` · `probeProfile` takes a mounted flag as a parameter so `refresh` can pass one that is never cleared

`useSession.ts:56` threads `mountedRef` through as an argument; the effect
builds the real one and `refresh` builds a throwaway `{ value: true }` that
nothing ever sets false, so a refresh resolving after unmount writes state
anyway. `App` never unmounts, so nothing is broken; the parameter exists only
to let one caller bypass the check. Fix: one `useRef` for the hook's life, read
inside `probeProfile`, no parameter.

**Resolution (2026-09-05, Joel: "ok").** One `mounted` ref for the hook's
life, beside `probedFor`; `probeProfile` reads it and takes no parameter, and
both callers now get the same guarantee. It is **raised in the effect body as
well as lowered in the cleanup**: lowering only in cleanup would mean a re-run
effect subscribes and then refuses to act on anything it hears — a guard that
becomes a trap. The effect's deps are stable `useCallback`s today, so this
never fires; it costs one line and removes the trap.

Not directly tested: `App` never unmounts, so there is no honest case to write
short of driving a slow probe across an unmount.

## Notes

- **Left for `game-page`:** `useCommonGame.ts:573` also argues from
  "friends-alpha" (F-session-5's fourth); and `useCommonGame.ts:313–326` shows
  a whole-page failure as BOTH a modal and an `<EnvelopeErrorPage>`, which is
  the doubling F-session-2 removed here.
- **Left for `simple-page`:** `ClaimHandleScreen.tsx:52–54` maps 23503 in its
  docstring; the RPC raises PN018 and the code at `:141` already reads PN018.
- **Left for whoever owns `docs/common.md`'s claim-flow section:** the
  reject-reasons table at `:345` lists 23503 for "auth.users row vanished";
  the RPC's code is PN018.
- **No auth console channel.** The hook's two `console.warn` lines
  (`useSession.ts:106`, `:115`) are bare; `logStamp.ts` names three stamped
  channels (`[db]`, `[rt]`, `[ui]`) and auth is none of them. Bare
  `console.warn`/`error` is the repo-wide shape outside those three (twelve
  sites in `src/common/`), so this is not a session finding; noted in case a
  later area decides the channels.
- `common.sql` is still unplaced in the areas table (carried from `supabase`).

## Predicted test breaks

- ~~`src/guards/orphanedDocstrings.test.ts`~~ — happened as predicted; the row
  went with F-session-7.
- ~~`src/common/session/useSession.test.ts`~~ — both halves happened: the
  fixtures and mock-chain comment (F-session-1), and the probe-error case
  (F-session-2). **Not predicted:** `src/guards/callSiteShape.test.ts`, whose
  opt-out rule F-session-2 had to widen.
- ~~`src/common/account/EditProfileModal.test.tsx`~~ — reached by F-session-1:
  the mock's row shape and the dropped `session` prop.
- `src/guards/folderDocs.test.ts` — `DESIGNS_OWED` loses its `common/session`
  row when the Design is written, at the close.

## Closing

- [x] the whole area re-read in one sitting after the last group (2026-09-05).
  Six things needed fixing and were fixed in that pass:
  - `useSession.ts` called `resolveSignedOut`'s call sites "the four states
    below" while the docstring above called something else "four resolved
    states" — two different fours, one page apart. Now "the four places that
    end in nobody being signed in".
  - `refresh()`'s comment still named only the claim screen; the error page's
    Try again is the second caller.
  - `doc.md`'s lede still said "the three states `App` gates on".
  - `doc.md` still carried one piece of archaeology of its own — an
    unclassified failure "once left people stranded" — now written as what it
    does.
  - `doc.md` said a wasted render is corrected by "a reload"; since
    F-session-3 it is the next auth event.
  - `doc.md`'s tests bullet knew only `useSession.test.ts`.
- [x] the folder's `doc.md` Design written; its row off `DESIGNS_OWED` (2026-09-05), and re-read against the code once every finding had landed
- [x] `todo.md` holds everything still owed — which is nothing; its one item was
  F-session-7 and -8, both worked
- [x] every file on the roster blessed — four files `cs-blessed-session`
  (2026-09-05, Joel: "bless files in this area and close it")

**Two decisions taken without a ruling, both flagged when they were made** —
either can be reversed and neither is load-bearing:

1. `PN491` keeps its registry entry with nothing raising it (F-session-1).
2. `callSiteShape`'s opt-out guard gained a fourth way to be satisfied
   (F-session-2).
