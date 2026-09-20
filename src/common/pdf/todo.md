# pdf — todo

## Bugs

## Soon

## Someday

## Maybe

## Won't do

- **Guard the word-list body's Setup against an empty recap.** The event-log
  body and `drawSetupBelow` draw nothing for a model with no rows;
  `drawWordListBody` would print a bare `Setup: Co-op`. Ruled no-change
  2026-09-19 (Joel: *"we can skip this concern"*): every game that prints
  through the frame always has rows — each `setupRows()` opens with the
  roster row and adds at least one fixed row — and crosswords, the game with
  none, composes nothing here.
- **A spec for `marks.ts`.** Ruled 2026-09-19 with the specs for the tracks
  and the tiles: the three marks are pure line segments, and a test would pin
  the coordinates of a shape whose only judge is the eye.
