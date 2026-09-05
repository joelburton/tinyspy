# game-page — todo

## Bugs

## Soon

- **A contract-slot guard, per MOUNT POINT.** Common CSS reads custom
  properties a game fills in and no file declares (`--cols`, `--grid-gap`,
  `--max-tile-width`, the bee games' `--board-units-*`, `--rank-text`, …;
  the list is in docs/code-conventions.md → Known gotchas). A game that
  mounts the reader and forgets one gets a silently dead declaration, and the
  phantom-token guard passes it because each slot IS defined in *some* game.
  The check has to be "every game mounting this component defines the slots
  it reads", and this folder owns the mount points.
- `PlayAreaMountLog.tsx` exports two components (`PlayAreaSlotLog`,
  `PlayAreaReadyLog`), so "the filename is the component" is false here. Split
  or justify.

## Someday

- Whether Help's "Got it" button belongs on a companion at all — a companion
  is the family that closes by its ✕, having nothing to answer.
- The global feedback slot `GamePage.tsx` holds inline is `feedback`'s
  concern; whatever that redesign decides about slot ownership lands as a
  change this folder applies.

## Maybe
