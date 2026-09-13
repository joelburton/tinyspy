# Area: chat

The folders it reads: `chat`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-12, fifteen files `cs-audited-chat`. Twelve
findings: nine worked (F-1 to F-8 in the prose pass, F-11 after Joel's
decision), three open and waiting on a decision (F-9, F-10, F-12). The
`doc.md` Design is written and the row is off `DESIGNS_OWED`.**

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

Plus `doc.md` (lede rewritten and Design written in the prose pass; off
`DESIGNS_OWED`, the guard planted red first) and `todo.md` (two Soon items
after F-chat-7 took one, one Maybe) — no stamp, markdown.

**Evidence, not roster — read and judged, findings recorded, fixed in place,
but never stamped, because a stamp is per file** (the ruling `supabase` and
`definitions` made): `supabase/sql/common.sql`'s chat pieces — `send_message`,
the `messages_select` policy, the grants on `common.messages` — and
`common.messages` itself in the baseline migration (`20260615000000_common.sql`).
Joel asked at the opening that the schema and RPCs be audited, and they are,
in this sense.

Consumers: `club/ClubPage` and `game-page/GamePage` (mount `<Chat>`),
`actions/AppActionsHost` + its test (the `/` action), `page-header/ChatButton`
(blessed; reads `chatOpenStore` and `chatUnread`). The three guards that name
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

### F-chat-9 · vocabulary · `ChatBody.module.css` carries six literals the ramps cover

`gap: 0.4rem` / `0.3rem`, `font-size: 0.9rem` (twice), `line-height: 1.35`,
`border: 1px`. The `max(16px, 1em)` iOS floor is deliberate and stays
(`docs/mobile.md` → Decisions #3); the two paddings are outside the spacer
vocabulary by `core-css/todo.md`. Converting moves the look: the message text
would go from 0.9rem to `--font-size-2` (0.85rem), the line height from 1.35
to `--line-height-2` (1.25), the gaps to `--spacer-4` (0.5rem) and
`--spacer-5` (0.25rem). Same question `definitions` answered "all"; waiting on
the same answer here.

### F-chat-10 · unread-store-publishes-a-color · chat decides how the strip paints

`computeUnread` returns `{ count, color }` where `color` is a CSS string —
`colorVarFor(member.color)`, or the muted fallback when the roster has not
named the sender. That is a presentational decision made in chat's file and
handed to a blessed `page-header` button that only forwards it. Joel's ruling
at the opening: the logic may move, the presentational part stays with the
button. The shape that honors it: the store carries a fact — `count` and the
latest unread `sender: Member | null` — and `ChatButton` turns a sender into a
fill, including the muted case. Touches `chatUnread.ts`, its test, `Chat.tsx`
(the open-branch reset) and two lines of `ChatButton.tsx`.

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

### F-chat-12 · getChatOpen-no-caller · a production export only a test calls

`getChatOpen()` — "for code that needs the current value but doesn't want to
subscribe (e.g. inside a click handler)" — has no such caller; only
`AppActionsHost.test.tsx` reads it, as a handle on the store. Either the test
reads through the hook and the export goes, or it stays as the test's handle
with a docstring that says so. Small, and still open.

## Notes

- **The unread badge, decided at the opening (Joel):** the logic may move,
  but the presentational part — the badge, the glyph fill, the colors — stays
  with `ChatButton`. Today's split is already that shape, with one leak: what
  `chatUnread` publishes is a CSS color string, so chat decides how the strip
  paints. To take up when the audit reads `chatUnread.ts`: the store should
  carry a fact (the count and the latest unread sender), and the button should
  turn a sender into a fill. `ChatButton` stays evidence either way.

## Predicted test breaks

None from the prose pass; `chatOpenStore.test.ts` and `useClubChat.test.ts`
were rewritten on purpose and pass. F-chat-11 broke nothing either:
`useChatFeedback.test.tsx` was rewritten to drive the stream as props (it now
mocks nothing), and the whole unit suite is green.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
