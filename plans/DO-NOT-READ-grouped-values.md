# DO NOT READ — grouping what hooks return and what props carry (ideas only)

**DO NOT READ THIS FILE unless Joel names it.** It records an exploration, not
a plan: nothing here is approved, decided or scheduled. No session builds from
it, folds it into an area or a plan, or cites it as precedent. Joel's next
step, if any: once psychicnum's step-5 conversion is written the usual way, he
*might* ask for a trial of this on it, to see how much it changes the code.

Opened 2026-09-28, during common-tables step 5 (psychicnum's front end).

## The idea

A hook's return, and a component's props, often destructure into a long flat
list — `PlayArea`'s is 25 lines (`src/psychicnum/components/PlayArea.tsx`) —
and each name has to be long to say what it is. Instead, group them into a few
named objects:

```ts
const { playerEnding, gameEnding, standing } = useSomeHook()
// … later
if (playerEnding.reason === 'conceded') …
```

Joel, on why: it shortens the destructuring; it shows which values belong
together; and `playerEnding.reason` says at a glance that the value came from
the hook, where `playerEndingReason` *"can make me pause to think 'is this a
local variable? or something passed as a group'."*

Taken further (with the one-read idea in
[seat-view.md → decision 8](seat-view.md), which decided it), what the
page hands a game could be one object, **`gd`**, the game data: everything
that came from loading starts with `gd.`, and nothing else does. Joel: `ctx`
is vague (*"context of what?"*); `gd` is cryptically short, but appears in
every play area a hundred times, so it is learned at once, as `db` is. If
adopted, docs/naming.md's glossary would define it.

## Already in the code

`timer` (`timer.displaySeconds`, `timer.expired`) and `ending`
(`ending.reason`, `ending.outcome`) are groups today. The page's values reach
`PlayAreaLoader` as one object and are spread flat into `PlayArea`, which
unpacks them again.

## Things to keep in mind

- **A group is a real concept, never an ad hoc bundle** that becomes a junk
  drawer. Where the repo already names the concept, the group takes that name;
  where it doesn't, the grouping may *discover* one, and a good new name is
  proposed (Joel, 2026-09-29: the earlier "only names we already use" was
  wrong). A lone value stays ungrouped: a group of one says nothing. The
  cleanest first case: the "where I stand"
  values (`isPlayer`, `isConceded`, `isStillPlaying`, `isMyTurn`,
  `isWaitingForTurn`, `isBoardInteractive`, …), a set docs/win-lose.md
  already defines (docs/win-lose.md → Where a player stands).
- **An effect depends on the field, not the group.** A group rebuilt each
  render re-runs an effect that lists the group; `standing.isMyTurn` in the
  dependency list does not, and the hooks lint rule accepts a property path.
- **What a child is passed** (agreed as the line of judgment, Joel
  2026-09-28):
  - a **region of the same surface** — `BoardCol`, `InfoCol`, the two columns
    of `PlayArea`, which read most of what it has — gets the group; splitting
    it into fields only moves the long list;
  - a **leaf** — `Board`, `StateLine`, shared pieces like `TurnStatusLine` —
    gets fields, or groups of its own, never all of `gd`. The board's own
    groups would come from its vocabulary (the tiles and their results, who
    decided each tile, the marks and flashes;
    [tile-feedback.md](tile-feedback.md) names them).
