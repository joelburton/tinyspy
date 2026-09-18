# terminal

A game's ending: when to celebrate it, the celebration itself, and the words a
finished game is described with — the verdict each game writes, and the one-word
verb that says how a single player came out of it.

## Intro to area

An ending is two different things at once, and they want opposite treatment. One
is a MOMENT — the fourth category falls, the last letter lands, and for a second
the thing to do is make a noise about it. The other is the RECORD: from then on
the page has to say how the game finished, to whoever is looking, for as long as
they look. Both belong to the same instant, and a surface that tries to be both
is either a modal you must dismiss before you can read the board, or a line so
quiet the win goes by unmarked. This folder is the moment, plus the words the
record is made of; the surfaces that carry the record — the below-board pill,
the info column's action row, the compete strip — belong to the folders that
draw them.

The moment is `<CelebrationBlockingModal>`, and a terminal game pops nothing
else — everything a finished game has to say, it says in the page. Only a win
gets a moment at all. Losses land through the red pill instead, which is a
decision rather than an omission: a consolation dialog is a dialog you have to
dismiss on your way to feeling bad.

`useCelebration` is what keeps that moment honest. It watches a boolean go from
false to true and pops once — so it fires when the win HAPPENS and never when a
finished game is merely opened, which is what somebody deep-linking into last
night's victory is doing. That puts one requirement on every game: whatever it
hands the hook has to be right on the very first render, because a value that
arrives a moment later looks exactly like a win arriving, and the confetti
cannot tell the difference. Which flip counts is the game's own business — a
coop solve, a compete win off its own row, both — but that one requirement is not.

The words split the same way the surfaces do. A game's own `buildOver()` returns
a `TerminalMessage`, which is what the GAME says about how it ended, in two
lengths because two surfaces of different width have to agree; `terminalMessage`
holds that shape and the one message every game shares, the neutral "the friends
agreed to stop". `terminalOutcomeVerb` answers a different question — how did
THIS PLAYER come out — in a single word for a cell in a compete strip, which is
why the two live side by side here and neither is written in terms of the other.

## Details

```
<PlayArea>                     every game's play surface
├── useCelebration(won)        the flip, off values GamePageLoader already awaited
│    └── {show && <CelebrationBlockingModal title body onClose>}
│          └── <BlockingModal>       floating-panels/ — scrim, card, Escape
│                └── <FloatingPanel>
│                      ├── <div .content role="dialog" aria-label={title}>
│                      │     └── confetti row · <h2 .title> at h1's size · sub-line
│                      └── actions slot: "Nice!"
├── buildOver() → TerminalMessage    the game's own words, written per game
│     ├── FeedbackMessage.terminalVerdict(over) → <FeedbackPill>   feedback/
│     └── <InfoActionsRow message={{text, outcome}}>   info-sheet/
└── <OpponentStrip metricFor>  info-sheet/ — a compete cell per player, whose
                               word is terminalOutcomeVerb(player)
```

**The gate is the caller's; the hook only watches.** `useCelebration` is handed a
boolean and has no idea what it means, which is what lets one hook serve a coop
solve, a compete win read off `status.winner_user_id`, and a per-row `won` flag
on a leaderboard. The constraint that buys that freedom is in the hook's own
docstring, and the way it is broken is always the same: a value from the game's
own fetch is null while it loads, so its arrival is a false→true flip and the
confetti goes off at somebody reading a finished game. **A unit test with
synchronous mocks cannot see it** — the coop-win e2e specs are what catch it,
which is why they exist.

**The dialog role is on the inner `.content`, and it is the test handle.**
`FloatingPanel` sets no role, so this is the only dialog role in the tree, and
both the e2e specs and the games' `PlayArea` tests find the celebration with
`getByRole('dialog', { name })`. Moving it or renaming what feeds `aria-label`
breaks them all at once.

**Closing it is not re-arming it.** Dismissed, it stays dismissed for as long as
the game stays won; what re-arms it is the flip back to false — which is what a
replay-board does when it un-terminals the game — so win → restart → win
celebrates both times.

**`terminalMessage.ts` sits here, but the verdict's vocabulary is
[`common/feedback`](../feedback/doc.md)'s.** The file lives in this folder
because a verdict is a game's ending; what a verdict may SAY — the terse pill
label, the shorter info-column line, the outcome that colors both — is the same
vocabulary every other message in the app is written in, so changing it is a
change over there.
