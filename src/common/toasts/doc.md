# toasts

The bottom-right announcement stack: a store any code can push an announcement
into, the one host that draws whatever the store holds, and the card each
announcement becomes. [docs/ui.md → Toasts](../../../docs/ui.md) says which
news belongs here at all.

## Intro to area

Most of what the app tells a player is an answer to something they just did,
and it appears where they did it. Some of it is news from other people, and
that goes to the header. What is left over is neither: a friend added you to a
game, a game you just deleted on a page with nowhere to say so, a heads-up that
someone in the club is setting up a game. That kind of message is an
announcement. It is something you are told rather than a verdict on a move, and
it can arrive while you are on any page at all. docs/ui.md draws that line;
this folder is the surface those announcements land on.

The places that have such news are scattered across the app: a page, a hook, a
watcher that renders nothing. None of them should have to know where the
corner is or what is already sitting in it. So the folder is built around a
small store. Anything with an announcement pushes it in, and one host, mounted
once at the root of the app, draws whatever the store holds as a column in the
corner. The store is the whole interface, and a caller never touches the host.
That is what lets an invitation and a deletion notice share one stack instead
of each inventing a place to land, and it is why a console helper can pop a
toast on demand: everything that appears came through the same function.

An announcement has to be noticed, and the caller says how long it should
wait. By default a toast stays until a person deals with it, because an
invitation has to still be there when you come back to the tab. A caller whose
news goes stale on its own gives the toast a clock, and it leaves by itself.
The card offers a person two ways to deal with a toast, the ✕ and its one
optional action button, and those are not the same act: acting on an
invitation is joining the game, dismissing it is deciding not to. The folder
keeps them apart. A caller's dismissed callback fires for the ✕ only, never for
the button and never for the clock, because a toast that was acted on or timed
out was dismissed by nobody. Getting this wrong is invisible until an
invitation is marked handled that its recipient never saw, so the card's test
pins both directions.

Some announcements reflect live state rather than a moment. The invitation
list is one, and so is the club's heads-up that a game is being set up. For
those a toast should appear when the state does, refresh when it changes, and
go when it goes. The store makes that cheap with one rule: pushing a toast
under an id that is already showing replaces that toast in place, keeping its
spot in the stack. A source can re-push its entire list on every change and
nothing flickers or reorders, and when a thing disappears the source dismisses
its toast by the same id.

A toast is deliberately not a floating panel. A panel is something you work
in: you drag it, leave it open, and it remembers where it was. A toast is
something you are told, so it does not ride on the floating-panel shell. It
cannot be moved, several of them stack, and a flood of them scrolls inside the
corner rather than making the page grow.

## Details

- **Newest nearest the corner.** The store appends, the host renders in DOM
  order as a plain column, so the newest card sits at the bottom and older ones
  climb above it.
- **The host portals to `<body>`**, so no ancestor's stacking context can trap
  it and `--z-toast` means what base.css says: above chat and any window you
  left open, below a modal that stops the world.
- **The stack is capped to the viewport and scrolls inside itself.** Cards do
  not shrink when it overflows. This is what keeps the page-never-scrolls
  invariant (docs/ui.md → Page-height fits the viewport) under a flood.
- **Horizontal inset follows the page gutter; the bottom does not.** The right
  inset and the width cap read `--page-padding-x`, so a card lines up with the
  content behind it and runs nearly edge to edge on a phone. The bottom keeps a
  hand-written `1rem`, because that edge is where a thumb rests and where a
  phone draws its home indicator.
- **Omitting `ms` means no clock.** Nothing applies `DEFAULT_TOAST_MS` for you;
  a caller that wants a self-clearing toast passes it. The constant's docstring
  says why it is longer than a feedback pill's.
- **Tone colors the left stripe and nothing else.** A toast is an
  announcement, not a verdict, so the meaning is in the words. The stripe's
  width is `--toast-stripe-width`, named for the thing it belongs to rather
  than shared with the frame width it happens to equal: a frame encloses, and
  this marks one edge.
- **`window.puptoast()` pops one from the console**, and it is installed in
  production too, for the reason `window.pupfault` gives. docs/ui.md → Toasts
  says how to use it and what it shows.
