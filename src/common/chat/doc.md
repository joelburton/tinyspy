# chat

The club's chat, end to end: the floating panel you talk in, the stream of
messages behind it, the unread badge on the header mark, and the pill that
announces a new message. It belongs to no page; the club page and every game
page mount it.

## Design

A club is a group of friends, and the chat is the conversation they keep
between and during games. There is one thread per club, not per game. The
messages live in a table keyed by club handle, every member can read them,
only the `send_message` RPC can write one, and a fresh page loads the last
week of them rather than the whole archive. Live messages arrive over Realtime
and are appended; a reconnect refetches, and a refetch never drops a message
that arrived while its query was in flight, so the log is append-only in the
client as well as in the table. The table, the policy and the RPC are
[docs/common.md](../../../docs/common.md)'s.

A page connects to all of it through one seam: it mounts `<Chat>` and hands it
four things. `clubHandle` says which conversation. `members` is the full club
roster — the whole club, not this game's players, so a message from someone who
isn't playing still resolves to a name and a color. `selfId` is the viewer,
whose own messages are never unread and never pop. `globalFeedbackSlot` is the
page's header slot, which chat may write a pill into. That is the whole
contract: the page never sees a message, never holds chat state, and never
learns whether the panel is open.

`<Chat>` stays mounted for the life of the page and renders nothing while
closed, because it owns the club's one subscription and three things read that
stream while nobody is looking at the panel. The first is the unread badge on
the header mark: the count of messages from other people newer than a per-club
bookmark that opening the panel advances. The bookmark is kept in the browser,
so a reload or a return after days still shows what was missed, and a chat
never opened shows everything. The second is the force-open. A message that
starts with `!` is one everyone needs to see now ("shall we stop?", "I have to
go in five minutes"), so the panel opens itself for every recipient when it
arrives, and only when it arrives: one already in the log when you load a page
stays put. The marker is stripped from the shown text and the line is bold. The
third is the pill: a new message from someone else is announced in the page's
global feedback slot as "● name: text", clipped so the header never reflows, and
never for the sender or for the backlog. All three read the one copy — so a page
that wants any of them mounts the panel, which every page that has chat at all
does anyway.

Open — from the speech-bubble mark in the header or by pressing `/`, and closed
again from its own titlebar — the panel is a `<Companion>`: the shared
floating-panel shell owns the drag, the remembered rect, the layer and the
Escape ranking, and the `<ChatBody>` inside it is the transcript and the
composer, turning a `user_id` into a handle through the roster it was given and
sending through the RPC. Because the panel can open itself, it sits above every
dim on the page at a layer of its own, so a `!` message never appears under a
setup dialog. Its open state and its rect are remembered across pages, so
moving from the club to a game does not close the conversation.

Nothing holds both the panel and the header mark — `<ChatButton>` is in the
page header, `<Chat>` is at the bottom of the page, and neither is the other's
parent — so two small module-level stores stand between them instead of props.
`chatOpenStore` holds the open flag, persisted, and also records that a panel is
mounted at all, which is how the `/` shortcut knows whether this page has a chat
to bind. `chatUnread` holds the badge's count. `<ChatButton>` subscribes to
both, drawing the badge and flipping the flag; `<Chat>` reads the flag and
writes the count. Neither knows the other exists.

The keyboard goes both ways. `/` takes it to chat from anywhere on the page,
even mid-clue, and Tab in the entry box hands it back to the game by blurring,
so the next keystroke plays. The chat entry is the one text field a game page
keeps while the board reads its keys off the window, and this is how the two
share one keyboard.

The whole of it, then:

```
page ──mounts──> <Chat> ──> useClubChat ──> common.messages
                   │                        (Realtime INSERTs in, the RPC out)
                   ├─ unread badge ─────> chatUnread
                   ├─ `!` force-open ───> chatOpenStore
                   ├─ pill ─────────────> the page's global feedback slot
                   └─ <Companion> ──> <ChatBody>   (only while open)
```

`<ChatButton>` in the header, and the `/` action, read and flip those two
stores — which is the whole of how the page's chrome and the panel reach each
other.
