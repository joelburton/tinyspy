# menu

The one menu, the two stores beside it, and what a game puts in it.

## Design

There is a single `<Menu>` — the mark in every page header — and everything
else here exists so a caller can hand it rows without also handing it
decisions. A row is an **action** (`common/actions`), so its words, its glyph,
its key hint and whether it applies today all arrive with the binding; the only
row that is not an action is a submenu, and it earns that by not being one
(opening is the whole behavior, so there is nothing to run and no key to
advertise). `menuRow` is the one place a row is read on its way in, which is
what lets `<Menu>` lay out labels and glyphs without ever asking what kind of
row it has.

**Two module slots sit beside the component, and they are the same shape for
the same reason.** One page is mounted at a time and it has one header menu, so
there is nothing to arbitrate:

- `pageMenuStore` holds *how to open* the menu, so the `?` key can reach it
  without three pages each carrying a ref across.
- `gameMenuStore` holds *what a game has pushed into* it.

The second one is worth its own sentence, because it was a `useState` on the
game page and the difference is not only speed. Pushing a menu re-rendered the
whole page, board included, for a change nothing outside the menu can see — and
it quietly made the IDENTITY of a menu row load-bearing, since a game's menu
effect lists its rows in its deps: a row rebuilt each render would set state,
re-render, rebuild and loop. That is a trap laid for whoever writes the next
row. With the store, a game re-rendering costs the menu nothing and a menu push
costs the game nothing, and stable identities are back to being an optimization.

**A game owns its WHOLE menu**, framing included — `buildGameMenu` assembles
the standard shape (Help and chat above, the game's own sections, then the
exits and Back to club) rather than the shell injecting anything. That is what
lets a menu as long as crosswords' exist without the shell knowing about it.
