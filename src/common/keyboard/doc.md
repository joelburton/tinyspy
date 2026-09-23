# keyboard

Who owns a keystroke, where Tab may go, and backtick standing in for Escape.
What a key DOES is an action ([`common/actions`](../actions/doc.md)); this
folder holds the three questions that are about keys in general rather than
about any one of them.

## Intro to area

A play surface has nothing to focus. A board is tiles you click and a word you
type, and the moment a real `<input>` held the word, clicking a tile would blur
it and typing would silently stop. So the games read keystrokes off `window` —
and a window listener hears everything, the chat box and a setup form and a
confirm dialog's buttons included. The reading itself is not here: a key is a
command, a command is an action, and one listener at the app root fires
whichever action answers. What is here is the part that was never about a
particular key.

That comes to a few questions and one shape. Whose keystroke is it — a focused
text field's, or the game's? `editableField.ts` answers with two predicates,
and `useGameHasKeyboard` answers the same question as a value that changes as
focus moves, for a caret that must blink only while typing lands on the board.
Both live here because the action dispatcher is not the only asker. Where
may Tab go? Never where native Tab goes, which is out of the board and into the
browser's URL bar; instead each surface declares a ring of stops and Tab moves
within it, a form's fields being stops rather than an exception. What stands in
for Escape on a keyboard without one? The backtick, which a root listener
re-dispatches as a synthetic Escape. And the shape still assembled here is
`useCaptureKeys`, the arrangement every word game composes to take a pending
word — typing a letter, deleting the last, submitting — so a player learns it
once.

## Details

**Whose keystroke is it?** `editableField.ts` is the whole answer, and it is two
predicates because there are two questions. `isEditableField` is "this field
owns its keys outright" — a focused input, textarea, select or contenteditable —
which is what stops a chat message being spelled onto the board.
`isNonGameField` adds "and it is not the game's own input", which is the softer
gate: a game's clue box carries `data-game-input`, so a player mid-clue can still
press `/` to reach chat while the chat box itself keeps the character literal.
It lives here rather than beside the dispatcher because the dispatcher is not
the only asker: the blinking-caret indicator and bananagrams' drag need the
same answer, and a second copy of it is how `<select>` gets omitted.

**The caret's version of that question is `useGameHasKeyboard`**, which tracks
`focusin`/`focusout` and reports whether the game owns the keyboard right now.
`word-entry/WordEntryInput` gates its simulated caret on it — **caret visible ⟺
keystrokes go to the game** — because a caret on the board while a real one
sits in the chat box reads as two cursors. `lists/FilterSelect` and
bananagrams' board hook cite that invariant as the reason they hand focus back;
neither calls the hook. It tracks FOCUS rather than "is chat open": chat can
sit open beside the board while you click back to type, and there the game owns
the keyboard.

**Tab needs a different idea**, because native Tab does the thing this app
never wants. It walks focus out of the board, onto the header, and then out of
the document into the browser's URL bar, leaving a player who tabbed by reflex
stranded somewhere their typing reaches nothing. So Tab is never native here. A
surface declares the ring of stops Tab may visit, in order, and Tab moves within
that ring and nowhere else. A page with a list declares the list; a page with two
declares both; a board, which navigates by clicks and typing and has nowhere for
Tab to go, declares nothing — and an empty ring is still a ring, because a Tab
that is caught and consumed cannot escape while one that is merely ignored can.
Reachability becomes a list you edit rather than a set of elements you remember
to mark unfocusable. Rings stack by render order, so a form nested in a surface
is innermost even when both mount at once, a dialog opened over a page is
innermost and wins until it closes, and nobody writes that ordering down.
Crosswords is the exception, and it is an exception because there Tab is a
MOVE — it walks the clues — so it is an action like any other move.

**A text field is a STOP, not an exception to that.** The tempting rule is
"yield to a focused input, because tabbing between a form's fields is the one
place native Tab is right" — but yield and Tab from the last field goes straight
to the URL bar. A form's fields are its ring's stops instead, so tabbing between
them IS the ring cycling. The way out of a ring is for something inside it to
answer Tab itself: chat's and the scratchpad's fields consume the key and blur,
which is a declared step OUT to the page's ring, and the ring stands down for a
press that has already been consumed. (The dispatcher's own bail for a focused
field is a different thing — it keeps a game's window-level keys off a chat box
— and the two must not be confused.)

