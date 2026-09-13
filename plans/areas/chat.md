# Area: chat

The folders it reads: `chat`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: CLOSED 2026-09-12, blessed — sixteen files `cs-blessed-chat`
(the fifteen on the roster and `ChatButton.test.tsx`, which the area wrote).**
Audited and closed the same day. Seventeen findings, all worked: F-1 to F-8 in
the prose pass, F-11, F-9, F-10 and F-12 on Joel's decisions, F-13 to F-16 in
the closing re-read (the whole roster in one sitting), and F-17 on Joel's word.
The `doc.md` Design is written and the row is off `DESIGNS_OWED`; `todo.md`
holds one Maybe. Blessed on Joel's "bless the files. then close.".

## The roster

Agreed 2026-09-12 (Joel: 1 yes · 2 see Notes · 3 the schema and RPCs are
read too).

- `src/common/chat/Chat.tsx`
- `src/common/chat/ChatBody.tsx` + `.module.css`
- `src/common/chat/useClubChat.ts` + `.test.ts`
- `src/common/chat/useChatFeedback.tsx` + `.test.tsx`
- `src/common/chat/chatOpenStore.ts` + `.test.ts`
- `src/common/chat/chatUnread.ts` + `.test.ts`
- `supabase/tests/common/chat_test.sql`
- `e2e/chat.e2e.ts`, `e2e/chat-feedback.e2e.ts`, `e2e/chat-keyboard.e2e.ts`

Plus `doc.md` (lede rewritten and Design written in the prose pass, and the
wiring — the seam, the one subscription, the two stores — added after; off
`DESIGNS_OWED`, the guard planted red first) and `todo.md` (one Maybe left;
F-chat-7, F-chat-10 and F-chat-17 took the three Soon items) — no stamp,
markdown.

**Written by this area, in another folder:**
`src/common/page-header/ChatButton.test.tsx`, stamped `cs-audited-chat` — the
mark had no test file, and F-chat-10 moved a decision into it that wants one.

**Edited by this area, outside the roster, stamps untouched:**
`src/guards/vocabularies.test.ts` (F-chat-15, two words) and `docs/common.md`'s
scratchpad bullet (F-chat-16, three paths).

**Evidence, not roster — read and judged, findings recorded, fixed in place,
but never stamped, because a stamp is per file** (the ruling `supabase` and
`definitions` made): `supabase/sql/common.sql`'s chat pieces — `send_message`,
the `messages_select` policy, the grants on `common.messages` — and
`common.messages` itself in the baseline migration (`20260615000000_common.sql`).
Joel asked at the opening that the schema and RPCs be audited, and they are,
in this sense.

Consumers: `club/ClubPage` and `game-page/GamePage` (mount `<Chat>`),
`actions/AppActionsHost` + its test (the `/` action), `page-header/ChatButton`
(blessed; reads `chatOpenStore` and `chatUnread`, and after F-chat-10 decides
the unread fill). The three guards that name
the folder (`rawStorage`, `folderDocs`, `vocabularies`) are not part of the
audit. Docs: `docs/common.md`'s chat sections and
`docs/keyboard-shortcuts.md` → Global.

## Findings

Read in one sitting 2026-09-12: the fifteen roster files, the four consumers
(`ClubPage`, `GamePage`, `AppActionsHost`, `ChatButton` + its stylesheet), the
chat SQL (`send_message`, the policy, the grants, the table and its index, the
publication row), `docs/common.md`'s chat lines, `docs/ui.md`'s header and
z-layer sections, and the siblings the files cite (`Companion`,
`handOffKeyboardOnTab`, `usePeerFeedback`, `storage.fake`, `memberById`,
`channelDedup`). The SQL raised nothing: the RPC trims, range-checks and
inserts under `require_club_member`; the policy is membership; the table has
no insert grant; the index serves the one query; `messages` is in the
publication.

### WORKED · F-chat-1 · stale-claims · fourteen sentences about code that no longer looks like that

