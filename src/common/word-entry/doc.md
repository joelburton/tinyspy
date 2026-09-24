# word-entry

The below-board control a player commits a move with: a display box holding the
pending word, a `⌫` and a `↵` either side of it, and the `↑`/`↓` that bring back
the last thing submitted. There is no `<input>` anywhere in it — the keys are
actions, bound in [`common/keyboard`](../keyboard/doc.md) and in this folder.

## Intro to area

A word game asks the player to type a word while clicking around a board. A real
`<input>` cannot do that: the first click on a tile blurs the field, and typing
silently stops working with nothing on screen saying why. So these games focus
nothing. Keystrokes are read off the window and turned into actions, and what
this folder holds is the part the player is left looking at — the word as it is
being typed, and the two buttons that do the same two things the keys do.

The display is `<WordEntryInput>`, and it is deliberately not a form field: no border,
no background, just the word large and centered with a bar blinking after it.
The bar is drawn rather than the browser's, so it can be honest about something a
real cursor could not — it appears only while the game actually owns the
keyboard and something has been typed, and so it never blinks beside a second,
real cursor sitting in the chat box.

`<WordEntryRow>` is the line that box sits on: take-back, the display, commit. The two
buttons are not controls of their own with their own idea of when they are
allowed to act — each is handed the very bound action its key fires, so "is
there anything to take back" and "may this submit" are answered once, by the
action, and a button and its key cannot drift apart.

`<WordEntryArea>` is those two with the keyboard attached, and it is what a typing
game renders: it composes the shared capture keys, layers the `↑`/`↓` recall on
top, and swaps the whole row out for a feedback pill when the game has something
to say in that slot. The games that don't type are entering a word too —
stackdown spells one into five tile slots, strands traces one on the board — but
there a keystroke doesn't mean "append this character", so they take
`<WordEntryRow>` directly and bring their own keyboard. That is why the two are
separate components rather than one.

## Details

**The pieces compose one way down.** `<WordEntryArea>` is the assembled thing and
each layer under it is separately usable — and the separations are not
hypothetical: a game takes the row without the keyboard (its entry isn't typed),
or the arrows without the row (it captures keys its own way but still has a last
entry worth bringing back). That is why the arrows are a hook rather than
another branch inside `<WordEntryArea>`.

```
<WordEntryArea>                    a typing game's whole below-board control
├── useCaptureKeys            keyboard/ — A–Z, ⌫, ↵, and the any-key dismiss
├── useArrowHistory           ↑ recall · ↓ clear
├── useTopFeedbackMessage     feedback/ — is anything on the slot?
└── either
    ├── <div .localFeedback>  game-page/playArea.module.css — a message is on top
    │     └── <FeedbackPill>  feedback/
    └── <WordEntryRow>             ⌫ | <WordEntryInput> | ↵
          └── <WordEntryInput>      the pending value or the placeholder, and the caret
                └── children  a game's per-character rendering, or the plain value
```

**The host owns the slot; this folder owns what goes in it.** The below-board
region's board-matched width and its reserved height are the game's, as is which
messages reach the feedback slot. `<WordEntryArea>` only decides what to draw inside:
the pill when the slot has a message, the controls when it doesn't.

**The swap does not unmount the row.** That is what keeps the capture hook live
underneath a pill, which is in turn what lets a keystroke dismiss a message that
leaves by gesture — the key dismisses it, rather than the row hiding it. A
message that leaves only by its `×` sits over the controls however much is
typed. The kinds and their exits are [`common/feedback`](../feedback/doc.md)'s.

**The pill's box is the play surface's, not this folder's.** `WordEntryArea` draws
its `<FeedbackPill>` inside `game-page/playArea.module.css`'s `.localFeedback`,
which centers a lone pill in the below-board slot and reserves its height. That
is a class games also wear directly for the same purpose, so the row is
one wearer among them rather than a folder reaching into another's private
sheet — the lowercase name is the repo's mark for a stylesheet meant to be read
by others.

**One knob, `--wordEntryInput-font-size`.** Its default is at `:root` in
`core-css/base.css`, and a game raises it by re-setting the token on the box or
anywhere above it — strands does it on the box, and a token set on the row
reaches `.box` too, because a custom property cascades. The caret's height is in `em` so it
follows without a second knob. That token and a `className` are the whole of the
per-game tuning; everything else about how an entry looks is the same in every
game on purpose.

**A key the game HASN'T GOT is hidden; a key it can't use right now is gray.**
The host passes two gates — `disabled`, the entry is not here at all, and
`busy`, the moment a submit is in flight — and both hooks answer both of them
with `disabled`, so all four keys on the row say the same thing at the same
time. None of them leaves the key list for either gate, because Help teaches
what keys a game has rather than what is pressable this instant: typing, ⌫ and ↵
are still spellingbee's keys after the game ends, and a player reading Help then
should still learn them.

The one thing that does leave is `hasHistory: false` — letterboxed has no recall
at all, so there is nothing about ↑ or ↓ to teach there. That is a different
statement from `recall: ''`, which says the game does offer recall and nothing
has been submitted yet. Worth knowing when reading these two apart: `↑` and `↓`
have no buttons anywhere, so the key list is the whole of what their state is
for — while ⌫ and ↵ are also the buttons in the row, which is why hiding those
two would empty the row's ends.

**What may be entered is the game's, and it is the only per-game rule.**
`charFor` maps a pressed key to the character to append — letters in the stored
case, and letterboxed's only the board's twelve — and the length cap, the ⌫, the ↵ and the
any-key dismissal are uniform, in `useCaptureKeys`. A game writes no entry-key
branch.

**Capture is for a single token; free text is a real `<input>`.** A word or a
number is typed at the board and read off the window. Entry that is several
words edited mid-string — codenamesduet's clue — is a real
`<input data-game-input>` instead, because there the native cursor, selection
and editing are the point. The attribute is how the keyboard gates tell a
game's own field from chat ([`common/keyboard`](../keyboard/doc.md)).
