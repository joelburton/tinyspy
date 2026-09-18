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

The display is `<EntryBox>`, and it is deliberately not a form field: no border,
no background, just the word large and centered with a bar blinking after it.
The bar is drawn rather than the browser's, so it can be honest about something a
real cursor could not — it appears only while the game actually owns the
keyboard and something has been typed, and so it never blinks beside a second,
real cursor sitting in the chat box.

`<MoveRow>` is the line that box sits on: take-back, the display, commit. The two
buttons are not controls of their own with their own idea of when they are
allowed to act — each is handed the very bound action its key fires, so "is
there anything to take back" and "may this submit" are answered once, by the
action, and a button and its key cannot drift apart.

`<EntryRow>` is those two with the keyboard attached, and it is what a typing
game renders: it composes the shared capture keys, layers the `↑`/`↓` recall on
top, and swaps the whole row out for a feedback pill when the game has something
to say in that slot. A game whose entry is not typed at all — stackdown picks up
tiles, strands traces a path — takes `<MoveRow>` directly and brings its own
keyboard, which is the reason the two are separate components rather than one.

## Details

**The pieces compose one way down.** `<EntryRow>` is the assembled thing and
each layer under it is separately usable:

```
<EntryRow>                    a typing game's whole below-board control
├── useCaptureKeys            keyboard/ — A–Z, ⌫, ↵, and the any-key dismiss
├── useArrowHistory           ↑ recall · ↓ clear
├── useTopFeedbackMessage     feedback/ — is anything on the slot?
└── either
    ├── <div .localFeedback>  game-page/playArea.module.css — a message is on top
    │     └── <FeedbackPill>  feedback/
    └── <MoveRow>             ⌫ | <EntryBox> | ↵
          └── <EntryBox>      the pending value or the placeholder, and the caret
                └── children  a game's per-character rendering, or the plain value
```

**The host owns the slot; this folder owns what goes in it.** The below-board
region's board-matched width and its reserved height are the game's, as is which
messages reach the feedback slot. `<EntryRow>` only decides what to draw inside:
the pill when the slot has a message, the controls when it doesn't.

**The swap does not unmount the row.** That is what keeps the capture hook live
underneath a pill, which is in turn what lets a keystroke dismiss a message that
leaves by gesture — the key dismisses it, rather than the row hiding it. A
message that leaves only by its `×` sits over the controls however much is
typed. The kinds and their exits are [`common/feedback`](../feedback/doc.md)'s.

**One knob, `--entryBox-font-size`.** Its default is at `:root` in
`core-css/base.css`, and a game raises it by re-setting the token on the box or
anywhere above it — psychicnum on the row, strands on the box, both reaching
`.box` because a custom property cascades. The caret's height is in `em` so it
follows without a second knob. That token and a `className` are the whole of the
per-game tuning; everything else about how an entry looks is the same in every
game on purpose.

**A game with no history hides both arrows rather than graying them.** `↑` and
`↓` have no buttons anywhere — the only place they appear is the "Keys" list in
Help, and that list draws a `disabled` key exactly like a live one, filtering
only `hidden` ([`common/actions`](../actions/doc.md) → the key list). So a key
that can never act has to be `hidden`, or it reads as one that works. That is
what `hasHistory: false` says, and it is a different statement from `recall: ''`
— which means the game does offer recall and nothing has been submitted yet.

**What may be entered is the game's, and it is the only per-game rule.**
`charFor` maps a pressed key to the character to append — letters in the stored
case for most, digits for psychicnum — and the length cap, the ⌫, the ↵ and the
any-key dismissal are uniform, in `useCaptureKeys`. A game writes no entry-key
branch.
