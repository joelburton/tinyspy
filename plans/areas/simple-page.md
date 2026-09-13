# Area: simple-page

The folders it reads: `auth` · `loading` · `error-page`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-12.** Roster stamped `cs-audited-simple-page`.
Thirteen findings recorded; F-1 to F-12 are worked. What remains: F-13's two
coverage items, and the one line inside an applied migration that is Joel's
call (F-3's last bullet).

## The roster

Agreed 2026-09-12 (Joel: "1. add 2. add — then stamp and audit").

- `src/common/auth/LoginScreen.tsx` + `.test.tsx`
- `src/common/auth/ClaimHandleScreen.tsx` + `.test.tsx` + `.module.css`
- `supabase/tests/common/claim_username_test.sql` — the claim RPC's pgTAP file;
  `account`'s roster left it here by name
- `e2e/auth.e2e.ts` — three specs on the auth gate; also handed here by `account`
- `src/common/loading/Loading.tsx` + `.module.css`
- `src/common/error-page/ErrorPage.tsx` + `.module.css` — exports `ErrorPage`
  and `EnvelopeErrorPage`

Plus each folder's `doc.md` and `todo.md` — no stamp, markdown. All three
`todo.md` files were empty at the opening; all three `doc.md` files hold a lede
and no Design, and all three folders are on `DESIGNS_OWED`.

**Evidence, not roster — read and judged, fixed in place, never stamped:**
`common.claim_username` in `supabase/sql/common.sql` (PN013–PN018 and the
`ok/claimed` answer), the `profiles.username` CHECK in
`20260615000000_common.sql`, `useSession` (the gate these screens sit behind),
and `App.tsx`'s gate order.

Consumers: `App` renders all four screens directly — `Loading` for the
pre-answer moment and as the PlayArea Suspense fallback, `LoginScreen` when
signed out, `EnvelopeErrorPage` when the profile probe failed, `ClaimHandleScreen`
when signed in with no profile row, and `ErrorPage` for an unknown gametype.
`ClubPage` renders `Loading` and `ErrorPage`; `GamePage` renders `Loading` and
`EnvelopeErrorPage`; `PlayAreaErrorBoundary` renders `ErrorPage` with a Reload
action; every game's `PlayArea` renders `EnvelopeErrorPage` off its `failure`.

Guards that name the roster: `noRawServerMessage` (an ALLOWED row for
`LoginScreen` — GoTrue's text is the design there, and the row stays),
`vocabularies` (a spacing row for `ClaimHandleScreen.module.css`, a font-size
row for `ErrorPage.module.css`), `folderDocs` (three `DESIGNS_OWED` rows),
`callSiteShape` (cites `EnvelopeErrorPage` as the fourth way to present).
`orphanedDocstrings` names none of these files — see F-1 for why that is not
evidence. Docs: `docs/common.md` → Username claim flow, → `claim_username`,
→ Auth & magic links; `docs/ui.md` → Dialog buttons, → The heading levels,
→ Components; `docs/mobile.md` → The `.card` shell pages; `docs/testing.md`
→ the e2e buckets.

Baseline at the opening: the area's three Vitest files and the seven guards that
name it are green (40 tests); `claim_username_test.sql` plans 20 and the count
matches its assertions.

## Findings

### F-simple-page-1 · `orphaned-docstrings` · both screens' docstrings sit on a constant

`LoginScreen.tsx` 14–50: the thirty-line `/** Magic-link sign-in flow … */` is
followed by a `//` comment and `const DEV_DEFAULT_EMAIL`; the component at 57
has nothing on it. `ClaimHandleScreen.tsx` 36–62: the `/** First-run setup gate
… */` block is followed by `// Mirror of the SQL CHECK …` and
`const HANDLE_REGEX`; the component at 102 has nothing on it. The guard looks
for two `/**` blocks stacked, so a docstring stranded above a `//` comment is
invisible to it — neither file is a KNOWN row, and both are orphans.

**Worked 2026-09-13.** Both essays are gone from above their constants and each
component carries a hover of its own; what they explained is now the folder's
Design (F-6).

### F-simple-page-2 · `marker-pass` · `/**` on props

- `ClaimHandleScreen`'s props block: `onClaimed` and `email` carry `/**`.
- `ErrorPage`'s props block: `message`, `diagnostics` and `action` carry `/**`.

A prop note takes `//` (docs/code-conventions.md → the props paragraph).

**Worked 2026-09-13.** Five props converted. `ClaimAnswer`, `Values` and
`RULES` keep `/**` — they are declarations a reader hovers, not props.

### F-simple-page-3 · `stale-claims` · sentences about code that no longer looks like that

- `ClaimHandleScreen.tsx` 47–56: "the RPC's P0001 raise" and the whole "Error
  mapping (the RPC's SQLSTATE codes → display)" block — P0001 shown as-is,
  23505 → "taken", 23503 → sign out, "anything else → raw message". The code
  reads envelopes: `res.field` lands PN017 on the username box, PN018 signs
  out, everything else lands on the form's line, and nothing raw is shown.
  The pickup note said this file was the last reader of a raw SQLSTATE; it is
  the last DESCRIBER of one — the code moved and the docstring stayed.
- `ClaimHandleScreen.tsx` 26–28, `onClaimed`: "renders HomePage instead of this
  screen" — `App` renders whatever the URL names once the gate flips.
- `e2e/auth.e2e.ts` 29–30: "ClaimHandleScreen by 'Pick a username'" — the
  heading is "Let's set you up", and the specs below match that.
- `claim_username_test.sql`: the header (17–19) lists "stale-JWT rejection"
  among what the file pins, and no assertion exercises PN018 (F-13). Section
  (1)'s comment says "RPC raises 42501" (PN013); section (2)'s heading says
  "bad inputs raise P0001" (PN014); section (4)'s comment says "a clean P0001"
  (PN016).
- `ErrorPage.module.css` 3–4 and 19–23: "Deliberately the same values as
  FaultModal.module.css", "they are FaultModal's, to the digit", "Both files
  sit on the guard's pending list and convert together at `simple-page`".
  `FaultModal.module.css` has converted — its diagnostics read
  `var(--font-size-3)` and its heading takes h3's base size — and it has no
  pending row; this file alone is still literal (F-12). The comment also names
  the area, which a durable file never does.
- `ErrorPage.tsx` 71–75: "wears the modal's look … See `FaultModal.module.css`,
  which this mirrors" — the mirror is off at both sizes (F-12).
- `ErrorPage.tsx` 29–33: "A hook keeping its own `{ text, diagnostics }` pair
  was the shape this replaced" — `ClubPage.tsx:140` holds exactly that pair and
  renders `<ErrorPage>` from it. The sentence is fixed here; the pair is
  club-page's decision (Notes).
- `docs/common.md` → Username claim flow: the reject-reasons table lists
  `42501` / `P0001` ×3 / `23505` / `23503`; every one is a PN code now
  (PN013–PN018), and the paragraph under it ("The 23503 case … `ClaimHandleScreen`
  catches that error") describes the old read. → Auth & magic links: "Username
  collision raises 23505". Not roster; fixed in place like `account` did with
  `common.sql`.
- `supabase/migrations/20260615000000_common.sql` line 88, a comment: "claim
  RPC surfaces 23505 to the FE as 'that username is taken'". An APPLIED
  migration. A comment edit changes no shape and `db push` skips the file
  either way, but the rule is "never edit an applied one" — listed, and Joel's
  call whether a comment counts.

**Worked 2026-09-13, except the migration.** `ClaimHandleScreen`'s error-mapping
block is gone (the envelope branching is commented at the branch, where it
happens); `onClaimed` says the URL decides what replaces this screen; the e2e
header names "Let's set you up"; the pgTAP header no longer claims a stale-JWT
assertion, and its three section comments say PN013 / PN014 / PN016 (the one
remaining SQLSTATE, at line 249, is accurate — the constraint really does raise
23505, and the sentence is about it being caught). `ErrorPage.module.css` and
`ErrorPage.tsx` were fixed with F-12. `docs/common.md`'s reject-reasons table is
PN013–PN018 with severities, the paragraph under it describes the code read, and
the "Username collision raises 23505" line names PN017. **The migration comment
at `20260615000000_common.sql:88` is untouched** — Joel's call.

### F-simple-page-4 · `archaeology` · dated quotes, "now", counts and befores in durable prose

- `Loading.tsx` docstring: "there was never more than one idea here: the app,
  the club page and the game page each said it in their own sentence
  ('Loading…', 'Loading club…', 'Loading game…') and each wrapped it in a
  `.card`"; "(Joel, 2026-08-23: *'they're not a card …'*)".
- `ErrorPage.tsx` docstring: "(Joel, 2026-08-23)" twice; "instead of at sixteen
  surfaces"; "the five it replaced had three different ones and one had none at
  all"; "what all five of these already were"; "one shape instead of five".
- `ClaimHandleScreen.tsx` 238–241: "Sits beside Accept now, styled as a real
  button." ~~163–171: `handleSignOut`'s comment narrates the stranding~~ —
  rewritten by F-7.
- `ClaimHandleScreen.test.tsx` 44–47: "Before the form held its values by name
  there was nowhere for that to go, and the message sat on a line at the bottom
  beside a color picker"; 84–88: "that's even truer now that Log out lives in a
  page menu"; 90–92: "This is the actual fix".
- `LoginScreen.test.tsx` 11–13: "It read the live field once, so editing the
  box after sending re-labeled the sentence".
- `claim_username_test.sql` 65–66: "(the trigger is gone — only the explicit
  RPC creates the profile now)"; `docs/common.md` 325: "There is no
  `handle_new_user` trigger anymore. The flow is now user-driven".

**Worked 2026-09-13.** Every dated quote, count and "now" listed above is gone
from the durable prose; both "no trigger anymore" sentences say what is true
rather than what changed. The arguments they carried — the no-box decision, the
modal-vs-page rule, why the form holds its values by name — are in the Designs
now, which is the place they keep being true.

### F-simple-page-5 · `docstrings-for-the-caller` · essays where a hover belongs, and two words

- `LoginScreen`'s docstring is the folder's design: the two verification
  paths, the redirect mechanics, the `otp_length` aside, "no password flow",
  the Mailpit hint. A caller needs: what it is, that it takes no props, that it
  unmounts itself through `useSession` on success. The rest is `auth/doc.md`'s
  Design (F-6).
- `ClaimHandleScreen`'s docstring is the same: the handle rules, the seeded
  color and why it does not track the field, the error mapping. The caller
  needs the two props and the `onClaimed` contract.
- `ErrorPage` / `EnvelopeErrorPage`: the modal-vs-page rule, the `.card` and
  `.pageMain` reasoning and the "same event in two containers" argument are the
  folder's Design. The docstrings say which to reach for — an envelope in hand
  → `EnvelopeErrorPage`; a hand-written line → `ErrorPage` — and what `action`
  is for.
- `Loading`: the no-box decision and the "not a held slot" distinction are
  Design; the docstring is one sentence.
- `LoginScreen.tsx` 24: "Length-agnostic copy stays correct" — the banned word;
  a message's words are its text.
- `LoginScreen.tsx` 83 and 104: `rpcError` — `supabase.auth` is not an RPC.
  `authError`.

**Worked 2026-09-13.** Four docstrings are now hovers: what the thing is, what
it takes, what it does on success, and a pointer to the Design. `rpcError` →
`authError` at both sites. The banned word left with the paragraph it sat in
(F-8 took the paragraph's subject; the digit-count reasoning is in auth's
Design).

### F-simple-page-6 · `designs` · three `doc.md` Designs owed

All three folders are on `DESIGNS_OWED`. Each `doc.md` needs a `## Design`
(`folderDocs` requires one per folder), and each lede re-read once the Design
exists. Expected shape: `auth` carries the weight — the gate order it sits
behind, magic link + code as two paths to one session, the claim as the second
half of signing in, the handle rules said once, the seeded color, the two
sign-outs (F-7), the two ways failures land (a field vs the form's line);
`error-page` — the modal-vs-page rule and the two entry points; `loading` — a
word and no box, versus a slot held open.

**Worked 2026-09-13.** All three Designs written to that shape and the three
`DESIGNS_OWED` rows deleted from `folderDocs`. `auth`'s carries the weight, as
expected: the gate order, one email with two uses, why there is no password
flow, the raw-GoTrue-message exception, the permanent handle, the seeded color
that does not follow the field, the two halves of the claim's refusals, and the
one exit both of them take.

### F-simple-page-7 · `two-sign-outs` · PN018 signs out without the escape's hard redirect — DONE

`ClaimHandleScreen.tsx` 148: on PN018, `await supabase.auth.signOut()` and
return. 172–182, `handleSignOut`: sign out, then `window.location.assign('/')`,
with a comment saying `signOut()`'s SIGNED_OUT event "doesn't reliably
re-render" on a stale session — which is exactly PN018's situation (the
`auth.users` row behind the JWT is gone). So either the comment is right and the
PN018 path strands the player it was written to rescue, or `useSession`'s
listener (`resolveSignedOut` on SIGNED_OUT) is enough and the hard redirect is
dead weight defended by a bug that no longer exists (`useSession` now verifies
with `getUser()` and the e2e proves an invalidated session lands on login before
this screen). The code cannot say which: the e2e clicks the button with the
redirect in place, and nothing exercises PN018 (F-13).

Options:

1. **One `signOutAndLeave()` both paths call, hard redirect kept** — the
   reversible branch; the two paths stop disagreeing today, and the redirect
   can be retired later with an e2e to prove it.
2. **PN018 gets its own redirect line** — same behavior, two copies.
3. **Drop the redirect on both and rely on the listener** — needs the e2e to
   prove it (ask before running), and is the change that can strand someone if
   the comment was right.

Ruled 1 (Joel, 2026-09-13: "do 1"). Done: `signOutAndLeave()` — sign out
best-effort, then `window.location.assign('/')` — is the one exit, called by
the button and by the PN018 branch. Its comment keeps the reason for the hard
redirect and drops the story (the F-4 item for the old `handleSignOut`
comment goes with it). `ClaimHandleScreen.test.tsx` gains the PN018 spec —
the FE half of F-13's first bullet — and its second `describe` now resets both
`vi.fn()`s between specs, which the new spec needed.

### F-simple-page-8 · `six-digits` · the placeholder names the digit count the docstring says we never name

`LoginScreen.tsx` 21–25: "We deliberately don't name the code's digit count in
the UI — the length is a Supabase setting … local config.toml has differed from
the deployed project before." Line 172: `placeholder="123456"`. `docs/common.md`
says "6-digit code" twice; local `config.toml` has `otp_length = 6`; prod's
setting is not checkable from here.

Options:

1. **Drop the placeholder** — the caption "Sign-in code" says what goes there;
   the docs go length-agnostic too ("a sign-in code").
2. **Keep `123456` and delete the paragraph** — six becomes the app's number,
   and prod's setting has to be confirmed to match.

Recommend 1.

**Worked 2026-09-13 — option 1.** `placeholder="123456"` is gone from the code
field; `docs/common.md`'s two "6-digit code" sentences now say "a numeric
sign-in code" and "the sign-in code". The docstring paragraph stays, and is now
true of the UI it describes.

### F-simple-page-9 · `sent-line-vanishes` · a wrong code erases "Sent a magic link … to X"

`LoginScreen.tsx` 132–143: the sent sentence shows only while `status ===
'sent'`. A failed verify (109–112) sets `status = 'error'`, so the sentence
reverts to "Enter your email and the code from your sign-in email" at the
moment the failure line says the code was wrong — the one fact the player
wants ("did it go to the right address?") disappears. `'error'` is read nowhere
else: `busy` is `sending | verifying`, and only `'sent'` is tested, so the
value exists to un-show that sentence.

Options:

1. **`sentTo !== ''` drives the sentence** — it is the fact a mail went out,
   which a wrong code does not undo; `'error'` leaves the union.
2. **Keep as is** — a wrong code means start over.

Recommend 1. No unit test walks the verify path today (F-13).

**Worked 2026-09-13 — option 1, plus a clause the write-up above missed.**
`sentTo` alone could not drive the sentence: `toggleAction` reset `status` to
`'idle'`, and that reset is what took the sentence away when the user toggled
back to the send form — where "…or enter the code below" points at a field that
isn't on screen. The gate is `showSent = sentTo !== '' && action ===
'verify-code'`, read by both the sentence and the dev Mailpit hint. `'sent'`
and `'error'` both left the union; failures set `'idle'`, and `status` is now
`'idle' | 'sending' | 'verifying'` — what `busy` reads and nothing else.
`LoginScreen.test.tsx` gains "still names the address after a wrong code",
verified by planting the old gate (red), which also settles F-13's
verify-code-path item.

### F-simple-page-10 · `dev-prefill` · the dev-only prefilled email is not a seed account — DONE

`LoginScreen.tsx` 50: `DEV_DEFAULT_EMAIL = import.meta.env.DEV ?
'joel@joelburton.com' : ''`. The dev personas `seed.dev.sql` creates are
`joel@test.local`, `moth@test.local`, `leah@test.local`. Mailpit catches mail
to either, but the prefilled address signs in a user the seed did not make — a
fresh `auth.users` row, the claim screen, no clubs — unless it was claimed by
hand once and survives resets.

Options:

1. **`joel@test.local`** — the persona the seed builds and the docs describe.
2. **Keep the real address** — Joel's workflow; nothing to change.
3. **Drop the prefill** — the field starts blank in dev too.

Ruled 1 (Joel, 2026-09-13: "yes, it should change to joel@test.local"). Done:
`DEV_DEFAULT_EMAIL` is `joel@test.local` in dev.

### F-simple-page-11 · `redrawn-action-row` · the claim screen redraws the shared dialog row

`ClaimHandleScreen.module.css` `.buttonRow`: `flex-end`, `0.75rem` gap,
`0.5rem` above, a `6rem` floor on every button — the row
`modalActions.module.css` draws for every dialog (docs/ui.md → Dialog buttons:
"One shared rule draws the row"). Its two literals are the file's whole
`vocabularies` row, and the shared rule already reads `--spacer-3` and
`--spacer-1`.

Options:

1. **Import `actionRow.modalActions`** — one rule; the stylesheet goes and the
   `vocabularies` row with it. The class is named for modals and the shared
   file's comment says "modal / dialog"; the claim form is a page.
2. **Keep the local rule, convert its values to the same tokens** — the row
   matches by token; the file stays, the `vocabularies` row goes.
3. **Rename the shared class to a surface-neutral name and use it here** —
   touches floating-panels' blessed file.

Recommend 1.

**Worked 2026-09-13 — option 2 (Joel).** The rule stays local and its two
literals become `--spacer-3` and `--spacer-4`; the `vocabularies` row is gone
(planted a literal back to confirm the guard now watches the file). What option
1 would have changed and 2 does not: the shared row's `margin-top` is
`--spacer-1` = 1.5rem against this row's 0.5rem, so importing it would have
dropped the buttons ~16px further down the claim screen. The file's comment now
says why it sits tighter. The two-places-draw-this-row merge is still there to
make, and is `floating-panels`' to make when the class stops being named for
modals.

### F-simple-page-12 · `twin-drift` · ErrorPage's two sizes no longer match the modal they mirror

`ErrorPage.module.css`: `.heading` at `1.1rem` (an `<h1>` forced under h1's
`1.5rem`), `.diagnostics` at `0.78rem`. `FaultModal.module.css`: an `<h3>` at
base's `1.15rem`, diagnostics at `var(--font-size-3)` = `0.75rem`. The two
files' comments both say the values are the same. docs/ui.md → The heading
levels says h1 is "every error screen" at `1.5rem`, which this page overrides on
purpose.

Options:

1. **Finish the twin** — diagnostics → `var(--font-size-3)`; heading →
   `1.15rem` with a comment saying it is the modal's title size on an `<h1>`.
   One literal stays, so a one-value `vocabularies` row stays with it.
2. **Let the page be a page** — drop the heading override, the `<h1>` takes
   h1's `1.5rem` as ui.md's table already says; diagnostics →
   `var(--font-size-3)`. The docstring's "wears the modal's look" narrows to
   the color, the weight and the three lines. The `vocabularies` row goes.
3. **Keep both literals** — and fix the comments to say they differ.

Recommend 2: the CSS comment's own argument for the override is that a
`1.5rem` "Error" reads as shouting, and it is the one page in the app whose
title the heading table names.

**Worked 2026-09-13 — option 2 (Joel).** The heading override is gone, so the
`<h1>` takes h1's `1.5rem` — "Error" goes from 17.6px to 24px on every fault
page (the boundary's crash page, an unknown gametype, a club or game that
failed to load). Diagnostics → `--font-size-3`. The `vocabularies` row is gone
(planted a literal back to confirm the file is watched). The file's header no
longer claims the modal's values: what the two share is the shape — the red
word, the sentence, the small line beneath — and each title is sized where its
own heading level is decided. `ErrorPage.tsx`'s docstring already named only
those three things, so it needed no change. NOT looked at in a browser: no
screenshot was taken of the larger heading.

### F-simple-page-13 · `coverage` · what no test pins

- **PN018**: not in the pgTAP file (whose header claims it), ~~not in the FE
  test~~ (F-7 added the spec: PN018 → `signOut`, then the redirect), not in
  the e2e (the gate catches a stale session before the RPC). The pgTAP half
  remains.
- **The claim's happy path**: nothing asserts `onClaimed` is called on
  `ok/claimed`; nothing walks the `reportUnhandled` fall-through.
- ~~**LoginScreen's verify-code path**~~: F-9 added "still names the address
  after a wrong code", which types a code and fails the verify.

## Notes

- **`Loading` paints the muted color without `.muted`.** The utility also sets
  `font-size: 0.9rem`; `Loading.module.css` sets only the color. A question for
  the prose pass: deliberate (a word on the page at body size) or an accident of
  the extraction? Its docstring does not say.
- **`ClubPage` still holds `{ text, diagnostics }`** and renders `<ErrorPage>`
  from it — the shape `EnvelopeErrorPage`'s docstring says was replaced. Whether
  the club hook keeps its envelope is club-page's decision with its files open;
  a line for `src/common/club/todo.md` when F-3 is worked.
- **`errors.chosen_color` is a slot the server never fills.** PN015 says
  `column = '_'`, so `ColorChoiceField`'s `error` prop on the claim screen can
  only ever be `undefined`. Same on `EditProfileModal` (account's). Not a bug;
  recorded so the prop is not read as evidence of a path.
- **`useTabRing({ within })` on a page.** `useTabRing`'s docstring says a page
  lists its stops and a floating panel says `within`; both screens say `within`
  because the form is the whole page and there is no chrome to keep out.
  `StandardForm`'s own comment names `LoginScreen` as that case. Consistent;
  no finding.
- **`LoginScreen` has no `<h1>`.** The wordmark stands in for the title, as
  `PuzpuzpuzWordmark`'s docstring says; `HomePage` has both. Left as is.
- **`plan(20)` in the pgTAP file** was counted against its assertions at the
  opening and matches.

## Predicted test breaks

- F-11 and F-12: `src/guards/vocabularies.test.ts` — a pending row whose file
  stops carrying the literal fails from the other side; the row goes with the
  finding.
- F-6: `src/guards/folderDocs.test.ts` — three `DESIGNS_OWED` rows come off as
  each Design lands.
- F-9: `LoginScreen.test.tsx` gains a spec; none of its three break.
- F-3: `claim_username_test.sql` — comments only; the plan count does not move
  unless F-13 adds the PN018 assertion (then `plan(21)`).

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
