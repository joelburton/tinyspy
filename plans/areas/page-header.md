# Area: page-header

The folders it reads: `page-header`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-12, blessed — thirteen files `cs-blessed-page-header`.** Thirteen files read in one
sitting, with their six callers (home, club and game pages; the pause and
info-switch marks; the game menu wrapper), the three ui.md sections that
describe the header, and the tokens the folder reads. Fifteen findings, all
settled the same day: the prose pass and three no-decision fixes WORKED in
the sitting; of the five put to Joel, two WORKED (the strip ellipsizes; the
presence hint is a `data-tooltip`) and three CLOSED with no change (the mark
gap, the badge's sizes, the strip's spacings — each now a stated decision).
Re-read and Design done the same day; blessed the same evening.

## The roster

Agreed 2026-09-12, thirteen files, all `cs-met-page-header` → `cs-audited-page-header`:

- `src/common/page-header/PageHeader.tsx` + `.module.css`
- `src/common/page-header/PageHeaderButton.tsx` + `.module.css`
- `src/common/page-header/PageHeaderMenu.tsx`
- `src/common/page-header/PageHeaderPlayersStrip.tsx` + `.module.css`
- `src/common/page-header/PageHeaderStatusSlot.tsx` + `.module.css`
- `src/common/page-header/ChatButton.tsx` + `.module.css`
- `src/common/page-header/ScratchpadButton.tsx` + `.test.tsx`

Settled at the opening (Joel: "roster is right"): `ChatButton` stays here —
the folder table's `chat` row already says its header mark is in
`page-header` — and `PageHeaderMenu` is this area's, not a leftover of `menu`.

Edited by the area, owned elsewhere: `docs/ui.md` (the ClubPage header
section's two old feedback phrases), `src/guards/vocabularies.test.ts` (the
`999px` allowlist line). Consumers read but untouched: `buttons/PauseButton`,
`info-sheet/InfoSwitchButton`, `game-page/GameHeaderMenu`, the three pages.

## Findings

*(`F-page-header-1 · slug · title`, one heading each, with a status at the end
of the line when it has one; no status means OPEN)*

### The area's question

## F-page-header-1 · `mark-separation` · The CSS declares one gap between the header's marks, and the eye sees three different ones — CLOSED, NO CHANGE

The folder's `todo.md` item, and the reason `0.375rem` sits on the
vocabularies allowlist as "bespoke by decision". The number is `gap` on both
slots, but every mark carries its own hover padding INSIDE its box — the menu
trigger `0.25rem` (`Menu.module.css`), each `<PageHeaderButton>` `0.3rem`
plus a reserved 1px border, the status slot none — and on the game page the
chat and scratchpad bubbles sit in `.panelToggles` with their own `0.1rem`
gap. So the visible separations, adding the paddings either side of each gap:

| between | visible |
|---|---|
| menu trigger → chat bubble | 0.25 + 0.375 + 0.3 = **0.925rem** + 1px |
| chat bubble → scratchpad bubble | 0.3 + 0.1 + 0.3 = **0.7rem** + 2px |
| scratchpad (or chat) → status slot | 0.3 + 0.375 = **0.675rem** + 1px |
| pause → timer → info switch (right slot) | 0.3 + 0.375 = **0.675rem** + 1px each side of the timer |

