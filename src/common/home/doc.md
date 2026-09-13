# home

The landing page after login: your clubs.

## Design

The page is one list and the button that adds to it. That is the whole of it,
and it is what the club is for: a club is a venue that exists between sessions,
so landing on the list of yours is landing on the set of rooms you can walk
into. Nothing here is a lobby — there is nothing to browse, nothing to join,
and no game on this page at all.

**The keyboard ring is that one list.** Tab cycles a ring the page defines, the
ring holds the clubs list and nothing else, and the list takes focus on arrival
so the arrows work without a first Tab. The accepted cost is that `+ New club`
is not reachable by keyboard from here. It is the right trade for a page whose
job is "pick the room you're going into": the keyboard gets the act you came to
do, and creating a club is the uncommon path — which is also why the button
wears the quiet tone rather than looking like the thing to press. The ring is
also the way back, since clicking blank page blurs the list and no other key
would return the keyboard.

**An empty list means three different things, and only one of them is
ordinary.** Before the read answers, there is nothing to say — so the frame
holds a blank line rather than a sentence, because both real sentences would be
lies while the answer is in flight. A read that failed says so. An answer of no
rows says no clubs were found. Rendering the same empty frame in all three
would tell a player they belong to no clubs at the exact moment the app does
not know yet, which is the failure this split exists to prevent.

**Zero rows is a fault, and it is the page's own to raise.** Claiming a
username materializes a solo club atomically with the profile, so a signed-in
account always has at least that one row. An answer of none means the account
is broken. The server cannot say so: it answered a well-formed query correctly,
and the invariant is the app's, not the query's — whoever detects a condition
writes its words. So the page raises the fault itself, with its own transport
facts, and a read that merely *failed* raises nothing here, because the read
layer has already reported that one. The fault fires on every load rather than
once per mount: the list refetches on realtime membership events, and nothing
about a broken account improves by being mentioned once.

**Solo clubs are marked, not separated.** Your own solo space is a club like
any other — it sorts to the top and wears a Solo badge, and that is the entire
difference. It is the default landing spot for playing alone, and leaving it in
the list is what makes it discoverable without teaching a second shape. The
order is the database's: `is_solo` descending, then newest first, so the page
renders one array in one order and re-derives neither.

**Creating a club is a modal, not a page**, because the act is *add to this
list* and the list should still be there behind it. It holds no open/shut state
of its own — mounting opens it, unmounting closes it — and on success the page
goes straight into the new club, which is what you made it for.

**The greeting leads with the identity disc**, in your own profile color. That
marker means "this is you" everywhere in the app, and home is where re-stating
it earns its place: it is the last thing you see before entering a club, and
inside a game the disc is how you find yourself on the board. So the name comes
first and the greeting second. The name arrives with the profile, which can land
after first paint, so the heading may swap from "Welcome!" to the disc and name;
both are one line, and the disc is sized inside the h1's line box, so nothing
below it moves.

The clubs read is filtered by RLS to the caller's memberships, so the page
sends no user id with it; solo clubs have only their owner as a member and
surface through the same query. The list stays live off the caller's own
`clubs_members` rows, so a club you are added to or removed from arrives
without a refresh. The card's height bound and the scrolling list are
[docs/ui.md](../../../docs/ui.md)'s; the clubs schema and solo clubs are
[docs/common.md](../../../docs/common.md)'s.
