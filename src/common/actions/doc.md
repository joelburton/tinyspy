# actions

Every command in the app — New game, Shuffle, Concede, typing a letter — as one
kind of thing, with the half that never varies kept in one table and the half
that does supplied by whoever offers it. What each key DOES is
[docs/keyboard-shortcuts.md](../../../docs/keyboard-shortcuts.md); this folder
is what a command IS.

## Design

A command is one thing wherever it appears. Its menu row, its button, its key
and its line in the help list are four views of one idea, and none of them can
disagree with the others about what it is called, what key fires it, or
whether it is available right now. This folder exists to make that so.

The thing is an **action**, and it has two halves. The fixed half is what the
app decides once and every game inherits: what the action is called, its glyph,
its keys, its tone, and the question it asks before it acts. That lives in the
registry, a plain table with no functions in it, and it is the reason shuffle
answers to the same key in every game that offers shuffle — a game does not
choose. The live half is what only the offering page can know: what the command
actually does here, whether it applies at this moment, and what it says right
now. A game supplies that by binding, and the two halves joined are a **bound
action**, which is all any surface ever sees.

**Binding is offering.** There is no list of "which keys this game wants" —
binding an action is what gives a page its key, its menu row and its button, and
unbinding is what takes them back. Components bind their own: a page binds its
commands, and a component mounted inside it binds the keys it owns, so what is
available is simply what is mounted. That is also what makes the help list
trustworthy, since the list and the dispatcher read the same registrations.

A bound action answers one question, `describe()`, with `active`, `hidden` or
`disabled` — and optionally with different words, a different glyph, or the
reason it is the state it is, for this moment. One answer, read by everything: a
menu row grays, a button disables and a key does nothing for the same stated
reason, and they cannot disagree. The reason goes into the button's bubble in
place of the name and key ("Find 2 more valid words" on a Hint that is not yet
earned); it comes from the binding rather than the placement because the
conditions that decide the state are the ones that know why.
`hidden` and `disabled` say different things and the distinction matters: hidden
is "not here at this moment", which is how a play-only action leaves at
terminal, while disabled is "here, and not right now", which is Submit with an
empty entry.

The line that answer sits on is **how an action looks now versus what it is**. A
toggle has two faces — "Reveal secrets" with the boxed eye, "Hide secrets" with
the crossed-out one — and both halves move together, because on an icon-only
control the glyph is the label and letting the words move alone would have the
two saying different things. What never moves is the action's name, its keys,
its tone and its question: those are what make it the same command in every
game, and none of them depends on the moment.

Keys go through one listener at the app root, and nothing else in the app
listens for a game key. That is the property the whole design rests on: a key
that works is a key some action declared, so there is one place to look for a
page's keys and no way for one to escape the list.

What the listener does with a keystroke is three passes, because a keystroke can
mean three kinds of thing. A **watcher** claims nothing and every live one runs:
that is how any key dismisses the last message and still types its letter. An
**interceptor** is a surface declaring a MODE — while a past turn is open, the
next key means "back to the live board", whatever else is bound — and a mode
outranks any particular key, which is a claim about the moment rather than
about specificity. Everything else is a **command**, taken in the order the
bindings mounted: a component mounted with its page sits ahead of the page and
wins a key they both want, while one mounted later sits behind everything
already there. That order is a tiebreak and nothing more — two commands that
can be live at the same moment do not share a chord, and when they do the
dispatcher says so in the console in development.

## Details

**A key is an object, not a string.** A `Chord` says which half of the event to
compare — the character (`e.key`) or the physical key (`e.code`) — and what each
modifier must be doing. On macOS Option changes the character a key produces, so
`⌥=` arrives as `≠` and `⌥\`` as `Dead`, and every Option chord therefore
matches on `code`.