Three numbers, none of them the declared one, and the two bubbles that are
"grouped tight" are separated by MORE than a bubble is from the roster beside
it. `docs/ui.md → The page header` records the current state as a fact ("the
marks add their own hover padding on top, which is why the visible separation
is wider than the number") without saying what the separation should be.

Options:

1. **Every mark gets the same box, and the gap becomes the visible number.**
   The menu trigger's padding moves from `0.25rem` to `0.3rem` to match
   `<PageHeaderButton>` (the header's height token composes from that
   padding, so `--pageHeader-height` becomes `logo + 2 × 0.3rem` — one edit,
   in base.css, and the sheet offset follows), `.panelToggles` loses its own
   gap and takes the slot's, and the slot gap drops to `--spacer-5`
   (`0.25rem`). Every mark→mark separation is then `0.25 + 0.3 + 0.3 =
   0.85rem` + 2px, one number, and the allowlist line goes. The bubbles stop
   being "grouped tight", which they never visibly were. Costs: the strip is
   1.6px taller; the marks' visible separation grows from 0.675–0.925 to a
   uniform 0.85, so the header reads slightly more open on the left and the
   pair of bubbles slightly less paired. **Recommended:** it is the only
   option under which the declared number is the one you see.
2. **Keep the marks' paddings and set each gap to make the SEEN separations
   equal.** The gap between marks stays bespoke and becomes two numbers
   (mark→mark, mark→slot); `.panelToggles` goes. Equal to the eye at the cost
   of a stylesheet that has to explain why its gaps differ.
3. **Decide the current state is right** — the bubbles are meant to sit
   closer than the rest — and close the todo item by writing that down: the
   gap is a base and each mark's padding is part of its look. The allowlist
   line stays as the record.

**DECIDED 2026-09-12 — option 3.** The gap is a base; a mark's padding is
part of its look; the seen separations differ per pair on purpose. Written
into `docs/ui.md → The page header`; the todo item is gone, and `.left`'s
comment (which used to defer to it) is down to what the gap is — Joel trimmed
the decision paragraph out of it himself. The `0.375rem` allowlist line
stays: it already said bespoke by decision.

## F-page-header-2 · `strip-clips-not-ellipsizes` · The players strip cannot ellipsize — it is a flex container — so a long roster is cut mid-name with no sign — WORKED

`.strip` is `display: flex` with `overflow: hidden; text-overflow: ellipsis;
white-space: nowrap`. `text-overflow` applies to a block container's inline
content; a flex container's children are flex items, so the declaration never
paints and the overflow is a hard clip. Verified headless (2026-09-12): a
160px flex strip of three names shows "● alexanderthegreat" cut at the box
edge, and the same names in a block box show "● alexanderthegreat…".

Six places say it ellipsizes: the module's header comment and the `.strip`
rule, `PageHeaderStatusSlot.module.css` ("required for the inner strip's
`text-overflow: ellipsis` to actually kick in"), the strip's docstring
("ellipsis-on-overflow"), `PageHeader.module.css` `.left` ("lets that content
ellipsize"), and `docs/ui.md → The page header` (the same sentence). Two of
those were rewritten in the prose pass to drop the claim; the rest wait on
this.

Where it bites: a desktop club or game header with enough long names — a
six-player club with handles — clips the last name to a fragment, and the
reader cannot tell a clipped "● bartholo" from a member called that.

Options:

1. **Make it ellipsize.** `.strip` becomes a block container (`display:
   block`; the entries are already `inline-flex`, which is inline-level, so
   the ellipsis applies), the gap becomes a margin on the entries, and the
   prose stays true as written. The visible result is the row it already is,
   with "…" where the cut is. **Recommended.**
2. **Accept the clip and say so.** Drop `text-overflow` and rewrite the six
   claims to "clips". Cheapest; leaves the fragment-name ambiguity.
3. **Fade instead of cut** — a mask-image gradient at the right edge. Reads as
   "there is more", never as a name. More CSS than the problem needs.

**DECIDED and built 2026-09-12 — option 1.** `.strip` is a block: `display:
flex`, `align-items` and `gap` are gone; the entries keep `inline-flex` and
gain `vertical-align: middle`; the spacing is `.entry + .entry { margin-left }`
(1.25rem, 0.6rem on mobile — the same numbers). Verified headless with the
header's real flex nesting around it: the strip, the menu trigger and each
entry share one vertical midpoint (32.0 / 32.0 / 32.4 px), the desktop strip
ends in "…", and the dots-only mobile strip does too. The module's header
comment now says why it is a block. The four remaining prose claims that it
ellipsizes are true as written.

### Behavior

## F-page-header-3 · `status-slot-min-height-never-binds` · The status slot's `min-height: 2.25rem` could never take effect, and its comment claimed it was what kept the header from reflowing — WORKED

`<PageHeader>` fixes the strip at `--pageHeader-height` (2.5rem) and centers
its slots; the left slot's height is its tallest child, the menu trigger, at
that same 2.5rem. The status slot sits inside it at `min-height: 2.25rem` —
smaller than the row it is already centered in — so the declaration could
not change any box, and the comment ("fixed minimum height so the slot
occupies the same vertical space whether it's holding a strip or a pill") was
crediting it with the header's own contract. The declaration and the claim
are gone; the slot's comment and `PageHeaderStatusSlot.tsx`'s docstring now
say the header fixes the height and both states fit inside it.

## F-page-header-4 · `dot-border-literal` · The strip's dot ring was `2px` where the pill's identical ring reads `--border-width-line-thick` — WORKED

`FeedbackPill.module.css` sizes its actor disc "to match the
PageHeaderPlayersStrip dot so the two read as the same convention" and writes
the ring as `var(--border-width-line-thick)`; the strip wrote `2px`. Same
convention, one token and one literal. Now the token; no visible change.

## F-page-header-5 · `badge-radius-literal` · The unread count's `999px` had a token named for it — WORKED

`--radius-round` exists (base.css: "the badge is the lozenge and now does"),
and the guard's allowlist still carried this file as one of "two `999px`
writers … each a shape question its own area answers", suggesting `50%`. The
badge is not a square: `min-width: 1.1rem` with padding, so it grows with
two digits, and `50%` would draw an oval. It is a lozenge, which is what the
token is for. The literal is the token, the allowlist line is gone, and the
comment on the remaining writer (`ShuffleButton`) says why this one left.

## F-page-header-6 · `badge-type-literals` · The unread count's `0.7rem` type and `1.1rem` box are on the guard's pending lists — CLOSED, NO CHANGE

Both sit in `vocabularies.test.ts` under `pending` — the type ramp's and the
line-height's — for this area to settle. The ramp's smallest step is
`--font-size-3` (`0.75rem`); the box (`min-width`, `height` and
`line-height`, all `1.1rem`) is the a/b/c case, a size that fits no ramp
because it is a badge and the app has one.

Options:

1. **Type on the ramp, box bespoke.** `font-size: var(--font-size-3)` — the
   digits grow by 0.05rem inside a box that already has room — and the three
   `1.1rem`s stay, with the allowlist entry rewritten to say the badge's box
   is its own size by the a/b/c rule. **Recommended.**
2. **Both bespoke.** Rewrite the allowlist entries as decisions and change
   nothing visible.
3. **Both on the ramp** — `--font-size-3` and a box of `--spacer-2` (1rem).
   A tighter badge; two digits get cramped.

**DECIDED 2026-09-12 — option 2.** Both stay bespoke. The two allowlist
entries now say so and why (the app's smallest type, the same 0.7rem the
badge pattern wears; a leading that IS the box height), and the
`.unreadPill` rule's comment carries the same reason in the file, which is
what the guard's `fix` line asks for. Nothing visible changed. Noted for
`core-css`: the badge pattern and this chip agree on 0.7rem, which is the
argument for a fourth ramp step if a third site ever wants it.

## F-page-header-7 · `strip-spacing-literals` · The strip's three spacings — `1.25rem` between players, `0.4rem` dot-to-name, `0.6rem` between dots on a phone — are on the guard's pending list — CLOSED, NO CHANGE

None is a ramp step (`1.5 / 1 / 0.75 / 0.5 / 0.25`). The spacer allowlist
carries them as unconverted, not as decided.

Options:

1. **Snap to the ramp**: `--spacer-2` (1rem) between players, `--spacer-4`
   (0.5rem) dot-to-name, `--spacer-4` between dots on a phone. The row gets a
   little tighter on desktop (0.25rem less per player) and the dot sits a
   hair further from its name; the phone row a hair looser. Three literals
   off the list.
2. **Keep them bespoke and say so**: the strip is a row of identity marks,
   not spaced parts, and its numbers were tuned by eye against the dot's
   `0.85rem`. The allowlist entries become a decision. No visible change.
   **Recommended** — the same reasoning `0.375rem` got; the guard's job is
   to make a bespoke number a stated one, not to force a ramp.

**DECIDED 2026-09-12 — option 2, keep them.** The allowlist entry says
bespoke by decision and why; the `.entry + .entry` rule's comment carries the
reason in the file. Nothing visible changed.

## F-page-header-8 · `presence-hint-native-title` · The club strip's "In the club" / "Away" hover text is a native `title`, where every other hover text in the shell is a `data-tooltip` — WORKED

`<PageHeaderButton>`'s own comment says why the shell moved off `title`:
"the native `title`, which some browsers delay past noticing". The strip's
presence hint is the one place in the header still using it, on each entry
of the club page's strip. `TooltipHost` delegates on any `[data-tooltip]`
element, so the swap is one attribute.

Options:

1. **`data-tooltip`**, same words. One attribute, and the header's hover text
   is one mechanism. **Recommended.**
2. **Drop the hint.** The hollow disc already says "away", and mobile.md
   calls that the whole signal. Nothing hovers on a phone anyway.
3. **Leave it.** Desktop-only, and the native delay is a nuisance rather than
   a defect.

**DECIDED and built 2026-09-12 — option 1.** The entry's `title` is
`data-tooltip`, same two strings, with a comment saying it is the header's one
hover mechanism. `e2e/presence.e2e.ts` located the entries by `getByTitle` at
four sites; each is now `locator('[data-tooltip="…"]')` with the same text
filter. Not run yet — see Predicted test breaks.

### Prose

## F-page-header-9 · `props-wear-docstring-marker` · Fourteen prop notes across five files were `/**` — WORKED

`PageHeader` (2), `PageHeaderButton` (5), `PageHeaderMenu` (4),
`PageHeaderPlayersStrip` (1), `PageHeaderStatusSlot` (2). All `//` now.

## F-page-header-10 · `height-contract-told-three-times` · The header's height story — the arithmetic nobody wrote down, the sheet riding 4px over the rule — was told in full in `PageHeader.tsx`, again in its module, and again in base.css — WORKED

base.css's token comment is the home (it is where the composition happens and
where the 390/768 measurement is recorded). The docstring now says the rule
and points there: the height is `--pageHeader-height`, a second file composes
from it, the strip never grows, fix the child. The module keeps the two
mechanisms a CSS reader needs — why `height` and not `min-height`, why
`content-box` — and drops the story.

## F-page-header-11 · `strip-prose-archaeology` · The strip's prose described a row it no longer is — WORKED

"Inline flow with middle-dot separators" (there are none; it is a flex gap),
"replaces the old middle-dot separator", "see ClubPage.module.css, where this
breakpoint was first established" (the custom media lives in
`mobile/breakpoints.css`), and the docstring's "real-estate caveat … a
future mobile pass … deferred until those constraints bite" — the mobile
pass happened, and its rule (dots only below `--mobile`) is in the module.
The docstring now says that in one sentence; the `.strip` header comment was
rewritten with F-2.

## F-page-header-12 · `chat-button-stale-cites` · `ChatButton` cited `lib/chatUnread`, and its module described "the bottom-right circular variant (still in Chat for ClubPage)" — WORKED

The file is `chat/chatUnread.ts`; there is no circular variant anywhere in
`chat/` (ClubPage's own comment says the toggle lives in the header). The
module's first paragraph also restated what `<PageHeaderButton>` does; it now
says only what the bubble adds: the unread fill and the count.

## F-page-header-13 · `ui-md-club-header-old-feedback-words` · The ClubPage header section still said `setFeedback(...)` and "the configured dismiss mode", and called the rename placeholder a `timed` pill — WORKED

Two sentences the feedback area's doc sweep missed. Now: the global feedback
slot, the message's kind, and an `acknowledgment` that fades.

## F-page-header-14 · `button-module-repeats-docstring` · `PageHeaderButton.module.css`'s header restated the tsx docstring's "a module rather than a global class" paragraph — WORKED

One home: the docstring. The module's header points at it.

## F-page-header-15 · `doc-md-is-two-sentences` · `page-header/doc.md` was a title and an action-wiring note; its Design is owed — WORKED

The lede is now an inventory of the folder. The Design — the height contract,
one mark component with four independent channels, the status slot's two
states, what earns the header — is the closing step, and `common/page-header`
is on `DESIGNS_OWED` until then.

## F-page-header-16 · `chat-label-is-logic-nobody-reads` · The chat mark computed a three-way `aria-label` that no person reads — WORKED

Joel's read, 2026-09-12. The mark's label was `open ? 'Close chat' :
unread ? 'Open chat, N unread' : 'Open chat'`, but the mark passes its
tooltip separately ("Chat · /"), so the label was only ever the accessible
name — which nobody here reads (screen readers are out of scope) — and the
handle eleven e2e locators found it by, three of them with a regex because
of the count suffix. *"It's ok to keep aria labels, but here we've got actual
logic that no human will see. If you need to find the button in a test, just
make it a simple string."* The label is `"Chat"`, with a comment saying it is
a test handle and nothing more; every locator is `{ name: 'Chat', exact: true
}`; and `chat.e2e.ts`, which had asserted the unread count THROUGH the label,
now asserts the badge's own text — what a person sees. The action registry's
`'Open chat'` (the menu row's words) is untouched. None of the eight specs
has been run.

## Notes

- **The full e2e run (2026-09-12, Joel's ask) found five reds, none this
  area's, all fixed from here.** Four were `club-keyboard` (3) and
  `home-keyboard` (1), which still asserted a cursor ring on load: the lists
  area changed that contract on 2026-09-11 (hidden until a movement key asks;
  the first arrow only reveals) and never updated the two specs it had "left
  off" at its opening. Each now presses one arrow to reveal before asserting,
  and the click test asserts NO ring after a click, then the inset ring after
  an arrow. The fifth, `setgame-flash`, bet that a claim on a planted 15-card
  board leaves 12; the deal-three rule appends three more when the twelve
  hold no set, so it now asserts the count the server settled on. All seven
  green; the suite was 228 + 5 red, and is 233 green.
- The hover gating (`@media (hover: hover)`) on `PageHeaderButton` is the one
  place in the app that gates `:hover` to pointer devices; whether the whole
  app should is `core-css/todo.md`'s question, listed there already. Not
  this area's to answer.
- The header has no unit test of its own beyond `ScratchpadButton`'s; the
  e2e specs reach it by the marks' labels ("Game menu", "Open chat", "Close
  chat"). Nothing in this area changes a label.

## Predicted test breaks

- `e2e/presence.e2e.ts` — changed with F-8 (four `getByTitle` → attribute
  locators). Not run; ask before running.
- Eight specs changed with F-16, every locator for the chat mark now `{ name:
  'Chat', exact: true }`: `chat`, `chat-feedback`, `panels-touch`,
  `page-no-scroll`, `panel-viewport`, `panel-escape`, `club-keyboard` (red
  before, for other reasons). `chat.e2e.ts` also asserts the badge's text
  instead of the label.

**Run 2026-09-12, on Joel's word: 19 passed, 3 failed — the three
`club-keyboard` cases that were red before this area opened**, each dying on
a focus-ring assertion (`ringed()` null at line 50; `-1` at line 172) before
it reaches the chat mark. Every spec this area changed is green.
- `e2e/club-keyboard.e2e.ts` reaches the header by "Close chat" and was red
  before this area (3 of 4, focus-ring assertions). Not this area's.
- F-2 changed the strip's box model; no spec asserts the strip's layout, and
  the presence spec above is the only one that reads its entries.

### The closing re-read, 2026-09-12

Thirteen files and the ui.md section re-read after F-8. Three things, none a
numbered finding: the shared button module explained its disabled state with
the pause mark's own story (now the general rule, with pause as the example);
the lede's third sentence was action wiring, not a lede (moved to Details);
and the Design was owed (F-15, below).

Joel's read of the re-read (2026-09-12) caught what mine had not: two
"a component rather than a class, because…" paragraphs — one in
`PageHeader.tsx`, one in `PageHeaderButton.tsx` — were rationale and history
in a docstring, the exact thing the prose pass is for, and the pass had
trimmed around them. Both gone; the reasoning lives in `doc.md`'s Design and
`docs/ui.md → The page header`. The mousedown sentence the second one led into
now stands on its own.

F-15: `doc.md` has its Design — furniture with two slots; a height that is a
contract and a strip that never grows; one kind of mark with four independent
channels; the status slot's two states and why the header is for news about
others; a base gap and marks that pad themselves; marks as action surfaces —
and a Details list for the sharp specifics. `common/page-header` is off
`DESIGNS_OWED` (verified by planting: renaming the heading fails the guard).

## Closing

- [x] the whole area re-read in one sitting after the last group (2026-09-12)
- [x] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [x] `todo.md` holds everything still owed; nothing durable left in this file
      (`page-header/todo.md` is empty — its one item closed as F-1)
- [x] every file on the roster blessed (Joel, 2026-09-12): thirteen files
      `cs-blessed-page-header`