`Chat`'s docstring named `--z-index-chatPanel` and `--z-index-panel` (the
ladder is `--z-chat`), a `closeOnEsc` default that does not exist, and said
"we don't arbitrate a topmost dismiss" when `escapeRank` and the registry do
exactly that. `chatUnread` said the button fills its *background* and shows a
*red* pill (the glyph fills; the pill is black, and the button's stylesheet
says why). `useClubChat` named `ClubChatPanel` and `lib/chatUnread`, and sent
the reader to `useGame` for the suffix rationale that lives in `channelDedup`.
`ChatBody` cited a "file-level docstring" it has not got and compared
`block: 'end'` to `'smooth'`, which is a different option. Its stylesheet
cited `connections/ChatPanel.module.css` (gone) and "the global form rules"
(there are none). `chat_test.sql` named `ClubChatPanel` and `BoardScreen`;
`chat-keyboard.e2e.ts` named `ChatBody`'s `handleKeyDown` (it wears
`handOffKeyboardOnTab`); `chatOpenStore.test.ts` described a "bottom-right
toggle" and a try/catch around `localStorage.getItem`; `chatOpenStore`'s hook
docstring named an `aria-label` the button does not compute; `docs/common.md`
called the panel a popover. All rewritten to what is there.

### WORKED · F-chat-2 · archaeology · "lifted from", "now takes", "the bug that"

`Chat.tsx`'s comment on its subscription explained where the hook used to
live; `useClubChat.test.ts` named the race as "the bug that left the badge
stuck". Both say the present-tense reason.

### WORKED · F-chat-3 · marker-pass · `/**` on props and inside bodies, and a docstring on a `let`

`Chat`'s `selfId`, `ChatBody`'s `messages`, `ChatUnread`'s `color`, and a
`const` inside the keyboard spec all took `//`. `chatOpenStore`'s "IS THERE A
CHAT PANEL" docstring sat above `let mountedPanels`, so the thing lit up was a
counter while `useChatMounted` had nothing; it is on the hook now.
`useChatUnread` got the one line it lacked.

### WORKED · F-chat-4 · rationale-in-docstring · fifty-two lines on `Chat`, and two more

`Chat`'s docstring was a design essay (the two shapes, the force-open
semantics as a list, the Escape story, why it outranks the panel tier, the
lifecycle) — now eleven lines and a pointer at the Design, which carries all of
it. `useChatFeedback` (22 → 10 lines) lost the "what makes the historical case
correct" paragraph, which is `usePeerFeedback`'s contract; the window constant
(11 → 5) kept the `max_rows` fact and lost the argument for a window.

### WORKED · F-chat-5 · dead-test-scaffolding · a channel mock built twice

`useClubChat.test.ts` built a channel object and a `handlers` holder inside
`vi.hoisted` and then rebuilt both in `beforeEach`; the hoisted pair was never
reached. The hoisted block is five bare `vi.fn()`s now, and the INSERT-only
capture comment moved to the copy that runs.

### WORKED · F-chat-6 · hand-rolled-member-lookup · `members.find` beside `memberById`

`ChatBody` wrote its own `memberFor` while `useChatFeedback`, one file over,
uses `members/memberById`. Same call now.

### WORKED · F-chat-7 · storage-fake · the todo's first Soon item

`chatOpenStore.test.ts` installed a hand-rolled `FakeStorage` as a data
property on `window` and spied on its prototype to make a write throw — the
one test file left on `rawStorage`'s `ALLOWED` list. It is on
`installFakeStorage()` now, asserting through `storage.local`, with both
failure shapes (`failCalls`, and `blockAccess`, which the old fake could not
model). The `ALLOWED` row came off after the guard was seen red on it — which
took renaming one test title, because "localStorage" in a *string* matches the
guard's pattern and kept the row looking live. The todo item is gone.

### WORKED · F-chat-8 · inert-form-reset · `.inputRow` overrode rules that do not exist

