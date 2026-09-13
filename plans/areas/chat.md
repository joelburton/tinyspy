# Area: chat

The folders it reads: `chat`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — roster agreed 2026-09-12, fifteen files `cs-met-chat`. Not
yet read.**

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

Plus `doc.md` (a lede, no Design; on `DESIGNS_OWED`) and `todo.md` (three Soon
items, one Maybe) — no stamp, markdown.

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

*(`F-chat-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

## Notes

- **The unread badge, decided at the opening (Joel):** the logic may move,
  but the presentational part — the badge, the glyph fill, the colors — stays
  with `ChatButton`. Today's split is already that shape, with one leak: what
  `chatUnread` publishes is a CSS color string, so chat decides how the strip
  paints. To take up when the audit reads `chatUnread.ts`: the store should
  carry a fact (the count and the latest unread sender), and the button should
  turn a sender into a fill. `ChatButton` stays evidence either way.

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
