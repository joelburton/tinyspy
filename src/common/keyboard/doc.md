# keyboard

Every way the app listens for a key that is not an action: the one window
dispatcher every game reads through, the capture core the word games build on,
Tab rings, who owns a keystroke, and backtick-as-Escape. What each key DOES is
[docs/keyboard-shortcuts.md](../../../docs/keyboard-shortcuts.md); this folder
is how a keystroke gets there.

## Design

A play surface has nothing to focus. A board is tiles you click and a word you
type, and the moment a real `<input>` held the word, clicking a tile would blur
it and typing would silently stop. So the games do not use one: they read
keystrokes off `window`, and that single decision is what this folder exists
to make safe. A window listener hears everything — the chat box, a setup form,
a confirm dialog's buttons — and without a rule it would spell a chat message
onto the board. The rule is that focus says who owns the keyboard. A focused
text field owns its keys outright, and a focused floating panel owns the keys
inside it; only when neither is true does a key belong to the game. That
answer is given once, in the dispatcher, and every game-side hook inherits it
by listening through the dispatcher rather than attaching its own listener.

That is also why the folder is a set of small hooks rather than one keyboard
handler. Each adds one meaning to a key on top of the dispatcher: the capture
core turns letters, Backspace and Enter into edits on a pending word; a
feedback hook makes any key dismiss the last verdict; the arrow-history and
board-cursor hooks in their own folders add theirs. A game composes the ones it
wants. Because they all ride the same listener they all share the same gates,
so a new hook cannot forget about chat, and a game that reads the dispatcher
directly, because a letter names a tile rather than a character, still gets
the same protection for free. What stays per game is only what may be entered
and what the extra keys mean; the shape of entry is identical everywhere on
purpose, so a player learns it once.

Tab is the key that needs a different idea, because native Tab does the one
thing this app never wants. It walks the page's focus order out of the board,
onto the header, and then out of the document into the browser's URL bar, and
a player who tabbed by reflex is stranded somewhere their typing reaches
nothing. So Tab is never native here. A surface declares the ring of stops Tab
may visit, in order, and Tab moves within that ring and nowhere else. A page
with a list declares the list; a page with two declares both; a board, which
navigates by clicks and typing and has nowhere for Tab to go, declares
nothing, and an empty ring is a ring, because a Tab that is caught and
consumed cannot escape while one that is merely ignored can. Reachability
becomes a list you edit rather than a set of elements you remember to mark
unfocusable. Rings stack by mount order, so a dialog opened over a page is
innermost and wins until it closes, and no one writes that ordering down.

The shell's own keys — a slash to reach chat, a question mark for the page's
menu, a tilde for word lookup, the anagram finder — are no longer here. They are
actions (`common/actions`), bound once at the app root, because each is a
command that also wants a menu row and a name, and writing it as a key alone
meant writing it twice. What this folder still owns for them is the question of
whom a keystroke belongs to: the two predicates in `editableField.ts` are what
let a player mid-clue hit slash to chat while a form field or the chat box keeps
the character literal.

Backtick standing in for Escape stays, and is a different idea: one listener at
the root re-dispatches a synthetic Escape so every existing Escape handler works
on a keyboard with no Escape key, at the cost of the backtick as a character
everywhere. It translates a key rather than doing something a button could do,
which is why it is not an action either.

Three listeners live outside this folder and belong outside it: the game
page's menu shortcuts, the crosswords grid, and the menu. Each wants something
the dispatcher rules out — Option chords, Tab as a game move, keys while a
menu is open — and each owns its listener and restates the gate it needs. The
line is that this folder holds what a surface composes, and a surface that
spends a key differently owns that key itself.

## Details

**The dispatcher registers once and dispatches into the latest closure.** A
game's handler closes over fresh state every render, so the listener is
attached one time and calls through a ref that an effect refreshes each render.
The alternative, re-registering on every render or enumerating every variable
the handler reads in a deps array, is what the indirection avoids. The same
trick is used by the tab ring for its list of stops.

**Two gates, and the second is a DOM marker.** The text-field gate is the tag
name or `isContentEditable`. The floating-panel gate is `closest('[data-floating-panel]')`,
the attribute the panel shell stamps, which is how a setup dialog can be a real
form floating over a live game with no game knowing it is there. The same
attribute is read by the panels' own escape and focus-trap hooks and by the
crosswords listener, so it is the contract between this folder and the panels,
and it is spelled by hand at every reader.

**The is-this-a-text-field test is one predicate, in `editableField.ts`.**
`isEditableField` is "this field owns its keys"; `isNonGameField` adds "and it
is not the game's own input", which is the gate the app-wide keys use so slash
still reaches chat from a clue field. Four listeners each wrote the test out
before, and the fourth omitted `<select>`.

**Modified chords belong to the browser, by convention rather than by the
dispatcher.** Each handler bails on Cmd, Ctrl and Alt itself, so Cmd-R and
Ctrl-Tab keep working; the dispatcher does not do it for them, and a handler
that forgets gets a modified key it never wanted.

**The capture core is the universal half of text entry.** Modifier bail, the
Tab swallow, dismissal on any key, Backspace, Enter only when non-empty, and a
length cap are the same in every game. `charFor` is the per-game piece, and
`asciiLetters` covers the word games in either stored case. The history arrows
are not here: they belong to the entry box, and a game whose letters land on
the board rather than in a box uses the core alone and gets no arrows.

**An extra key is a board key, not an entry key.** `onExtraKey` runs before
the core's hard-off and busy gates, so a Space that shuffles the letters works
on a finished board and mid-submit, matching its button, which is live in both
states. The order of the gates is the rule: dismissal and extra keys first, then
the hard-off, then the Tab swallow, then busy, then edits.

**A ring is refs, read at keypress.** Stops are refs rather than elements so a
stop can be declared before it renders and an absent one, like a column the
phone layout hides, is simply skipped; a stop that is not on screen is not a
stop. Focus that is on no stop, most often `<body>` after a click on blank
page, enters the ring at the end Tab would naturally reach, so a stray click
costs one press to undo. The ring consumes Tab before it decides where to go,
which is what makes an empty ring inert rather than leaky. A guard in the ring
still lets native Tab run inside a floating panel or menu, for overlays that
have not declared rings of their own; it is the piece innermost-wins is meant
to replace, and it stays until those overlays declare.

**`useSwallowTab` is the empty ring, written before rings existed.** The games
that read the dispatcher directly call it; the capture core carries the same
swallow in its own clause, and two games write it inline. All of them consume
rather than ignore, which is the property that matters. They are one statement
in several spellings.

**Handing the keyboard back means having nothing focused.** Focusing the board
is not a thing that can be done, since the board reads from `window`; so the
chat box and the scratchpad answer Tab by blurring themselves, which is the
whole move. Shift+Tab is left native there so a panel's own close button stays
reachable. The other direction is the slash shortcut, which focuses the chat
entry from anywhere.


**Backtick is lost as a character in every text field.** The listener runs in
the capture phase on `window` and does not skip editable targets, so chat, the
scratchpad, a clue field and every form give up the backtick. It is a real
cost taken for an Escape key on keyboards that lack one, and the synthetic
Escape is untrusted, so the listener cannot react to its own re-dispatch.

**Escape is not handled here.** It stays "close what is on top," and the
floating panels own it.