**Shift is stated wherever it makes a different chord, and left unsaid where it
made the character.** `⌥+` is Option-Shift-Equal and `⌥=` is a different chord;
`⇧⌫` clears the word where `⌫` clears the cell; `⇧`+arrow jumps to the word edge
where the bare arrow steps. Those all say. A chord written as a character — `+`,
`<`, `~` — says nothing about shift, because shift was already spent producing
the character and asking again would only be a claim about somebody's keyboard
layout. Two presses that should both fire one action are two entries in its
`keys`, never one entry that shrugs; a guard holds the line.

**Cmd is never ours** and the matcher refuses it outright. `Ctrl` is expressible
but unused: it is free on macOS and the browser's on Windows and Linux, so a
Ctrl chord would work here and fail for a friend on a PC. `⌥` is the convention
for a game chord.

**Two gates come before any pass, and they are the app's, not an action's.** A
keystroke aimed at a focused text field belongs to that field, and one aimed at
anything inside a floating panel belongs to the panel; neither reaches a
binding. The field gate is the one an action can opt out of, through `inField`
on its registry row: `'never'` (the default), `'game-inputs'` (from a game's
own input, marked `data-game-input`, but not from chat or a form — the shell's
`/ ? ~` work this way, so you can reach chat mid-clue), or `'always'`
(crosswords' Tab, and nothing else). The panel gate is absolute.

**A held key fires only an action that declares `repeat`.** The entry keys do —
letters, ⌫, the arrows, Space, Tab — because repeating is the point; a command
does not, so holding `+` cannot start games at the OS repeat rate.

**A binding that is here but disabled still keeps its key from the browser.**
The passes skip it so a sibling that wants the key gets it, but when nothing
takes the key a disabled match prevents the default, so Space with no legal
peel does not scroll the page. A hidden binding leaves the key alone.

**The live half has two knobs besides `run` and `describe`.** `terminal` is
what skips the registry's question — at terminal there is nothing left to
interrupt — and a binding whose row carries a `confirm` passes it. `runAlternative`
is the body for a question's second answer, and its presence is what selects
that question. A `BoundAction` also carries `pending`, true from the press until
the run settles, the question included; every surface reads it to gray.

**The shell's four keys are bound once, at the app root.** `AppActionsHost`
binds `act-open-chat`, `act-open-menu`, `act-lookup-word` and
`act-anagram-finder` and owns the two dialogs two of them open, so a page gets
them by existing. Chat answers `hidden` on a page with no chat panel mounted.

**A surface can show an action somebody else bound.** `useAppAction(id)` hands
back the live binding for an id — the game menu's chat row is the case, and so
is crosswords' scratchpad row: the key is bound by the header mark, and the row
should be that action rather than a second copy of its name and key. Null when
nothing has bound it, and the caller drops the row.

**The key list is one row per command.** `<KeyList>`, at the bottom of every
help companion, loops over the bound actions that have a key and are not
hidden: the first key, and what the action is called at that moment. An action
bound twice — `act-end-game`, by the game and by the page for the pause overlay
— is listed once, with the words of the binding the dispatcher would fire.

**A button's bubble teaches the key, but its name stays its name.** The bubble
is `nameWithKey`: the words with the first chord on the end, "New game · +",
spelled one way for `<ActionButton>` and for a bespoke control alike — or the
reason `describe()` gives, in its place. The accessible name is the words alone:
a standard button would take its name from the tooltip, and "End game · ⌥⌫" is
not what the button is called, so `<ActionButton>` says the name itself.

**A pattern is one action, not twenty-six.** "Any letter", "any arrow", "any
key" are `KeyPattern`s, and the pressed key is handed to the action's `run`. The
any-key behaviors differ in one property: leaving the history viewer consumes
the keystroke (the press that gets you back to the live board must not also
play a move), while dismissing a message, or putting away crosswords' peek,
does not, which is why a key can clear the last verdict and still type its
letter. That is `consumes`, and it is why the dispatcher runs the non-consuming
watchers first and separately.

**A control that isn't a standard button can still BE an action.** The board's
round shuffle pill, the header's pause and page-switch marks keep their own
markup and their own look, and take what they do, what they are called, whether
they are live and which key also does it from `actionSurface(action)` — the
props to spread on their own `<button>`. `<ActionButton>` is the ordinary way to
place an action; this is the door for the deliberate exceptions, and it is why a
bespoke look is not a reason to write a command down twice.

**Every surface says which action it is**, as `data-action="act-shuffle"` — on
`<ActionButton>`, on an `actionSurface` control, and on a menu row. It is the
escape hatch for styling one command in particular, and the handle a test wants:
what a control is CALLED is `describe()`'s to vary per game and per state, so
one action reads "Reveal answer", "Reveal secrets", "Hide solution" and
"Solution already shown" — and a spec keyed to the wording breaks the first time
a game says it better. `e2e/helpers/actions.ts` wraps it. An attribute rather
than a global class, matching every other marker the app leaves for a
stylesheet to read.

The exception is a MENU SUBMENU parent ("Check", "Reveal"), which carries none:
its id names a grouping rather than a command, and its words are the grouping's
own — they do not vary, so naming them is safe.

**Two guards hold the system's shape**, both in `src/guards/`. `actionIds`
keeps an action's two spellings together — `act-new-game` in the registry and
`actNewGame` for the value a component binds it to — so either one finds every
trace of the action. `registeredChords` keeps the registry the only place a
chord is matched: a handler comparing `e.code === 'KeyZ'` by hand would get the
same keystroke to the same place while belonging to no action, so the key list
would not know about it, no bubble would say it, and the dispatcher could not
tell it to stand down inside a chat box — and it looks perfectly reasonable in
a diff.

**The confirmation is asked by the shared run**, not by the callback. New game
always asks the new-game question and always only mid-game, because at terminal
there is nothing left to interrupt — so the registry carries the question and no game
carries the same three lines. A question only one game asks
stays inside that game's callback. The asking goes through
`common/floating-panels/confirmationService.ts`, which exists precisely because
the code doing the asking is not a component and has nothing to render into.

**A question may have two ways to say YES.** Conceding a race and ending it for
everyone are both things to do and they differ in what they do — subtly enough
that two red buttons side by side can only name the difference, where a question
has room to explain it. So the registry can carry a second question
(`confirmChoice`) whose answer says which act was picked, and the binding
decides which question applies by supplying a body for the second act
(`runAlternative`) or not. There is no flag: a game cannot end up offering an
answer it has nothing to carry out with. It stops at two — past that it is a
menu, not a question.

**The run is single-flight**, so a second press while the first is still out is
dropped and every surface shares one wait. The gate closes on the press, before
the question is answered, which is deliberate: a button behind an open confirm
reads gray rather than live. **A menu row grays for the same flight** — a row
that silently does nothing for a second, while advertising a key, reads as a
promise it isn't keeping.

**A surface reads a bound action when it draws it.** For anything the game
renders that is automatic. The menu is the one surface the game does not
render — it draws its rows when it opens, and asks then. Nothing the player does
can change a row while the menu is up (activating a row closes the menu first,
and the popover keeps its keys to itself), so the only staleness reachable is a
change arriving from another player over realtime while the menu sits open;
closing and reopening it is the fix, and clicking the stale row is safe
regardless.

**Testing a surface that takes an action it does not bind** — a game's
`ctx.menu.actBackToClub`, a `<MoveRow>`'s two keys, a menu built from rows —
uses `boundActionFixture(id)`: the registry's real fixed half with a `vi.fn()`
run, so the test asserts which action fired without dragging a React tree and
the dispatcher in. A test that fires a confirming action for real mounts
`<ConfirmationHost />`, since the host lives in `App.tsx` and a question with no
host is answered no. And a test that presses a key mounts `useActionDispatcher`,
because a bare render binds actions with nothing feeding them keys.