`display: block; margin: 0` with a comment about "the global form rules
(display: flex column, margin-top: 1rem, gap: 0.75rem)". No stylesheet sets a
`form` rule — `StandardForm` is a class, and this composer is not one — and a
`<form>` is block with no margin in standards mode. Both declarations went;
`flex-shrink: 0` is the one that does something.

### WORKED · F-chat-9 · vocabulary · `ChatBody.module.css` carried six literals the ramps cover

`gap: 0.4rem` / `0.3rem`, `font-size: 0.9rem` (twice), `line-height: 1.35`,
`border: 1px`. The `max(16px, 1em)` iOS floor is deliberate and stays
(`docs/mobile.md` → Decisions #3); the two paddings are outside the spacer
vocabulary by `core-css/todo.md`.

Converting moves the look, so the three shapes put to Joel were: all six; all
six but the message taking `--line-height-1` (1.5) instead of `-2`, since a
message is prose; or five, holding `0.9rem` as the evidence `base.css` asks for
before a new font-size member is added. **Joel chose all six** ("we can always
tweak once I see it"). So the message text is `--font-size-2` (0.85rem) at
`--line-height-2` (1.25), the entry field matches it as it did before, the gaps
are `--spacer-4` and `--spacer-5`, and the border is `--border-width-line`. The
airier `--line-height-1` was argued against: with the gap between messages at
`--spacer-5` (4px), leading of ~20px inside a message would exceed the space
between two, blurring where one ends.

`vocabularies.test.ts` lost three pending rows (spacers, line-height,
border-width); the font-size row shrank to the `max(16px,` / `1em)` pair, which
three other files carry for the same reason. The spacers arm was seen red on a
planted `0.4rem` before the row came out.

### WORKED · F-chat-10 · unread-store-publishes-a-color · chat decided how the strip paints

`computeUnread` returned `{ count, color }` where `color` was a CSS string —
`colorVarFor(member.color)`, or the muted fallback when the roster had not
named the sender. That was a presentational decision made in chat's file and
handed to a blessed `page-header` button that only forwarded it, against Joel's
ruling at the opening: the logic may move, the presentational part stays with
the button.

Two shapes honored the ruling — publish the `Member`, or publish the member's
color NAME — plus the do-nothing option. **Joel chose the color name.** So
`ChatUnread` is `{ count, senderColor: string | null }`, `computeUnread` returns
`member?.color ?? null`, and `ChatButton` turns that into the fill, muted case
and all. The `Member` shape was argued against on the store's idempotence: it
compares by value, and `members` is a fresh array per roster fetch, so object
identity would republish on every refetch — while comparing `sender?.user_id`
instead would leave a mid-session color change stale until the count next moved.
Two primitives keep that check honest.

`null` now means both "nothing unread" and "sender not in the roster", which the
type says out loud; the button treats the second as muted, and that reasoning
moved to it with the decision. The muted-fallback assertion left
`chatUnread.test.ts` for a new `page-header/ChatButton.test.tsx` — the mark had
no test file, its `ScratchpadButton` sibling does, and the arm was seen red on a
planted `colorVarFor(senderColor)`. The durable halves: `chat/doc.md` says the
store publishes a fact, `page-header/doc.md` says the mark decides the paint, and
`chat/todo.md`'s "whether the unread badge's logic is chat's or the strip's" item
is gone — settled.

### WORKED · F-chat-11 · two-subscriptions-per-page · every page opened the club's chat stream twice

`ClubPage` and `GamePage` each mounted `<Chat>` (which calls `useClubChat`) AND
called `useChatFeedback` (which called `useClubChat` again). Two Realtime
channels on the same table filter, two initial fetches, two refetches on every
reconnect — for one list of messages, on every real page. Nothing was wrong on
screen (`channelDedupSuffix` keeps the two channels from colliding, and both
copies converge); it was a doubled cost and two copies of one stream that could
disagree for a render.

Three shapes were put to Joel: leave it and say so in the docstring; have the
panel do the bridging, since it already holds the stream; or share one
subscription per club inside the hook with a ref-counted module cache. **Joel
chose the second.** `useChatFeedback` now takes `{ messages, loading }` instead
of a `clubHandle`, and `<Chat>` — which already held the stream for the badge
and the `!` detector — calls it, taking a `globalFeedbackSlot` prop. Both pages
dropped their `useChatFeedback` line and pass the slot to `<Chat>`.

What moved with it: on `GamePage` the bridge went from above the early returns
(where it ran with a `''` club handle during the pre-load phase) to the loaded
tree, fed `commonGame.club_handle` — so nothing pops while the game row loads or
on the error page, neither of which renders a header slot. The unit test lost
its `vi.mock('./useClubChat')` and drives the stream as rerender props;
`GamePage.test.tsx`'s now-dead `useChatFeedback` mock came out (it mocks `Chat`
already). The third shape was declined as generality for callers that don't
exist.

### WORKED · F-chat-12 · getChatOpen-no-caller · a production export only tests call

`getChatOpen()` claimed to be "for code that needs the current value but doesn't
want to subscribe (e.g. inside a click handler)" and had no such caller — the
one click handler that reads the flag, `ChatButton`, already holds `open` from
the hook for its `aria-pressed`. Its real readers are `chatOpenStore.test.ts`
and `AppActionsHost.test.tsx`, where it is the only way to see what `/` did,
since the host renders nothing for chat.

The two shapes: delete it and have both tests observe through `useChatOpen()` in
a `renderHook`, or keep it and let the docstring say it is a test seam. **Joel
chose the second** — a store with no component in it is exactly what a test
needs a plain reader for, the same call the repo already made for `aria-label`
as a test handle. The docstring names the CONDITION rather than the callers, so
it cannot rot as tests come and go.

`scratchpad/scratchpadOpenStore.ts`'s `getScratchpadOpen` sat in the identical
position — "Non-subscribing read", no production caller, read only by
`ScratchpadButton.test.tsx` — and **Joel took the same answer for it in the same
pass**, so the two panels do not drift further apart than their storage
encodings already have them (`chat/todo.md`'s Maybe item).

### WORKED · F-chat-13 · stale-claims, again · nine sentences the worked findings left behind

The re-read greped each worked finding's class across the whole roster, and
F-chat-1's class was the one that recurred — most of it written by F-chat-11
and F-chat-10 themselves, the day before:

- `useClubChat`'s empty-handle guard explained itself by "the GamePage feedback
  bridge runs this before the game row has loaded" — the caller F-chat-11
  removed. `<Chat>` mounts in GamePage's loaded tree with the real handle, so
  nothing passes `''` now. The guard stayed (it is cheap, and `useClubRoster`
  keeps the same one); the comment names the condition, not a caller.
- `useChatFeedback.test.tsx`'s `setup` said "the way every page mounts it";
  `<Chat>` is the only mounter since F-chat-11.
- `e2e/chat.e2e.ts` said the unread count "surfaces in the bubble's accessible
  name, so we assert on that" — the name is a fixed "Chat" (F-chat-1 took the
  computed one out of the store's docstring) and the test asserts on the mark's
  text, as its own inline comment said one line down. One sentence now.
- `chatOpenStore` counted "three things" that flip it and missed the fourth,
  `<Chat>`'s own `!` force-open; and said localStorage "is how the open state
  persists across club ↔ game navigation (each page mounts a fresh tree but
  the store re-initializes from localStorage at module load)". Navigation is
  `navigate()` in one tab, the module loads once, so the value survives on its
  own; the mirror carries it across a RELOAD. Both rewritten.
- `chatUnread` said `<Chat>` "owns the message stream + the open/closed state";
  it reads the flag, the store owns it.
- `useClubChat` said its shape is "the same pattern as every board hook in the
  repo", and its test called the hook "the pattern parent ... every per-game
  board hook repeats it — so the contract is pinned here once". Fourteen game
  hooks take the shape from `useRealtimeRefetch`, which has its own spec, and
  five other specs pin a SUBSCRIBED refetch. Chat is wired by hand because it
  appends each INSERT rather than refetching on it, which the factory does not
  do; both docstrings say that instead. `ClubMessage`'s "resolved by
  `<ChatBody>`" became the three readers.
- `Chat`'s docstring listed its three readers twice (F-chat-11 added the second
  paragraph beside the first), and two inline comments carried a third and
  fourth copy of "why null rather than unmounted" plus "the GamePage header's"
  button (both pages have one) and a "no per-instance mirror needed here" that
  was archaeology. One statement in the docstring; the comments point at it.
- `ChatBody.module.css`'s header restated `FloatingPanel.module.css`'s own
  explanation of how `.body` gets a definite height. A pointer now.

### WORKED · F-chat-14 · hand-rolled-member-lookup, again · `computeUnread` had F-chat-6's `members.find`

F-chat-6 converted `ChatBody`'s `memberFor`; `chatUnread.ts`, one file over,
still wrote `members.find((mm) => mm.user_id === latest.user_id)`. It is
`memberById(members, latest.user_id)` now — the memory this sprint keeps about
re-reads ("a fixed finding still stood in the file next door"), in its exact
form.

### WORKED · F-chat-15 · a guard recommends a token that does not exist

`src/guards/vocabularies.test.ts`'s z-index spec — its docstring and its
failure message — told the offender to pass `var(--z-index-chatPanel)`, the
name F-chat-1 found in `Chat`'s docstring and replaced. The ladder is `--z-chat`
(`base.css`). Two words changed in a file outside the roster and outside this
area; its stamp is `guards`'s to give.

### WORKED · F-chat-16 · `docs/common.md`'s scratchpad bullet named three folders that do not exist

The grep for `chatOpenStore` across the docs landed on "`scratchpadOpenStore`
(`lib/scratchpad/`) mirrors `chatOpenStore`" — and the bullet around it had
`hooks/scratchpad/` and `components/floating-panels/` too, from before the
common reorg. All three are `common/scratchpad/` now (the button is
`common/page-header/`). Fixed in place; the paragraph is the scratchpad area's,
and it will read it again.

### WORKED · F-chat-17 · `todo.md`'s Soon item is a statement, not owed work

The one Soon item — "`ChatBody`'s Tab is the declared step OUT of the panel's
ring, not a bespoke key ... anything touching `ChatBody`'s key handling answers
to `e2e/chat-keyboard.e2e.ts`" — asks for nothing. It is a rule, and the rule
already lives in three places: `doc.md`'s Design ("The keyboard goes both
ways"), `docs/keyboard-shortcuts.md`'s panel row, and the e2e that pins it. The
closing checklist says `todo.md` holds what is still owed; a rule in it reads
as a task nobody can finish. Deleting a line is Joel's word: the shapes were (1)
delete it, leaving the Maybe item as the file's only entry; (2) keep it. **Joel
chose (1)** — the item is gone, and `todo.md` holds the one Maybe.

## Notes

- **The unread badge, decided at the opening (Joel):** the logic may move,
  but the presentational part — the badge, the glyph fill, the colors — stays
  with `ChatButton`. Today's split is already that shape, with one leak: what
  `chatUnread` publishes is a CSS color string, so chat decides how the strip
  paints. Taken up as F-chat-10, which is where the shape and the outcome are.
  `ChatButton` stayed evidence, and gained the test file it lacked.

## Predicted test breaks

None, at any point. `chatOpenStore.test.ts` and `useClubChat.test.ts` were
rewritten on purpose in the prose pass; F-chat-11 rewrote
`useChatFeedback.test.tsx` to drive the stream as props (it now mocks nothing);
F-chat-10 moved one assertion out of `chatUnread.test.ts` into the new
`ChatButton.test.tsx` and renamed the field in the rest. The suite is green
after each.

## Closing

- [x] the whole area re-read in one sitting after the last group (2026-09-12,
  F-chat-13 to F-chat-17)
- [x] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [x] `todo.md` holds everything still owed; nothing durable left in this file
- [x] every file on the roster blessed — sixteen `cs-blessed-chat` (2026-09-12,
  Joel: "bless the files. then close.")
