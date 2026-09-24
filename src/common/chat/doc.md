# chat

The club's chat, end to end: the floating panel you talk in, the stream of
messages behind it, the count behind the unread badge on the header mark, and
the pill that announces a new message. It belongs to no page; the club page
and every game page mount it.

## Intro to area

A club is a group of friends, and the chat is the conversation they keep
between and during games. There is one thread per club, not per game: the
messages live in a table keyed by club handle, every member can read them,
only the `send_message` RPC can write one, and a fresh page loads the last week
of them rather than the whole archive. Live messages arrive over Realtime and
are appended, and a reconnect refetches without dropping anything that arrived
while the query was in flight, so the log is append-only in the client as well
as in the table.

A page connects to all of it through one seam: it mounts `<Chat>` and hands it
the club, the club's full roster, the viewer, and the header slot a pill may be
written into. The page never sees a message, never holds chat state, and never
learns whether the panel is open. `<Chat>` stays mounted for the life of the
page and renders nothing while closed, because it owns the club's one
subscription and three things read that stream while nobody is looking at the
panel: the unread badge on the header mark, the force-open a `!` message
triggers, and the pill that announces a new message.

The panel itself is a `<Companion>`, the shared floating-panel shell, with the
transcript and the composer inside it. It opens from the header's speech-bubble
mark or the `/` key, and its open state and position follow you from the club
page into a game. The header mark and the panel share no parent, so two small
stores stand between them instead of props. The table, the policy and the RPC
are [docs/common.md](../../../docs/common.md)'s.

## Details

**The four props are the whole contract.** `clubHandle` says which
conversation. `members` is the full club roster — the whole club, not this
game's players, so a message from someone who isn't playing still resolves to a
name and a color. `selfId` is the viewer, whose own messages are never unread
and never pop. `globalFeedbackSlot` is the page's header slot, which chat may
write a pill into.

**The unread badge** on the header mark is the count of messages from other
people newer than a per-club bookmark that opening the panel advances. The
bookmark is kept in the browser, so a reload or a return after days still shows
what was missed, and a chat never opened shows everything.

**The force-open.** A message that starts with `!` is one everyone needs to see
now ("shall we stop?", "I have to go in five minutes"), so the panel opens
itself for every recipient when it arrives, and only when it arrives: one
already in the log when you load a page stays put. The marker is stripped from
the shown text and the line is bold.

**The pill.** A new message from someone else is announced in the page's global
feedback slot as "● name: text", clipped so the header never reflows, and never
for the sender or for the backlog. All three readers use the one copy of the
stream — so a page that wants any of them mounts the panel, which every page
that has chat at all does anyway.

**Opening and closing.** Open from the speech-bubble mark in the header or by
pressing `/`; closed again from the mark, the panel's own titlebar or Escape.
The `<Companion>` shell owns the drag, the remembered rect, the layer and the
Escape ranking, and the `<ChatBody>` inside it is the transcript and the
composer, turning a `user_id` into a handle through the roster it was given and
sending through the RPC. Because the panel can open itself, it sits above every
dim on the page at a layer of its own, so a `!` message never appears under a
setup dialog. Its open state and its rect are remembered across pages, so
moving from the club to a game does not close the conversation.

**The two stores.** Nothing holds both the panel and the header mark —
`<ChatButton>` is in the page header, `<Chat>` is at the bottom of the page's
tree, and neither is the other's parent — so two module-level stores stand
between them. `chatOpenStore` holds the open flag, persisted, and also records
that a panel is mounted at all, which is how the `/` shortcut knows whether
this page has a chat to bind. Where it has none (the home page), `/` answers
`hidden` and is left to the browser's find-in-page: a key that silently does
nothing is worse than one that isn't bound, because whoever debugs it starts
from "chat is broken" rather than "chat isn't here". `chatUnread` holds the badge's count, and with it
the palette-color name of the latest unread sender — a fact, not a paint:
resolving a sender needs the roster, which only this side has, while what the
mark then looks like is the mark's own decision. `<ChatButton>` subscribes to
both stores, drawing the badge and flipping the flag; `<Chat>` reads the flag,
writes it on a `!`, and writes the count. Neither knows the other exists.

**The keyboard goes both ways.** `/` takes it to chat from anywhere on the
page, even mid-clue, and Tab in the entry box hands it back to the game by
blurring, so the next keystroke plays. The chat entry is the one text field a
game page keeps while the board reads its keys off the window, and this is how
the two share one keyboard.

**Who renders it, and what it renders.** Two pages mount the panel; the
header mark is not its child:

```
ClubPage (club) · GamePage (game-page)
└── Chat                              for the life of the page; draws nothing while closed
    └── Companion (floating-panels)   while open
        └── ChatBody                  the transcript and the composer; DotActor (members) names each sender

PageHeader (page-header) → ChatButton   the header mark, reached through the two stores rather than props
```

The whole of it, then:

```
page ──mounts──> <Chat> ──> useClubChat ──> common.messages
                   │                        (Realtime INSERTs in, the RPC out)
                   ├─ unread badge ─────> chatUnread
                   ├─ `!` force-open ───> chatOpenStore
                   ├─ pill ─────────────> the page's global feedback slot
                   └─ <Companion> ──> <ChatBody>   (only while open)
```

`<ChatButton>` in the header reads both stores and flips the flag; the `/`
action asks `chatOpenStore` whether a panel is mounted and flips the same flag.
That is the whole of how the page's chrome and the panel reach each other.
