# rank-ladder

The rank ladder, the bar that draws it, and the stat grid beside it. There is no data model behind it, so any game with a ladder can take it.

## Intro to area

The ladder is seven named tiers from Start to Genius, and Genius is reached at
70% of a board's maximum score rather than at all of it. Everything here
follows from that being a *fraction* rather than a list of scores: the tiers
are the same wherever they appear, and what they mean depends entirely on the
board you are playing.

The ladder is computed twice, and what holds the two halves together is
algebra rather than shared code. The frontend needs a fraction — which of seven
squares to fill — so `currentRankIndex` walks float thresholds. The server
needs an integer, because the same number decides who wins a compete race, and
a rank boundary is exactly where floating point stops being reproducible; so
`common._rank_idx` does one integer division, `least(6, (score * 60) / (total *
7))`. That expression is the algebraic rearrangement of `score >=
rankThreshold(i) * total`, which is why the two agree — and they do agree, over
every score against every total from 1 to 2000, checked exhaustively rather
than argued. The constraint on anyone rewriting either side is that
equivalence, which is stronger than leaving the constants alone. `rankLadder.ts`
carries the derivation; a `rank_idx_test.sql` per caller pins the SQL half.

A tier is a readout rather than a control, and two things follow from that
which would look arbitrary apart. Nothing in the bar is focusable — no
`tabIndex`, no role, no button — because a square has no action, and a tab stop
in it multiplies: the bar draws once in the info column and again in the mobile
status bar, so every square would be a dead stop ahead of every real control,
once per bar on screen. And each square asks the shared tooltip host for its
bubble as a `data-tooltip-on="readout"` carrier, which reverses all three of
that host's
timings: the bubble appears at once rather than after a beat, a tap reveals it
where a button needs a hold, and pressing a square leaves it up. Every one of
those defaults protects a control you might be about to click, and a square is
the opposite — people hover it *only* to read the bubble.

The type is relative where the app's ramp is absolute, and that is deliberate.
Every size in the readout is an `em`, so the whole thing scales with its
parent: in the info column that is the page's 1rem, and inside
`<MobileStatusBar>` it is `--font-size-packed`, which is what packed is *for* —
a phone's status row gives the board every pixel it can. The ramp could not say
this. Its steps are rem, so a label would have held its size while the figure
beside it shrank, and the grid would have half-tracked.

The ladder's own colors are shared, and only the type color is the game's. A
rank means the same thing in spellingbee as in wordwheel, so the bar does not
take an accent — when the two sat side by side, differing hues read as a
distinction that was not there. `--rank-text` stays aliased per game because it
belongs to the game's type color rather than to the ladder.

## Details

```
spellingbee: manifest · InfoCol · BoardCol · PlayArea · SetupForm · lib/setupSummary  ┐
  wordwheel: manifest · InfoCol · BoardCol · PlayArea · SetupForm · lib/setupSummary  ┴─▶ rankLadder.ts
                                                     (RANKS · currentRankIndex · rankPoints)
  the two InfoCols + BoardCols ─▶ <RankBar> ─▶ data-tooltip-on="readout" ─▶ common/tooltips
                               └▶ <Stats>
              boggle/Stats.tsx ─▶ Stats.module.css  (the stylesheet alone — its own 4-cell grid)
                   submit_word ─▶ common._rank_idx  (the compete win check)
```

**Both components render twice per page** — once in the info column and once
inside the mobile status bar — so each has a compressed shape scoped to
`[data-mobile-status]` at the foot of its stylesheet. A scoped override rather
than a prop: the surface a component lands in decides its own shape, so the two
cannot drift the way a hand-passed flag can.

**A game can build its own grid on `Stats.module.css` without using
`<Stats>`** — boggle does, with four cells and a percent line. So the rules that
govern every such grid, like writing a found/total pair tight, live beside the
classes in that file rather than in the component.

**Three lengths are bespoke by decision**, each with its reason in the file: the
tier's `2px` radius (the radius ramp starts at 4px, and this only stops the
corner reading as a pixel box), the goal outline's `3px` (a step above the
app's thick line, which has no token), and the cell's `2px` gap (a label and
the figure under it are one unit; the ramp's smallest step reads as a break).
The band's padding is bespoke too — padding does not answer to the spacer
ladder.
