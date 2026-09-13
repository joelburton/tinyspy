# lists

The columns of rows a page puts in front of you, sorted by what choosing a row
does: a list you move a cursor through and choose from (`SelectionList`), a
small framed list you read and scroll (`SimpleScrollableList`), and the dropdown
that narrows what some other list or readout shows without ever taking the
keyboard (`FilterSelect`).

## Intro to area

From the outside, most of what this app draws is a column of rows. The clubs on
the homepage, the games in a club, the results in the anagram finder, the
options under a filter, the commands in a menu, the words you have found: all
rows, all much the same shape. What tells them apart is not how they look but
what happens when you choose one, and who is holding the keyboard while you
look. This folder holds the answers that are not a menu, not a form field, and
not a readout.

The first answer is the list you are *in*. On the homepage and the club page,
the list is the page's main structure, and choosing a row does the thing at
once: you land on the club, the setup dialog opens, the puzzle starts. There is
no "selected" state to hold, because by the time one would show you have left.
So `SelectionList` is built around one cursor and one act. The framed container
is the thing that holds focus, its rows are plain elements that never do, and
arrows move a cursor through them that Enter acts on. Because that cursor is an
alternative to clicking, and someone using the mouse has no use for one, it
stays hidden until an arrow asks for it, and Enter does nothing at all until
then. The whole keyboard, and the reasoning behind each key, is written once in
docs/ui.md → Selection lists.

The second answer is the list you *read*. The anagram finder's results are
rows you look through and might click, not a place the keyboard lives, so
`SimpleScrollableList` has no cursor and no keys. Its one job is size: it states
its height in rows, owns what a row is, and stops growing at the cap, so a
short answer makes a short box and a long one scrolls and never shows a half
row at the bottom.

The third answer is not a list you are in at all. A `FilterSelect` sits above a
list or a readout and changes what it shows. During a game the keyboard belongs
to the board, and a native `<select>` would take it and give it back only by
accident, so this one is a button and a popover that refuse focus outright. The
board keeps every keystroke while the options are open, which is honest,
because that is where the keys are going.

Two things hold across all of them. The frame is always drawn, and every
nothing-here message goes inside it, as the shared `.emptyState`, so a page's
furniture does not come and go with its contents. And each component states its
own whole look. A page that wants a variant asks for one by prop — a list that
fills its column, a packed row, roomier padding on a filter — rather than
reaching in with a descendant selector, which is how copies of one look drift
apart.

## Details

- **What is not here, and why.** The line that decides membership is *you pick
  exactly one thing*; docs/ui.md → Selection lists draws it. A menu is actions
  and closes (`common/menu`); a `SelectField` is a real form control that takes
  focus on purpose (`common/fields`); `WordList` and `TurnLog` are readouts you
  do not pick from.
- **Two kinds of cursor.** `SelectionList`'s is a selection cursor, hidden
  until asked for. A board's is geographic, always shown. The taxonomy and the
  test between them live in docs/ui.md → Selection lists → Choosing, and the
  one mark.
- **`.emptyState` is self-sufficient.** Do not also pass `muted`; it loads later
  and takes the font-size back. The pattern is
  `core-css/patterns/empty-state.css`.
- **The filter's popover is a satellite, not a rung.** It reads its host's tier
  through `--z-host`, and a host that is not the page declares that on itself.
  docs/code-conventions.md → The z- layers.
- **Driving a `FilterSelect` in a test** is `filterSelectHelpers.ts`: the
  options exist only while it is open, and you pick by visible label, since no
  value is in the DOM.
