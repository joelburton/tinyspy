# keyboard

Who owns a keystroke, where Tab may go, and backtick standing in for Escape.
What a key DOES is an action ([`common/actions`](../actions/doc.md)); this
folder holds the three questions that are about keys in general rather than
about any one of them.

## Design

The premise is still the one that made this folder: a play surface has nothing
to focus. A board is tiles you click and a word you type, and the moment a real
`<input>` held the word, clicking a tile would blur it and typing would silently
stop. So the games read keystrokes off `window` — and a window listener hears
everything, the chat box and a setup form and a confirm dialog's buttons
included.

**What changed is that the reading moved out.** A key is a command, a command is
an action, and one listener at the app root fires whichever action answers. So
the fifteen hooks and branches that used to read keys here are gone, and what is
left is the part that was never about a particular key.

**Whose keystroke is it?** `editableField.ts` is the whole answer, and it is two
predicates because there are two questions. `isEditableField` is "this field
owns its keys outright" — a focused input, textarea, select or contenteditable —
which is what stops a chat message being spelled onto the board.
`isNonGameField` adds "and it is not the game's own input", which is the softer
gate: a game's clue box carries `data-game-input`, so a player mid-clue can still
press `/` to reach chat while the chat box itself keeps the character literal.
It lives here rather than beside the dispatcher because the dispatcher is not
the only asker: the tab ring, the blinking-caret indicator and bananagrams'
drag all need the same answer, and it was written out four times before it was
written once — the fourth copy having quietly omitted `<select>`.

**Tab needs a different idea**, because native Tab does the one thing this app
never wants. It walks focus out of the board, onto the header, and then out of
the document into the browser's URL bar, leaving a player who tabbed by reflex
stranded somewhere their typing reaches nothing. So Tab is never native here. A
surface declares the ring of stops Tab may visit, in order, and Tab moves within
that ring and nowhere else. A page with a list declares the list; a page with two
declares both; a board, which navigates by clicks and typing and has nowhere for
Tab to go, declares nothing — and an empty ring is still a ring, because a Tab
that is caught and consumed cannot escape while one that is merely ignored can.
Reachability becomes a list you edit rather than a set of elements you remember
to mark unfocusable. Rings stack by mount order, so a dialog opened over a page
is innermost and wins until it closes, and nobody writes that ordering down.
Crosswords is the one genuine exception, and it is an exception because there
Tab is a MOVE — it walks the clues — so it is an action like any other move.

**Entry is the one shape still assembled here.** `useCaptureKeys` is what a word
game composes to get a pending word: it binds typing a letter, deleting the last
one and submitting, and it dismisses the last verdict on any key. Those are
actions now, so the hook is a binder rather than a listener — what it still
supplies is the arrangement, which is identical in every game on purpose so a
player learns it once. What stays per game is only `charFor`, "what may be
entered": letters in the stored case for the word games, something narrower for
a game whose alphabet is its board.

**Backtick standing in for Escape** is the last thing, and it is a different
kind of thing: one listener at the root re-dispatches a synthetic Escape, so
every Escape handler in the app works on a keyboard that has no Escape key. It
translates a key rather than doing something a button could do, which is why it
is not an action.

## Details

**`useGlobalKeyHandler` has no game callers left.** It is down to two Tab
clauses — `useSwallowTab`, and the swallow inside `useCaptureKeys` — both of
which belong to the tab-ring work rather than to keys. What it still packages is
worth knowing: the caller's handler closes over fresh state every render, so the
listener registers ONCE and calls through a ref an effect keeps current, rather
than re-registering per render or enumerating every variable the handler reads.
The tab ring uses the same trick for its stops.

**The two gates are the action dispatcher's, and they read the predicates
here.** A focused text field keeps its keys unless the action opts out through
its `inField`; focus inside `[data-floating-panel]` hands the keyboard to that
panel outright, with no opt-out. That attribute is the panel shell's own marker
— the same one the panels' escape and focus-trap hooks read — which is how a
setup dialog can be a real form floating over a live game with no game knowing
it is there.

**Modified chords are the matcher's business now, not each handler's.** A
keystroke holding Cmd matches nothing, ever, so Cmd-R and Ctrl-Tab keep working;
`⌥` and `Ctrl` are modifiers an action may ask for; and a pattern key — "any
letter", "any arrow" — matches only an unmodified press. Each of the leftover
handlers here still bails by hand, which is right for what they are: a Tab
swallow that fired on `⌥Tab` would be swallowing the browser's key.

**A ring is refs, read at keypress.** Stops are refs rather than elements so a
stop can be declared before it renders and an absent one — a column the phone
layout hides — is simply skipped; a stop that is not on screen is not a stop.
Focus that is on no stop, most often `<body>` after a click on blank page,
enters the ring at the end Tab would naturally reach, so a stray click costs one
press to undo. The ring consumes Tab before it decides where to go, which is
what makes an empty ring inert rather than leaky. A guard in the ring still lets
native Tab run inside a floating panel or menu, for overlays that have not
declared rings of their own; it is the piece innermost-wins is meant to replace,
and it stays until those overlays declare.

**`useSwallowTab` is the empty ring, written before rings existed.** Eight
surfaces call it and `useCaptureKeys` carries the same swallow in its own
clause. All of them consume rather than ignore, which is the property that
matters. They are one statement in several spellings.

**Handing the keyboard back means having nothing focused.** Focusing the board
is not a thing that can be done, since the board reads from `window`; so the
chat box and the scratchpad answer Tab by blurring themselves, which is the
whole move. Shift+Tab is left native there so a panel's own close button stays
reachable. The other direction is `act-open-chat`, which focuses the chat entry
from anywhere.

**Backtick is lost as a character in every text field.** The listener runs in
the capture phase on `window` and does not skip editable targets, so chat, the
scratchpad, a clue field and every form give up the backtick. It is a real cost
taken for an Escape key on keyboards that lack one, and the synthetic Escape is
untrusted, so the listener cannot react to its own re-dispatch.

**Escape is not handled here.** It stays "close what is on top," and the
floating panels own it.
