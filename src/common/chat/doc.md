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

The panel is a floating companion, opened from the speech-bubble mark in the
header or by pressing `/`, and closed from its own titlebar. It stays mounted
while closed, rendering nothing, because two things need the stream while
nobody is looking at it. The first is the unread badge on the header mark: the
count of messages from other people newer than a per-club bookmark that
opening the panel advances. The bookmark is kept in the browser, so a reload
or a return after days still shows what was missed, and a chat never opened
shows everything. The second is the force-open. A message that starts with
`!` is one everyone needs to see now ("shall we stop?", "I have to go in five
minutes"), so the panel opens itself for every recipient when it arrives, and
only when it arrives: one already in the log when you load a page stays put.
The marker is stripped from the shown text and the line is bold.

Because the panel can open itself, it sits above every dim on the page at a
layer of its own, so a `!` message never appears under a setup dialog. Its
open state and its rect are remembered across pages, so moving from the club
to a game does not close the conversation.

The keyboard goes both ways. `/` takes it to chat from anywhere on the page,
even mid-clue, and Tab in the entry box hands it back to the game by blurring,
so the next keystroke plays. The chat entry is the one text field a game page
keeps while the board reads its keys off the window, and this is how the two
share one keyboard.

The header pill is the last piece. A new message from someone else is
announced in the page's global feedback slot as "● name: text", clipped so the
header never reflows, and never for the sender or for the backlog. It reads
the same stream the panel does.
