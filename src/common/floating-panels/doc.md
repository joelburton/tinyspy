# floating-panels

One shell for everything window-like that floats over the page, and what rides on it: the three window families, each a component that names one (`Companion`, `Dialog`, `NormalModal`); the card shell for the two families that stop the world (`BlockingModal`), with its two members, a question and a statement; and the two hooks only the shell reads — where a panel is, and what Escape does. Asking a question lives here too: `askConfirmation` is the one way to ask, and `<ConfirmationHost>` at the app root draws whatever is pending, because the code that asks is usually not a component.

## Intro to area

docs/ui.md → Floating panels states the rules: what the five families are, that
immovability is the visible signal, what "dim" has to mean, who knows a panel's
size, how a floating surface looks. This is how the code answers them.

The load-bearing choice is that a panel declares one word and the shell supplies
everything that follows from it. `FAMILY` in `FloatingPanel.tsx` is that word's
table — scrim, drag, Escape, remembered rect, shape, layer, the spacing between
its parts — and a caller cannot reach past it. When those were separate props,
each was a chance for a panel to claim one thing and do another, and they took
it: a modal that dimmed nothing, dialogs that forgot the rect they are defined
by, dimmed forms Tab could walk out behind. The claims are now data, so the
document and the code cannot disagree; what a family means is prose in ui.md,
and what it does is this record.

One shell rather than a `Modal` and a `FloatingPanel` beside it, because every
one of these is a floating panel underneath and forking would put the split at
"modal vs not" — a line the family word already draws, with more of the meaning
on it. The three window families are each a thin component that names the family
and forwards, so the name is what a reader sees at the call site without the
shell growing a variant. The two immovable families are cards rather than
windows, and they share a shell of their own, `BlockingModal`, where every
decision the category makes — one width, no resize, grown to fit its content, no
titlebar, the heading in the body — is made once and is not a prop. A blocking
modal that differed from its siblings would be claiming something about itself
that isn't true. Its members are a question, `ConfirmationBlockingModal`, and a
statement, `AcknowledgeBlockingModal`, and the difference is not a missing
Cancel: a box with one way out cannot report which way you left it, so it
resolves nothing.

Where a panel is, is one hook. `useDraggablePanel` takes a key or no key: with
one the rect is read from storage on mount and written on every move, without
one it resets on every mount, and the family decides which. There is no second
component for the panel that forgets, because the two paths call the same hooks
in the same order and render the same box — the only thing that differs is
whether storage is touched, and a branch above the hook was the same shape
declared twice with nothing to separate it.

Three questions stay props, because panels inside one family genuinely differ on
them: who knows the size, under what key a rect is remembered, and the geometry
seeds. Chat and Help are both companions and disagree about the first — the user
knows how much chat history they want; Help's content knows how tall it is. A
floor on that height is only meaningful on a panel you can drag, which is why
`minHeight` defaults to nothing: a panel holding one line should be one line
tall, and a floor there is the shell overruling content for nobody's benefit.
Where a floor is wanted it comes from what the body needs — the titlebar, the
composer and four messages — not from a number that looked about right. And a
floor never outranks the screen: `clampToViewport` caps a rect to the viewport
before it applies a minimum, so a panel with a floor wider than the phone it
opens on fits the phone rather than hanging off its edge.

That clamp is what a phone leans on. A window becomes a full-viewport sheet
there, in CSS keyed off the shape; a card stays a card at every size, so the
thing the question is about stays visible behind it, and it needs no phone rule
because its geometry is settled in the clamp before CSS sees it. Everything on a
coarse pointer is pinned: dragging is a mouse affordance, and removing the drag
binding is also what lets the ✕ take a tap.

Depth is a single axis and its home is CSS. The code carries a family's layer
NAME and `base.css` carries every value, so there is no ladder in TypeScript to
drift from the tokens; `zIndex` is typed as a string for the same reason, and a
guard fails a numeric literal passed to it. A panel overrides it when it can be
summoned from inside something that outranks its family, which is the one case a
family word cannot cover — chat has to stay reachable over every dim and can
open itself, and the help guides are opened from things, the setup modal
included, so at the companion rung the rules would appear behind the form you
pressed "?" in. Chat is also the one panel that paints higher than it ranks —
Escape should close the form you just opened, not the conversation you have kept
open all game — and `escapeRank` exists for that one case. How the surface
itself looks is the app-wide rule in docs/ui.md → The surface; the shell takes
the large radius and the top rung of the shadow ladder, because a panel is a
window over the page and not something resting on it.

Escape itself is one listener for the whole app rather than one per panel,
because a key meaning "dismiss this" needs a single answer: the registry knows
what you are inside, and failing that, what is on top, reading each panel's rank
live from the stylesheet so paint order and Escape order cannot drift apart. A
fault swallows it entirely, so nothing closes by accident mid-error.

The registry is for the shell's families only. A popover, a dropdown or a sheet
has no rect and no titlebar, is not a floating panel, and keeps its own Escape —
but "its own" has to mean the press stops there, because these open *inside*
panels and the registry hears the same key. One press must not dismiss two
things, which is what it did in the anagram finder: define a word, press Escape,
and the definition and the finder both closed. So an overlay that is not a panel
goes through `useDismissOnEscape`, which stops the press before the registry
sees it; one that holds focus, like the menu, handles the key on its own element
and stops it there instead. `guards/escapeListeners.test.ts` holds the line,
because the wrong version of this fails silently and reads as correct.

Tab is not a family's decision. Every panel is a ring, so focus cannot walk out
behind any of them — which is what lets a modal's scrim claim the page is inert
without the keyboard quietly disproving it. Enter is the action dispatcher's,
and it stands down inside a panel, which is what the shell's
`data-floating-panel` marker is for.

Asking a question is one path. `askConfirmation` hands the words to a host
mounted once at the app root, which draws the modal and settles the promise with
the act the player picked — the second way to say yes included. A component
gains nothing by rendering the modal in its own tree, since the host is always
there, and a second path would be a second options type to keep in sync, which
is exactly the drift `FAMILY` exists to prevent. A question asked with no host
up is refused rather than left hanging, and that is the safe direction: an
unanswerable question is not consent.

## Details

**What is built on what, and who renders each.** Read downward as "is built
on"; each line names the components that render that family, with their
folders:

```
FloatingPanel                  the one shell: Rnd (react-rnd) + CloseButton (buttons); FAMILY supplies the rest
├── Companion                  Chat (chat) · GameScratchpadCompanion (scratchpad) · GameHelpCompanion (game-page)
│                              ClubHelpCompanion (club) · crosswords' note and explain panels · codenamesduet's AI suggester
├── Dialog                     WordLookupDialog and WordEditDialog (definitions) · AnagramDialog (anagram-finder)
├── NormalModal                SetupGameModal (setup-form) · EditProfileModal (account) · CreateClubModal and EditClubModal (club)
└── BlockingModal              the card shell: FaultModal (faults) · CelebrationBlockingModal (terminal)
    │                          crosswords' four puzzle pickers · scrabble's blank picker
    ├── ConfirmationBlockingModal   a question — CancelButton + StandardButton (buttons)
    │     └── ConfirmationHost      at the app root (App), drawing whatever `askConfirmation` is asking
    └── AcknowledgeBlockingModal    a statement — one StandardButton
          └── useAcknowledge        the hook that mounts it; connections' and strands' play areas call it
```
