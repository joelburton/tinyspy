# home

The landing page after login: the list of clubs you belong to, and the button
that adds one. Nothing here is a lobby.

## Intro to area

A club is the venue friends play in, and it exists between sessions. So the
page `App` renders at `/` — and at any path it has no route for — is the list
of your clubs, the rooms you can walk into, and the one act that adds a room.
There is nothing to browse or join and no game on this page, because the app
has no public lobby: games happen inside clubs, so the home page's whole job is
getting you into one.

The list is the page. It takes focus on arrival, the keyboard's Tab ring holds
nothing else, and choosing a row goes into the club. Creating a club opens a
modal over the list rather than a page of its own, because creating is "add to
this list", and it is the uncommon path — most visits are a click into a club
you already have.

Your own solo club is a club like any other in this list. It sorts to the top
and wears a Solo badge, and that is the whole difference, so playing alone
needs no second shape to learn. The list is one read of `common.clubs`, which
RLS filters to your memberships, plus a Realtime subscription to your own
`clubs_members` rows: an insert or delete there refetches the whole list, so a
club you create or are added to appears without a refresh.

## Details

**Creating a club is a modal over the list**, not a page, because the act is
"add to this list"; on success the page goes into the new club. It is the
uncommon path — most visits are a click into a club you already have — so the
button wears the quiet tone.

**An empty list means three different things.** Before the read answers, the
frame holds a blank line; a read that failed says so; an answer of no rows says
no clubs were found. Rendering the same empty frame in all three would tell a
player they belong to no clubs at the moment the app does not know yet.

**Zero rows is a fault the page raises itself.** Claiming a username creates a
solo club atomically with the profile, so an account always has at least that
row; none means the account is broken. The server cannot say so — it answered
a well-formed query — so the page raises the fault with its own transport
facts, on every load: the list refetches on membership events, and a broken
account does not improve by being mentioned once. A read that merely *failed*
raises nothing here, because `readRows` already reported it.

**The tab ring is one stop**, the clubs list, which takes focus on arrival. So
`+ New club` and the header menu are not reachable by Tab — the accepted cost
of giving the keyboard the act you came to do. The ring is also the way back
after clicking blank page blurs the list.

**The order is the database's**: `is_solo` descending, then newest first. The
page renders one array in one order and re-derives neither. The read sends no
user id; RLS filters it to the caller's memberships, and a solo club has only
its owner as a member, so it surfaces through the same query. The re-read is a
subscription to the caller's own `clubs_members` rows.

**The greeting leads with the identity disc** in your profile color — the "this
is you" marker the app uses everywhere (docs/ui.md → Player identity) — so the
name comes first. The profile can land after first paint, so the heading may
swap from "Welcome!" to the disc and name; both are one line and the disc sits
inside the h1's line box, so nothing below it moves.

The card's height bound and the scrolling list are
[docs/ui.md](../../../docs/ui.md)'s; the clubs schema and solo clubs are
[docs/common.md](../../../docs/common.md)'s.
