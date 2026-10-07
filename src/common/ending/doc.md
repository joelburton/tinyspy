# ending

A game's ending: when to celebrate it, the celebration itself, and the words a
finished game is described with — each player's ending label, and the message
the page makes from mine.

## Intro to area

An ending is two different things at once, and they want opposite treatment. One
is a MOMENT — the fourth category falls, the last letter lands, and for a second
the thing to do is make a noise about it. The other is the RECORD: from then on
the page has to say how the game finished, to whoever is looking, for as long as
they look. Both belong to the same instant, and a surface that tries to be both
is either a modal you must dismiss before you can read the board, or a line so
quiet the win goes by unmarked. This folder is the moment, plus the words the
record is made of; the surfaces that carry the record — the below-board pill,
the info column's action row, the compete strip, the club line — belong to the
folders that draw them.

The moment is `<CelebrationBlockingModal>`, and an ended game pops nothing
else — everything a finished game has to say, it says in the page. Only a win
gets a moment at all. Losses land through the red pill instead, which is a
decision rather than an omission: a consolation dialog is a dialog you have to
dismiss on your way to feeling bad.

`useCelebration` is what keeps that moment honest. It watches a boolean go from
false to true and pops once — so it fires when the win HAPPENS and never when a
finished game is merely opened, which is what somebody deep-linking into last
night's victory is doing.

The words start from one object per player, the ending label: how that player
came out, as a word ("Won", "2nd", "Conceded") and what follows it, in the
server's outcome for the color. The word is common, read the same way in every
game from the facts the server writes; what follows it is the game's. Every
surface that says how someone came out reads a label, so the pill, the info
column, the strip and the club line cannot disagree.

## Details

```
each game's useGame            builds gd
└── every gd player carries endingLabel
      └── the game's lib/endingLabel.ts → makeEndingLabel(player, game, …)
            └── makeEndingLabelWord   endingLabel.ts — the common word
<PlayArea>                     every game's play surface
├── useGetEndingMessage(gd)    the game's hook: my label → makeEndingMessage
│    └── useShowEndingFeedback  feedback/ — the pill, routed by endedBy
├── <InfoActionsRow message>   info-sheet/ — the info column's line
├── <OpponentStrip metricFor>  info-sheet/ — each player's metric, then their word
└── useCelebration(my win)     the game's gate on gd.me.outcome
     └── {isOpen && <CelebrationBlockingModal title body onClose>}
           └── <BlockingModal>       floating-panels/ — scrim, card, Escape
                 └── <FloatingPanel>
                       ├── <div .content role="dialog" aria-label={title}>
                       │     └── confetti row · <h2 .title> at h1's size · sub-line
                       └── actions slot: "Nice!"
manifest.summaryFor            the club line: the same label, over summary_data
```

**The label's shape and the common word are in `endingLabel.ts`'s
docstrings.** One game file builds the rest: `lib/endingLabel.ts` →
`makeEndingLabel` (spellingbee and wordwheel share
`shared/bee-games/endingLabel.ts`). It is built once, in `useGame`, onto every
`gd` player, so no component works out a word. `long` and `pill` never repeat
the word, which is what lets a surface set the word apart.

**The game page shows MY outcome, never the game's.** The message, the ending
frame and the celebration are colored by `gd.me.outcome`. In compete, someone
else's win is my `lost` or `near`, though the game's outcome is `won`. One
message serves both endings — the game's once it has ended, mine while the
others play on — and the label's `endedBy` tells `useShowEndingFeedback` which
kind of pill it is.

**A place reads as the place.** A player ranked below first (`near`,
docs/win-lose.md → The player) reads "2nd", never "Lost". After the place
comes what lost it, only where the game ranks by more than one thing ("2nd
(more guesses)", "2nd (solved later)"); a game ranked by one number says
nothing, since the strip shows the number ("280 (2nd)"). A shared place, first
or not, names the others at it ("Won (tied with bea)", "2nd (tied with bea &
cade)"); a coop team is never a tie.

**A Stop is chosen by its reason, never by a `neutral` outcome.** A
`no-result` ending is neutral too, and a game words it from its own reason
("Ended (emptied deck)"); a Stop takes the shared `buildStoppedMessage`, the
same in every game. `makeEndingLabelWord` throws on a no-result ending, so a
game that forgets to word one fails loudly rather than reading "Lost".

**The gate is the caller's; the hook only watches.** `useCelebration` is handed a
boolean and has no idea what it means, which is what lets each game gate its
own win on `gd.me.outcome` (setgame celebrates only a coop win, scrabble only
once the game has ended). Whatever it is handed has to
be right on the very first render, and the way that is broken is always the
same: a value from the game's own fetch is null while it loads, so its arrival
is a false→true flip and the confetti goes off at somebody reading a finished
game. **A unit test with synchronous mocks cannot see it** — the coop-win e2e
specs are what catch it, which is why they exist.

**The dialog role is on the inner `.content`, and it is the test handle.**
`FloatingPanel` sets no role, so this is the only dialog role in the tree, and
both the e2e specs and the games' `PlayArea` tests find the celebration with
`getByRole('dialog', { name })`. Moving it or renaming what feeds `aria-label`
breaks them all at once.

**Closing it is not re-arming it.** Dismissed, it stays dismissed for as long as
the game stays won; what re-arms it is the flip back to false — which is what a
replay-board does when it reopens the game — so win → restart → win
celebrates both times.

**`endingMessage.ts` sits here, but the message's vocabulary is
[`common/feedback`](../feedback/doc.md)'s.** The file lives in this folder
because the message is an ending's; what it may SAY — the terse pill label, the
shorter info-column line, the outcome that colors both — is the same
vocabulary every other message in the app is written in, so changing it is a
change over there.

**`gameEnding.ts` is the ending as the database records it**, and
`readGameEnding` reads it off a `common.games` row: the reason pair, the outcome
and who ended it, or null while the game is played. It names no winner: the
winners are the players ranked 1 (`gd.ending.winners`, and `findWinnerIds`
over `summary_data`). The terms are docs/win-lose.md's and the columns are
docs/common-schema.md → Ending a game.