**Entry is the shape still assembled here.** `useCaptureKeys` is what a word
game composes to get a pending word: it binds typing a letter, deleting the last
one and submitting, and it dismisses the last verdict on any key. Those are
actions, so the hook is a binder rather than a listener — what it supplies is
the arrangement, which is identical in every game on purpose so a player learns
it once. What stays per game is only `charFor`, "what may be entered": letters
in the stored case for the word games, something narrower for a game whose
alphabet is its board.

**Backtick standing in for Escape** is a different kind of thing: one listener
at the root re-dispatches a synthetic Escape, so every Escape handler in the app
works on a keyboard that has no Escape key. It translates a key rather than
doing something a button could do, which is why it is not an action.

**The two gates are the action dispatcher's, and they read the predicates
here.** A focused text field keeps its keys unless the action opts out through
its `inField`; focus inside `[data-floating-panel]` hands the keyboard to that
panel outright, with no opt-out. That attribute is the panel shell's own marker
— the same one the panels' escape hook reads — which is how a
setup dialog can be a real form floating over a live game with no game knowing
it is there.

**Modified chords are the matcher's business, not each handler's.** A
keystroke holding Cmd matches nothing, ever, so Cmd-R and Ctrl-Tab keep working;
`⌥` and `Ctrl` are modifiers an action may ask for; and a pattern key — "any
letter", "any arrow" — matches only an unmodified press. The tab ring is not an
action and so bails by hand, which is right for what it is: a ring that answered
`⌥Tab` would be taking the browser's key.

**A ring is refs, read at keypress.** Stops are refs rather than elements so a
stop can be declared before it renders and an absent one — a column the phone
layout hides — is simply skipped; a stop that is not on screen is not a stop.
Focus that is on no stop, most often `<body>` after a click on blank page,
enters the ring at the end Tab would naturally reach, so a stray click costs one
press to undo. The ring consumes Tab before it decides where to go, which is
what makes an empty ring inert rather than leaky — though not before checking
whether something closer already answered the key, which is how a panel's text
field steps OUT of its ring by blurring itself.

**A floating panel's ring is `within` its shell, and the shell declares it for
every family.** There its stops are not listed but found at keypress: the
focusable descendants of the shell in DOM order, which is the ✕ and then
whatever the body renders. A panel is a closed subtree and everything in it is
the panel's own, so the only list anyone could write would be "all of them, in
order" — and it would go stale the first time a form grew a field. That is also
why a modal needs no separate claim about focus: an open panel's ring is
innermost, so Tab cannot reach the page its scrim has already made unclickable.
`tabindex="-1"` still means "focusable by code, not by Tab", the one way a
panel can keep something out.

**Every play surface declares its ring in its PlayArea**, and for all of them
but codenamesduet that ring is empty — a board is clicked and typed at, so there
is nowhere for Tab to go. codenamesduet's clue form is two real `<input>`s and
declares them as its own ring, which is innermost while the form is up.
Crosswords declares nothing, because Tab there is a move.

**Stepping out means having nothing focused.** Focusing the board is not a thing
that can be done, since the board reads from `window`; so the chat box and the
scratchpad answer Tab by blurring themselves, which is the whole move, and the
page's ring takes over from `<body>`. Shift+Tab there is the panel's own ring,
which walks back to its ✕. The other direction is `act-open-chat`, which focuses
the chat entry from anywhere.

**Backtick is lost as a character in every text field.** The listener runs in
the capture phase on `window` and does not skip editable targets, so chat, the
scratchpad, a clue field and every form give up the backtick. It is a real cost
taken for an Escape key on keyboards that lack one, and the synthetic Escape is
untrusted, so the listener cannot react to its own re-dispatch.

**Escape is not handled here.** It stays "close what is on top," and the
floating panels own it.
