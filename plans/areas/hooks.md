# Area: hooks

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** `src/common/hooks/` — the shared non-game hooks. `deep` set them
aside when it opened: they are the same KIND of thing as the deep layer, but
taking them would have doubled that area and mixed two vocabularies.

**Created 2026-09-02** by Joel, after he declined to bless `App.tsx`: *"not
blessing until we get to all the hooks in the hooks area."* Six of that file's
lines are hook calls, so the shell cannot close until this area does.

**Status: NOT OPENED.**

This file exists **before** the area opens so there is somewhere to put a note
the moment one turns up. Nothing below is a commitment; the roster is agreed with
Joel when the area actually opens, by listing its files and stopping.

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

**`common/hooks/` is 87 files and 12,177 lines**, which is not one sitting.
Measured 2026-09-02, by folder:

| folder | files | tests | lines | |
|---|---|---|---|---|
| `game/` | 15 | 12 | **5,284** | the game shell — see the question below |
| `ui/` | 14 | 5 | 1,831 | panels, gestures, media queries, `useSingleFlight` |
| `input/` | 9 | 6 | 1,344 | keys: shortcuts, cursors, tab rings, capture |
| `realtime/` | 4 | 3 | 1,081 | presence, reconnect, refetch |
| `session/` | 2 | 1 | 612 | `useSession`, `useProfile` |
| `chat/` | 2 | 2 | 687 | |
| `feedback/` | 3 | 3 | 558 | the local/global feedback pair |
| `scratchpad/` | 1 | 1 | 467 | |
| `definitions/` | 2 | 0 | 162 | `useDefinePopover`, `useDefinition` |
| `account/` | 1 | 0 | 85 | `useAccountMenuSection` |
| `club/` | 1 | 0 | 66 | `useClubRoster` |

**The first question at the opening: does this stay ONE area?** Two shapes, and
the split is not obvious:

- **as one** — the folder is the unit, and a hook's neighbors are what tell you
  whether a pattern is shared. 12k lines is large but half of it is tests.
- **split** — `game/` alone is 43% of the lines and answers to a different
  owner: those are the game SHELL's hooks (`useCommonGame`, `useGameTimer`,
  `useStandardGameActions`, `useHistoryViewer`), which is
  `shared-game-chrome`'s subject. Taking `game/` out leaves ~6,900 lines of
  genuinely cross-cutting hooks, which is an area.

**`deep`'s membership rule does not transfer.** "It names no game and no page"
was the rule for the deep layer; here it would exile `hooks/game/` (which names
no specific game — it is the shell shared by all sixteen) and `hooks/club/`
while admitting everything else, which is not the seam that matters. The seam
that matters is **who owns the hook's subject**, and that is what the split
question above is really asking.

## Findings

*(IDs are `F-hooks-1`, `F-hooks-2`, … — §21 → Areas. Every heading states its
status; no status prefix means OPEN.)*

## Notes, to-dos and deferrals

Findings, notes, and the record of what the sprint did here — **all of it lives
in this file**. Add freely: a line costs nothing and is the alternative to losing
it.

**The one thing that goes elsewhere:** something this area turns up that is
genuinely OUT of the sprint's scope goes to `docs/deferred.md`, deliberately and
by name. That is the app's standing register; this file is the sprint's record of
the area.

### Already waiting for this area

**1. `App.tsx` cannot be blessed until this area runs** (Joel, 2026-09-02). It
is `cs-met-deep` and audited — the boot pass took it — but six of its lines are
hook calls, and four of those hooks are this area's: `useSession`,
`useRealtimeReconnect`, `useBacktickEscape`, plus the two store reads
(`useEditProfileOpen`, `useWordEdit`) that decide what hangs off the root.
`usePath` is `deep`'s and is blessed already.

**2. Five hooks are already named by `homepage`'s dependency read** (2026-08-26,
in an audit since deleted; the findings themselves are gone but the files are
not): `useProfile` — a failed profile fetch is SILENT; `useTabRing` — its
on-screen test is false for a `position: fixed` element, and it is the mechanism
`plans/tab-rings.md` was written to produce, yet has no test at all;
`useAppShortcuts` — its docstring named two pages when three call it;
`useAccountMenuSection` — a docstring spending its length on what the code
replaced; and an orphaned docstring in `useProfile` sitting above the wrong
function. Re-derive rather than trust: these were read a week ago.

**3. `useAppShortcuts` returns JSX, and three pages must remember to render it.**
Raised by `deep`; the substance is in
[common-hosts.md](common-hosts.md) → note 1, because the fix is a mounting
question. What is THIS area's: the hook binds at two scopes — `~` and `⌥\`` are
global, `/` chat is page-dependent (`chat: false` on HomePage) — and a hook that
takes an option to turn off one of its three bindings is a hook doing two jobs.

**4. `useDefinePopover` is called at sixteen sites**, each holding its own
`{ word, rect }`. Whether that stays is
[common-hosts.md](common-hosts.md) → note 3's question (`TooltipHost` shows a
root-mounted anchored host works); the HOOK's shape is this area's.

**5. Four of `ui/`'s hooks are already `cs-met-deep`-adjacent** —
`useDraggablePanel`, `useFocusTrap`, `useConfirmation`, `useAcknowledge` were
read as machinery by the first `floating-panels` audit. That audit is deleted, so
they come back unread; its forward-pointing items are in §7 → "Carried forward".

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*
