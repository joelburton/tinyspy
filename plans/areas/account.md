# Area: account

The folders it reads: `account`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-12 — all fifteen findings worked, the area re-read in
one sitting, and eight files `cs-blessed-account` on Joel's word.**

## The roster

Agreed 2026-09-12 (Joel: "stamp and do the audit").

- `src/common/account/EditProfileModal.tsx` + `.test.tsx`
- `src/common/account/editProfileStore.ts`
- `src/common/account/useAccountMenuSection.ts` + `.test.ts` — the test file is
  the hook's FIRST, written 2026-09-12 with F-10
- ~~`src/common/account/ColorChoiceList.tsx` + `.module.css`~~ — folded into
  `fields/ColorChoiceField` by F-12 and no longer this folder's
- `supabase/tests/common/update_profile_color_test.sql`
- `supabase/tests/common/profiles_theme_test.sql` — written 2026-09-12 by F-14,
  which split the reserved column's pins out of the file above

Plus `doc.md` and `todo.md` — no stamp, markdown. `doc.md` now carries its
Design (F-6) and is off `INTROS_OWED`; `todo.md` is empty, both its items
having been worked (the hook's archaeology by F-3, the chosen swatch's ring by
F-9).

**Evidence, not roster — read and judged, findings recorded, fixed in place,
never stamped:** `supabase/sql/common.sql`'s `update_profile_color` RPC and
the `profiles_select_authenticated` policy, and `common.profiles` in the
baseline migration (`20260615000000_common.sql`). `claim_username` is the
claim screen's and stays with `auth`.

No e2e exercises profile editing; the claim-handle e2e touches the color list
through the claim screen and is `auth`'s.

Consumers: `App` mounts the modal off the store's flag and reads
`useIsEditProfileOpen`; `HomePage`, `ClubPage` and `GamePage` each take the
account section and place it last in their menu (`GamePage.test` mocks the
hook); `session/useProfile` is the profile store the modal writes back to. At
the audit the picker was this folder's and `fields/ColorField` wrapped it;
F-12 folded the two together into `fields/ColorChoiceField`, so the picker and
its stylesheet are forms' now.

Guards that named the folder at the audit — `orphanedDocstrings` (one KNOWN row
for the modal), `vocabularies` (two rows for the stylesheet), `folderDocs` (the
owed Design) — name it in none of those places now; each row went with the
finding that earned it. Docs: `docs/ui.md` → the account submenu,
`<EditProfileModal>`, `<ColorChoiceField>`, and the focus-ring section's "not a
selected state" paragraph; `docs/common.md` → the `profiles` row of the schema
table; `docs/code-conventions.md` → the predicate-hook sentence, which lost
this folder's holdout.

## Findings

### F-account-1 · `orphaned-docstring` · the modal's docstring sits on `Values` — DONE

`EditProfileModal.tsx` lines 25–49: the fourteen-line `/** The "Edit profile"
popup … */` block is followed by `/** What the form holds … */ type Values`,
then `type ColorAnswer`, then `export function EditProfileModal` with nothing
on it. `orphanedDocstrings.test.ts` carries it as a KNOWN row, owned by this
area. Fix: the two types and their docstrings move above; the component's
docstring sits on the function, rewritten for the caller (F-4 says what in it
is stale); the KNOWN row goes.

### F-account-2 · `marker-pass` · `/**` on props, and a JSDoc tag — DONE

- `EditProfileModal`'s props block: `onSaved` and `onCancel` carry `/**`; a
  prop note takes `//`.
