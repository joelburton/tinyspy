# Area: session

The folders it reads: `session`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN and AUDITED 2026-09-05** — twelve findings, none worked yet.
Three files `cs-audited-session`.

## The roster

Agreed 2026-09-05 (Joel: "1,2,3. you can read these areas for research, but
the findings & changes should be about src/common/session. go ahead and stamp
the files and audit.") — every file of `src/common/session/`:

| file | what it is | stamp |
|---|---|---|
| `src/common/session/useSession.ts` | the auth-state hook `App` gates on: `session`, `needsClaim`, `loading`, `refresh` | `cs-audited-session` |
| `src/common/session/useSession.test.ts` | its contract, nine cases | `cs-audited-session` |
| `src/common/session/useProfile.ts` | the `Profile` type, the module-level profile store, `useProfile`, `useCurrentProfile`, `setProfileColor`. No test file | `cs-audited-session` |
| `src/common/session/doc.md` | lede only at the open ("Who is signed in, and their profile."), no Design. **Lede rewritten and Design written 2026-09-05** (Joel: "write the doc in the area"), before any finding was worked, so it describes today's two hooks and two reads; its row is off `DESIGNS_OWED`. Re-read it when F-session-1 to -3 settle | (no stamp — markdown) |
| `src/common/session/todo.md` | one item under Bugs, handed in from an earlier read; re-derived below as F-session-7 and F-session-8 | (no stamp — markdown) |

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

### F-session-1 · `one-row-read-twice-two-hooks` · The profile row is read twice at boot, by two hooks whose names do not say how they differ

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

### F-session-2 · `probe-failure-lands-on-claim-screen` · A failed probe sends the player to pick a username under a fault modal, and the comment excusing it is no longer true

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

### F-session-3 · `every-auth-event-reprobes` · `getUser()` and the profile probe run on every auth event, not only on sign-in

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

### F-session-4 · `stale-23503-story` · The stale-JWT case is described as a 23503 at claim time; the RPC raises PN018 and the claim screen reads that

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

### F-session-5 · `friends-alpha-posture` · Three comments justify a branch by "friends-alpha", which the project is not

`useSession.ts:76` ("same friends-alpha posture as the profile-probe error
below"), `useSession.ts:89` ("the permissive friends-alpha treatment"), and
`useSession.test.ts:130` ("same friends-alpha tradeoff"). CLAUDE.md: the
project left alpha weeks before 2026-08-29, and advice leaning on that
predates the change and is wrong. The BEHAVIOR each comment defends stands on
its own reason — a 5xx or a fetch failure says nothing about the user, and
signing everyone out on a Supabase hiccup would be worse than one wasted
render — so the fix is the sentence, not the branch. Write that reason.

(`useCommonGame.ts:573` carries the fourth; `game-page`'s, in Notes.)

### F-session-6 · `archaeology-in-prose` · Both files narrate how things used to work

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
once, after.

### F-session-7 · `orphaned-set-profile-color-docstring` · `setProfileColor`'s docstring sits above `useCurrentProfile`

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

### F-session-8 · `todo-silent-fetch-is-stale` · The `todo.md` Bugs item's first half — "a failed profile fetch is SILENT" — is no longer true

Re-derived as the item asked. Both failure paths in `ensureLoaded` present:
a `not-ok` read has already been logged and shown by `readRows`
(`useProfile.ts:69–73`, `dbResult.ts:473`), and a missing row reports a
`PN491` fault of its own (`useProfile.ts:97–110`, `dbEnvelope.ts:221`). Fix:
strike that half from `todo.md`; F-session-7 is the half that remains, and
leaves too when worked.

### F-session-9 · `test-prose-stale` · The test file's header and comments describe a hook that is not this one

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

### F-session-10 · `warn-spy-silences-nothing` · The probe-error test spies `console.warn` "so the run is clean", and the run is not clean

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

### F-session-11 · `untested-paths` · `refresh()`, the null-user branch, and all of `useProfile.ts` have no test

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

### F-session-12 · `refresh-throwaway-mountedref` · `probeProfile` takes a mounted flag as a parameter so `refresh` can pass one that is never cleared

`useSession.ts:56` threads `mountedRef` through as an argument; the effect
builds the real one (`:158`) and `refresh` builds a throwaway `{ value: true }`
(`:180`) that nothing ever sets false, so a refresh resolving after unmount
writes state anyway. `App` never unmounts, so nothing is broken; the parameter
exists only to let one caller bypass the check. Fix: one `useRef` for the
hook's life, read inside `probeProfile`, no parameter. Folds into F-session-1
or -3 if either rewrites the hook.

## Notes

- **Left for `game-page`:** `useCommonGame.ts:573` also argues from
  "friends-alpha" (F-session-5's fourth).
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

- `src/guards/orphanedDocstrings.test.ts` — its allowlist row for
  `useCurrentProfile` goes stale the moment F-session-7 is worked; the row is
  removed in the same change.
- `src/common/session/useSession.test.ts` — F-session-2 changes the pinned
  behavior of the probe-error case; F-session-1 and -3 change what the mocked
  chain must return.
- `src/common/account/EditProfileModal.test.tsx` — mocks
  `'../session/useProfile'` by path and export name; a rename or a signature
  change under F-session-1 reaches it.
- `src/guards/folderDocs.test.ts` — `DESIGNS_OWED` loses its `common/session`
  row when the Design is written, at the close.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [x] the folder's `doc.md` Design written; its row off `DESIGNS_OWED` (2026-09-05; re-read once the shape findings land)
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
