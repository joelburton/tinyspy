# members

Who someone is, the color that identifies them, and the two marks that show it —
a disc on its own, or a disc beside a name. Also the small operations every list
of people needs: put the viewer first, and answer who a `user_id` belongs to.

## Design

Identity in this app is two things, a name and a color, and the color is the
interesting half. It is not a value the frontend picks: it is a NAME, one of
eight words, constrained by the database and stored on the profile. Everything
here exists to turn one of those words into something on screen, which is why
no file in this folder contains a hex and why the picker, the check constraint
and the resolver all have to agree about the same eight words.

The second idea is what keeps the folder small: that color is carried by
exactly one shape — a filled circle — and never by text. A player's name is
always ordinary ink. The rule buys something concrete rather than being a
matter of taste: a surface with no room for a name can fall back to the circle
alone and lose nothing, because a player has already learned that the circle is
the person. It also settles arguments that would otherwise be re-had per
screen, since "should this name be their color?" has one answer everywhere.

That is why the name-and-disc pair lives here rather than with any of the
screens that render it. A turn-log row, a feedback pill announcing what a
teammate found, a winner line and a chat message are all saying the same thing
— *this person* — and the moment each one assembles its own name-plus-circle,
they start to differ.

## Details

**The types are types only, and that is load-bearing.** `Member` is the most
imported name in the app, so `member.ts` holds no runtime value at all: every
one of those imports erases at compile time and none of them can drag the file
into an import cycle. The one function that reads these types is deliberately
somewhere else. `GamePlayer` is the same shape plus what only exists once
someone is seated in a game — whether they quit the race, when, and how they
finished.

**The eight color names are written out in more places than this folder.** The
CHECK on the profile column, the array that picks a starting color, and the two
RPC allow-lists all spell them, and so does `MEMBER_COLORS` here. They are kept
honest by `src/guards/memberPalette.test.ts` rather than by comments asking
someone to remember, because the ways they can drift apart are all quiet ones —
a color the database accepts and the frontend cannot resolve simply renders
wrong, and a color the picker offers but an allow-list rejects only fails at
the moment a player saves it.

**Two resolvers, because a disc is a fill and a ring.** Each palette name has a
fill token and a paired edge token, darkened so a light fill like yellow still
reads against the page; `colorVarFor` and `borderVarFor` return references to
them, never values. Both answer body-text color for a name they do not know, so
a roster that has not loaded and a color from a newer database render as a
neutral disc instead of a broken variable. The functions are named for the CSS
property they feed while the tokens are named for the part of the disc they
paint, which is a real inconsistency and is written down in `todo.md`.

**The disc is a styled element, never a `●`.** A glyph cannot wear the ring
that makes a light color legible, and its size and baseline move with the font.
`<Dot>` also has two variants worth knowing before drawing one by hand: hollow,
which means nobody — an away member, a word no one found — and on-color, for a
disc sitting on a saturated tile, where the ring goes to the on-dark ink because
white is what separates any disc from a strong fill.

**The mention comes in two orders and one of them is not decoration.**
Each is named in the order it draws: `<ActorDot>` is actor-then-dot, which is
what a table row wants; `<DotActor>` is dot-then-actor, which is what a
sentence wants. What makes
the pair worth a component rather than two spans is the `show` prop: because
the name is a real element rather than text baked into a string, a phone can
drop it globally and leave the disc, which is the fallback the whole
one-shape-carries-color rule is built to allow.

**Reading order is a fact about people, not about any game.** Every list of
players in the app is read "you, then the others," and sorting the others
alphabetically rather than by score means the list stays put while the game
moves — a strip that reorders itself mid-play cannot be read at a glance.

**One file here is not production code.** `gamePlayer.fixture.ts` builds
`GamePlayer` literals for tests, and carries `.fixture` in its name so that is
visible without opening it.