- `ColorChoiceList`'s props block: `value` and `onChange` carry `/**`.
- `useAccountMenuSection`'s docstring ends in `@returns …` — the only JSDoc tag
  in `src/`. The sentence it carries ("one `MenuSection` holding one submenu
  row; spread it at the END of a page's `sections`") is the caller's, and
  belongs in the docstring's own prose.

### F-account-3 · `archaeology` · a finding code, three "used to"s, and a doc that narrates its own history — DONE

- `EditProfileModal.tsx` line 87–89: "Before this, the height was a fixed
  pixel count nobody derived (F23 → C)." A finding code and a before.
- ~~`EditProfileModal.tsx` line 93–96: "which is what the dialog used to spell as
  `picked ?? profile?.color ?? null` plus a Save disabled on the null."~~ Done
  with F-11, which rewrote that same comment.
- `editProfileStore.ts`'s docstring: "the thing that OPENS it is now a menu
  item on three different pages … since the fixed top-right UserMenu it used to
  live in was costing the game header 2rem of reserved width." The UserMenu is
  gone; the docstring argues against it.
- `useAccountMenuSection.ts`'s docstring: "a fixed chip would cost the header
  permanently reserved width" — the same past shape. This is the `todo.md`
  Soon item, re-derived: the archaeology is one paragraph of four, and the
  other three are design (F-5).
- `docs/ui.md` → the account submenu: the sub-bullets "It used to be a
  `<UserMenu>` …" and "HomePage gained a header for this … A first version put
  it inside …" narrate how the menu came to be. The doc describes now: the row
  is the last section of every page's menu, labeled with the username, and
  that is the whole of it.
- `update_profile_color_test.sql` line 59: "Nothing reads or writes it yet
  (2026-08-03)" — a dated claim about now. `docs/common.md`'s `profiles` row
  carries the same date on the `theme` column.
- `supabase/sql/common.sql`, the `profiles_select_authenticated` comment:
  "(Reviewed 2026-08-02: still nothing sensitive here.)" Evidence file; fixed
  in place with the rest.

### F-account-4 · `stale-claims` · sentences about code that no longer looks like that — DONE

- `EditProfileModal`'s docstring: "launched from the user menu" — there is no
  user menu; it opens from the account submenu of whichever page menu is up.
  "A `FloatingPanel` (not a route)" — it is a `<NormalModal>`, and the family
  word is what the floating-panels area made the claim. The second paragraph
  describes the picker ("a swatch picker over the 8-entry palette, each
  rendered as its actual color circle + name") — that is `ColorChoiceList`'s
  own docstring, copied. "optimistically updates the shared profile store" —
  `setProfileColor` runs after the RPC's `ok`, so nothing is optimistic; the
  store is told what the server already holds. `useProfile.ts`'s
  `setProfileColor` docstring (blessed, session) says "the optimistic in-memory
  update" too; fixed in the same pass.
- `docs/ui.md` → `<EditProfileModal>`: "a `<FloatingPanel>` (not a route)";
  "Saves via `common.update_profile_color`, then `setProfileColor` updates the
  shared profile store" is right. The account-submenu bullet says the row
  opens "Profile and Log out" — it also opens "Add word", for editors.
- `ColorChoiceList.tsx`'s docstring: "`colorVarFor` owns each shade" — the
  file never calls it; `<Dot>` resolves the color, and the list only names it.
- `ColorChoiceList.module.css`, the `.swatchActive` comment: "it belongs to
  the account pass" — a durable file citing the audit. The question it raises
  is `todo.md`'s Someday item and F-9; the comment keeps one sentence saying
  what the ring MEANS here, and nothing about who will decide it.
- `update_profile_color_test.sql`'s header: "See
  ../codenamesduet/create_game_test.sql for the pgTAP primer" — the primer is
  `docs/testing.md` → Common pgTAP setup; a test file is not a doc.
- `editProfileStore.ts`: "Same tiny pub-sub shape as `chatOpenStore` and the
  profile store — minus the localStorage mirror" — true, and the reason given
  ("was I editing my profile" is not worth restoring) is right; keeps.

### F-account-5 · `rationale-in-docstring` · the hook and the store explain their design where a caller wanted their use — DONE

- `useAccountMenuSection`'s docstring is four paragraphs: what it is (keeps),
  why it is inside the page's menu, why the row is the dot + username, why a
  submenu and not a flat section. The last three are the design and they are
  right; their home is `doc.md`'s Design.
- `editProfileStore`'s docstring: why the dialog is mounted at the App level
  and why the opener is elsewhere. Design; `doc.md`. The docstring keeps who
  writes, who reads, and that nothing persists.
- `ColorChoiceList.module.css`'s seven-line `⚠️` block on `.swatchActive`
  argues why the ring does not read `--chrome-cursor-ring`. One sentence on
  the rule and the decision in `todo.md` (F-9).
- `EditProfileModal.tsx` line 72–75, the unhandled arm's comment, is right
  where it is: it defends the `setBusy(false)` on that line.

### F-account-6 · `doc-md` · the lede lists action ids and the Design is owed — DONE

`doc.md` is "Your own menu and profile editing — the modal, the color list,
and the store behind them. The menu's submenu binds `act-edit-profile`,
`act-add-word` and `act-log-out`." The second sentence is a symbol list, not a
lede. The Design is owed (`INTROS_OWED`). Written in the prose pass from the
answers: what your account IS here (a username you cannot change, a color you
can, and an editor flag granted by hand); the one row on every page's menu and
why it is a submenu labeled with your name; the modal at the root and the
store as the seam between it and its three openers; the color list as the claim
screen's too, through `ColorField`; the RPC as the profile's single write path
and the profile store repainting every reader from the answer; what a chosen
swatch looks like and why it is not the cursor.

### F-account-7 · `hook-name-predicate` · `useEditProfileOpen` answers yes/no — DONE

`docs/code-conventions.md` → A hook that answers yes/no names itself as a
predicate lists it by name as one of two holdouts, "to convert as each folder
is next worked on". This folder is being worked on: `useIsEditProfileOpen`,
one reader (`App.tsx`), and the sentence loses it (down to
`useInfoSheetOpen`). No decision — waiting to be done.

### F-account-8 · `vocabulary` · the stylesheet has two exempt rows in the guard — DONE

**Done 2026-09-12**, folded into F-9's rewrite of the same declarations. Both
rows are off `vocabularies.test.ts`.


`ColorChoiceList.module.css` is in `vocabularies.test.ts` twice: spacing
`0.5rem` (the grid gap and the swatch's gap → `--spacer-4`) and border `1px`
(→ `--border-width-line`). The swatch's `padding: 0.4rem 0.6rem` is parked by
the guard's own decision (padding is off the ramp for now) and left. The
`.dot` overrides (`--dot-size: 1.1rem`, `--dot-border-width: 2px`) are the
Dot's own knobs and the comment says why they are set. The `2px` outline is
the ring, which is F-9's. Two rows off the guard once converted; no decision
in the two.

### F-account-9 · `selected-ring` · the chosen swatch wears the keyboard cursor's ring — DONE

**Decided and done 2026-09-12** (Joel: the picker *"should act more like the
rest of our chrome (like for buttons) — it highlights when hovered over (rather
than a ring), and it should get a black ring to show that it is selected"*, and
*"they're actually buttons, so treat it just like we do our standard
buttons"*).

A swatch is a `<button>`, so it wears a quiet button's states: quiet's hover
wash, quiet's press wash, and no transition — a standard button paints its wash
instantly. It is NOT a `<StandardButton>` and cannot be: that component's glyph
slot is typed to a Lucide svg and sized by `.standardButton > svg`, and the
swatch's glyph is a `<Dot>`, a styled span. So it reads the `--button-quiet-
secondary-*` tokens directly, the way `<PageHeaderButton>` does — and joins the
list of deliberately-not-standard kinds that `StandardButton.module.css`'s
header keeps.

The chosen swatch's border goes to `--page-text-color`, at the width the
resting border already reserves, so choosing moves nothing. A dark neutral
rather than the accent blue, which is the call `<CurrentGameCard>`'s callout
already makes for the same reason.

The resting edge stays `--field-edge-color` rather than quiet's own outline
gray (Joel picked it): the picker is a field, and the light gray is what makes
the jump to ink read as chosen at all — quiet's gray is about 0.115 lightness
off body ink and the change would be invisible.

The swatch gained its own `:focus-visible` ring, `--chrome-cursor-ring` at
`-1px`. Not tidying: with the outline gone the button fell back to the
browser's default ring, which is also dark and would read as the chosen mark.

Both `⚠️` essays are gone — the seven lines here and the paragraph in
`core-css/patterns/focus-ring.css` — because no file paints a ring by hand any
more. `docs/ui.md`'s "not a selected state" paragraph and the
`<ColorChoiceList>` bullet say what the swatch does now, and `todo.md`'s
Someday item is off.

<details><summary>the finding as audited</summary>

`todo.md`'s Someday item, and the one design question in the folder.
`.swatchActive` draws `outline: 2px solid var(--chrome-cursor-color)` with the
border in the same color — the exact paint of `--chrome-cursor-ring`, by hand
so the two "can part company" (the stylesheet's own words, and ui.md's focus
section says the same). So today a chosen swatch looks like the keyboard is
pointing at it, in a list the keyboard does not walk (the swatches are plain
buttons, so Tab moves between them and the real focus ring appears on top).
ui.md's Selection lists rule says this list is NOT one — the lasting-mark kind
was deleted 2026-09-11 with no caller — so the shape is this folder's to
decide. Present with the real CSS: (1) a ring of its own, same geometry, from a
token that means chosen; (2) no ring — the chosen swatch's border thickens or
takes the swatch's own color, the way a pressed header mark takes a border;
(3) leave the paint and delete the essay. The `aria-pressed` the button
already sets is the state hook whichever wins.

</details>

### F-account-10 · `log-out-failure-unsurfaced` · a failed sign-out is a console line — DONE

**Decided and done 2026-09-12** (Joel: *"an unexpected error happened. that's a
fault"*). It goes through `reportDbFault` like every other fault in the app —
build the envelope, hand it the transport facts, and the one path writes the
`[db]` line and raises the modal from a single builder. The first attempt
reached past it to `showFaultModal` on the reasoning that the auth client hands
back no envelope; that was the mistake, since nothing stops a call site from
BUILDING one.

Re-verifying the finding turned up the fact that settles it, and it is worse
than a console line. `@supabase/auth-js@2.108.1`, `GoTrueClient._signOut`:
when the revoke call errors it returns BEFORE `_removeSession()`, so the local
session is never cleared, no `SIGNED_OUT` event fires, `useSession` never
re-renders, and you are still signed in looking at the same page. (404/401/403
and session-missing are swallowed on purpose and DO proceed to clear, returning
`error: null` — so the error arm really does mean "still signed in.") Today's
behavior was a silent no-op, not merely an unreported one.

**It gets a code — `PN492`** (Joel: *"errors get dbcodes — consider how we even
made ones for environmental errors"*). A not-ok always carries one, and the
`FE` four exist precisely because even a failure with no server in it is worth
telling apart from the next one. The next free number came from running
`raiseCodes.test.ts`, which prints it; a remembered number was three behind.

`PN`, not `FE`: the letter says what a code does to `type` and never who
authored the failure, and the `FE` four are specifically *our server did not
answer*. So `dbEnvelope.ts` gains a third small table,
`AUTH_FAILURE_TO_CODE_AND_TEXT`, beside the two it already keeps — for the auth
calls a SIGNED-IN player makes, which is the half of `/auth/v1/` the login
screen does not speak for. One code per CONDITION, not per cause: a logout that
never reached the service and one the service refused leave you in the same
place, and a blank `status=` on the `[db]` line already separates the two
investigations.

`environmentalEnvelope` builds it, since the shape is exactly what that
function is — a `{ code, text }` off a table for the player, the opaque string
in `detail`. Its docstring widened by a sentence to name the second table.
`dbFetch` exports `getTextualOnlineStatus` for the transport half of the
detail: an auth call reaches no wrapper, so the call site is its own transport
layer and builds its own `TransportFacts`. `reportDbFault` then joins the two
details the way it does for every other fault.

**A failed logout writes two `[db]` lines, and that is right** (Joel: *"it's
fine that it logs twice; each has different information"*). `dbFetch` narrates
the transport for `/auth/v1/` because no wrapper will, and this call site
narrates the meaning — the call, the code, and the sentence.

`useAccountMenuSection.test.ts` is the hook's first test file, six cases over
the Log out action: silent on success, the fault on failure, the code + call +
status on the line, both halves of the detail, the same code with a blank
`status=` when nothing answered, and GoTrue's own words never reaching the
player. Plant-verified three ways — swallowing the failure fails five of the
six, dropping the device facts fails the detail one alone, and a wrong code
with the raw string as the sentence fails five.

One guard change, and a structural one rather than an allowlist entry:
`noRawServerMessage.test.ts` now exempts a line near `environmentalEnvelope(`,
alongside `failureText(`. The player's sentence comes from the `{ code, text }`
that function takes FIRST, so `detail` is the only slot a raw string can reach
— the exemption cannot hide a message on its way to a player. Plant-verified:
an ordinary `.message` read in the same file still fails the guard.

<details><summary>the finding as audited</summary>

`useAccountMenuSection.ts` line 51–55: `supabase.auth.signOut().then(({ error })
=> { if (error) console.error('sign out failed', error) })`. The player picks
"Log out", nothing happens, and the only trace is in devtools. The envelope
rules are for RPCs and edge functions; the auth client answers differently,
and this is the one call in the folder that is not an RPC. The other four
`signOut` calls (`useSession` ×2, `ClaimHandleScreen` ×2) are on failure paths
that already know they are failing. Options when presented: (1) the fault
modal, through the same reporter the RPC wrappers use, with a sentence of its
own; (2) leave the line, and say in the comment that it is a decision.

</details>

### F-account-11 · `unreachable-null-branches` · three defaults that cannot fire — DONE

**Decided and done 2026-09-12**: option 2, the branches stay and the comments
tell the truth. `Profile | null` forces them, so the honest sentence is that
the null is the signed-out state the login screen's readers see and the gates
put it out of reach here — not that a loading moment is being covered. A
`useProfileOrThrow` would coin a shape the repo has nowhere else, in a blessed
folder, and trade a harmless wrong string for a throw on a path we only believe
is unreachable.

Re-verified before presenting: `useSession.ts:154` is `setProfile(row)` then
`setLoading(false)`, its own comment saying why, and `App.tsx:100` returns
`<Loading />` while loading. A null row means unclaimed, which routes to the
claim screen rather than to a page with a menu.

The comment says "the gates make this unreachable" rather than "impossible",
deliberately. `resolveSignedOut` calls `setProfile(null)` beside
`setSession(null)`; the menu unmounts instead of rendering nameless because
React commits the store notification with the state update — an argument from
batching, not from a gate, and not one a comment should lean on.

The modal's comment also carried F-3's archaeology ("which is what the dialog
used to spell as `picked ?? profile?.color ?? null`"), rewritten out in the
same pass since it was the same comment.

<details><summary>the finding as audited</summary>

- `useAccountMenuSection.ts` line 67: `label: username ?? 'Account'`, with a
  comment that "before the profile store has resolved, 'Account' is the
  honest placeholder". `useSession` seeds the store BEFORE `loading` clears
  ("so the first render of the account menu already has a username rather
  than a placeholder" — its own comment), and the only pages with a menu sit
  behind that gate. Line 71's `dot: color` is `undefined` on the same
  impossible branch.
- `EditProfileModal.tsx` line 97: `profile === null ? <p>Loading…</p>`, with a
  five-line comment explaining the branch. The modal mounts only after the
  gates, from a menu row that exists only with a profile.

A default that cannot fire is a slot-filler. The `Profile | null` type forces
a branch; what it should say is the truth — the null is the signed-out state
the store's readers on the login screen see, and it cannot be this one.
Options: (1) narrow once — the hook and the modal read the profile through a
`useProfileOrThrow`-shaped seam session would own, and the branches go; (2)
keep the branches, rewrite the three comments to say the null is impossible
here and the branch exists for the type; (3) leave. Session's file, if (1).

</details>

### F-account-12 · `color-list-home` · `ColorChoiceList` lives in `account` and its only reader is `fields/ColorField` — DONE

**Decided and done 2026-09-12**: folded in, and the merged component is
**`ColorChoiceField`** (Joel's name). `ColorChoiceList.tsx` is deleted, its
stylesheet moved to `fields/`, and `ColorField.tsx` + `.test.tsx` renamed
around it. The swatch grid is now drawn inside the field, which is what every
other field in the folder does — `PlayersField` is the closest shape, a
`<fieldset>` of member rows each with a `<Dot>`, and it draws its rows itself.
`ColorField`'s "THE WRAPPER IS THE COMPONENT, not just the list" stops being a
note about an arrangement and is simply true.

Two recounts from the audit, both making the move cheaper than it read: **no
guard names the file** (F-8 deleted the two `vocabularies` rows this morning,
so the predicted re-pathing does not exist), and **`ui.md` mentions it in four
places, not three** (1403, 1405, 1414, 1761 — all re-pointed, and 1405 rewritten
to describe a field rather than a list).

The stylesheet keeps its `cs-audited-account` stamp in a `cs-blessed-forms`
folder. Left for Joel: the file was audited here and is not blessed, and the
merged `ColorChoiceField.tsx` still says `cs-blessed-forms` over content it
gained today.

The rename also exposed a claim in `field.module.css` that the legend fix
(F-15) had already made wrong — "`<ColorField>` is the one that needs it",
about the `<fieldset>` reset, when three `group` fields need it. It says "what
a `group` field needs" now.

<details><summary>the finding as audited</summary>

`fields/ColorField.tsx` (blessed, forms): "THE WRAPPER IS THE COMPONENT, not
just the list." Nothing renders `ColorChoiceList` but that wrapper; the claim
screen and the modal both take `<ColorField>`. So the list is `ColorField`'s
implementation, living in another folder, and a blessed folder imports its
inner from an unaudited one. Options: (1) the list moves into `fields/` beside
its wrapper — one file move, the stylesheet with it, the guard rows re-pathed;
(2) fold it INTO `ColorField.tsx` — the wrapper draws the swatches, one
component, one stylesheet; (3) `members/`, beside `MEMBER_COLORS` and `<Dot>`;
(4) leave. `ui.md` names `<ColorChoiceList>` in three places either way.

</details>

### F-account-13 · `test-mock-hex` · the test's profile stores a hex where the app stores a name — DONE

`EditProfileModal.test.tsx` line 23: `color: '#c0392b'`. `common.profiles.color`
is a palette NAME (`'red'`, …), and the list selects by `value === name`, so
in every test no swatch starts selected — the form under test never has the
shape the app gives it. `'red'`. No decision.

### F-account-14 · `theme-pins-in-color-test` · three of the eight assertions are the reserved column's — DONE

**Decided and done 2026-09-12**: option 1. `profiles_theme_test.sql` holds the
column's reservation start to finish — starts null, no direct UPDATE for a
player, free-form at the schema level — and the RPC's file drops to `plan(5)`
with a line saying where the `theme` pins went.

Cheaper than the audit assumed: `npm run test:db` is
`supabase test db --local supabase/tests`, a directory walk, so a new file
registers nowhere and no total is written down anywhere to recount. Only the
`plan()` inside the file changed. A table-scoped test file has precedent —
`clubs_test.sql`, `games_test.sql`, `fk_delete_rules_test.sql`.

Considered and not taken: splitting by what each assertion is about, so that
"starts null" would join `claim_username_test.sql` — which already pins the
`username` and `color` a materialized row holds. Correct per assertion, but it
spends three files to relocate one, and that pin reads well as the opening line
of the column's own story.

The moved header drops F-3's dated claim ("Nothing reads or writes it yet
(2026-08-03)") rather than carrying it across. **`docs/common.md`'s `profiles`
row still carries the same date on the same column** — F-3's, still open.

Plant-verified: expecting `'midnight'` where the column starts null fails two
of the three. Suite green at 177 files, 2454 assertions.

<details><summary>the finding as audited</summary>

`update_profile_color_test.sql` pins the RPC in five assertions and then, under
its own heading, the `theme` column's reservation in three: starts null, no
direct UPDATE for a player, free-form for the test role. The column is
`common.profiles`' and the RPC never touches it; the file is named for the
RPC. A file per unit. Options: (1) `profiles_theme_test.sql` in the same
folder, the three moved, both plans recounted; (2) rename this file to the
profile's write-path test and let the header say it covers both; (3) leave.

</details>

### F-account-15 · `legend-gap` · a group field's caption sits flush against its control — DONE

Found while looking at the picker (Joel: *"there should be spacing between
'Player color' and the list of colors"*). `field.module.css`'s `.field` is a
flex column with `gap: var(--spacer-4)`, which is what puts 0.5rem under every
caption — but a `group` field's caption is a `<legend>`, and a legend is the
fieldset's rendered caption rather than a flex item, so the gap never reaches
it. Measured on the two shapes side by side: legend 0, span 16px.

One rule in `src/common/fields/field.module.css` (blessed, `forms`):
`legend.label { margin-bottom: var(--spacer-4) }`. Two fields pass `group` with
a caption — `<ColorField>` (the Edit profile modal and the claim screen, both
taking the prop's `'Player color'` default) and `<CheckboxListField>` (Edit
club's "Games played in this club"). `<PlayersField>` also passes `group` but
has no default label and its one call site passes none, so it draws no legend
and is untouched. **Done 2026-09-12**, across all three screens.

## Notes

- **Five `signOut` calls, no helper.** `session`'s doc says the hook signs out
  on a dead token; the claim screen signs out on PN018 and on "sign in
  again"; the account menu signs out on "Log out". Each calls the auth client
  directly. Read and left: a helper would be a generic layer with one
  behavior, and the one that surfaces its failure (F-10) is this folder's —
  the others are best-effort on paths that already know they are failing, and
  the claim screen's hard-redirects regardless.
- **`react-rnd` is still the panel engine** (`FloatingPanel.tsx` imports it),
  so the "positions from its static flow position" claims in the store, in
  `App.tsx` and in ui.md hold. Checked because the floating-panels doc.md never
  names the library.
- **`ColorChoiceList` is not a `SelectionList`** by ui.md's own line, and the
  lasting-mark kind of that list was deleted with no caller. F-9 is decided
  here, not by converting.
- **PN900** is the stub code every form test uses for a refusal it invents
  (`EditClubModal`, `AnagramDialog`, `WordEditDialog` do the same). Not a
  finding.

## Predicted test breaks

None at the audit, and none happened — the prediction held for every finding
but one. F-12 was predicted to re-path two `vocabularies` rows; F-8 had already
deleted them, so the move touched only the import and the docs. The rest
landed as written: F-7's rename was caught by `tsc -b` alone, F-13 changed
what the mocked profile holds with no assertion reading the pre-selected
swatch, F-14 recounted `plan(8)` and added a file, F-1 deleted a KNOWN row
from `orphanedDocstrings`.

Two guard edits were NOT predicted, both from F-10: `noRawServerMessage` gained
a structural exemption for `environmentalEnvelope(`, and `docLinks` caught an
anchor I invented for a heading `ui.md` does not have.

## What the prose group turned up

The prose group (F-1 to F-6, plus F-7 and F-13) was worked as one pass, and two
things in it were bigger than the audit had them.

**`supabase/sql/common.sql`'s profiles policy was wrong, not just dated.** The
STANDING RULE above `profiles_select_authenticated` — *adding a column that
isn't public means building the view first* — justified itself with "All four
columns today (user_id, username, color, created_at)". The table has **six**:
`theme` and `can_edit_words` arrived after that sentence was written, and
nobody revisited the rule when they did. Both are in fact public-safe, so the
conclusion survives; the reasoning behind it did not. Rewritten to name the
condition rather than count the columns, which is what would have kept it true.
`docs/common.md`'s `profiles` row had the same gap — it named `theme` and not
`can_edit_words` — and now names both.

**F-3's `docs/ui.md` sub-bullets were three paragraphs of history.** The
account-submenu bullet narrated the `<UserMenu>` it replaced, the first version
of home's header that sat inside the card, and the attempt that hung the menu
off the wordmark. Each carried a live argument inside a dead story; the
arguments are kept in the present tense and the stories are gone.

## Closing

- [x] the whole area re-read in one sitting after the last group — grepped for
      archaeology words, dates, plan citations, census claims, `/**` on props
      and JSDoc tags across the folder and the moved file; all clean
- [x] the folder's `doc.md` Design written; its row off `INTROS_OWED`
- [x] `todo.md` holds everything still owed; nothing durable left in this file
- [x] every file on the roster blessed, or its stamp says why not — Joel,
      2026-09-12: *"bless the files in this area, and bless
      fields/ColorChoiceField.module.css."* Eight files `cs-blessed-account`.
      The stylesheet takes **account's** suffix even though it now lives in
      `fields/`, because the suffix records which area made the judgment rather
      than which folder holds the file, and account is the area that read it.
      `fields/ColorChoiceField.tsx` was NOT re-blessed and still says
      `cs-blessed-forms` over content it gained in F-12 — forms', when forms
      next opens.

## Closing summary

Moved here from `plans/app-audit.md` (its "Where to start" notes and its row in
the areas table) when that file was trimmed to the process, 2026-09-23.

**`account` is closed** (2026-09-12): eight files `cs-blessed-account`, fifteen
findings, all worked. What changed the app: a failed sign-out was a
`console.error`, and `GoTrueClient` returns before clearing the local session on
one, so you stayed signed in with nothing on screen saying so — it goes through
`reportDbFault` now with a code of its own (`PN492`, in a third table beside the
`FE` four, for the auth calls a signed-in player makes that no wrapper speaks
for), and the hook got its first test file. A `<legend>` is not a flex item, so
every `group` field's caption had been sitting flush against its control — one
rule in `field.module.css` fixed the picker in two screens and Edit club's
checkbox list. The color swatches are quiet buttons now, wearing quiet's washes
and no transition because a standard button paints its wash instantly, and the
chosen one takes an ink border rather than the keyboard cursor's blue ring —
which let both `⚠️` essays defending that resemblance be deleted, `focus-ring.css`
included. `ColorChoiceList` folded into its wrapper as `ColorChoiceField`, so a
blessed folder no longer imports its inner from elsewhere. The reserved `theme`
column got its own pgTAP file. Two null branches that cannot fire kept their
`??` and lost the comments describing a loading moment that does not exist.
The prose pass's catch: `supabase/sql/common.sql`'s profiles policy justified
its standing rule with "all four columns today" when the table has six — the
conclusion held, the reasoning had not. Owed: nothing; `todo.md` is empty.
`fields/ColorChoiceField.tsx` still says `cs-blessed-forms` over content it
gained here, for forms to re-bless when it next opens.
