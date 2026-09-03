# Area: chat

An area of app-audit's step 7. The process is [app-audit.md](../app-audit.md)
§21; **the plan holds the order** (§7 → "The areas, in order"), this file holds
everything else.

**What it is.** The club chat panel, end to end — the floating panel you type
into while a game is running, and the stores and hooks behind it. Chat is the
thread that runs across every game a club plays (CLAUDE.md → the club IS the
Zoom call), so it is a feature in its own right rather than a part of any page.

**Created 2026-09-03** by Joel, when `utils` had a one-line item to hand to
whoever owns `chatOpenStore.test.ts` and found that **nobody did** — chat's ten
files were named by no row of §7's table.

**Status: NOT OPENED.**

This file exists **before** the area opens so there is somewhere to put a note the
moment one turns up. Nothing below is a commitment; the roster is agreed with
Joel when the area actually opens, by listing its files and stopping.

## Why chat is not `club-page`'s

The item above was filed under `club-page` for a day, on the reasoning that the
club is chat's venue. **That was wrong, and the evidence is one line:**

```
src/common/components/club/ClubPage.tsx:1179      <Chat …
src/common/components/game/GamePage.tsx:713       <Chat …
```

`<Chat>` is mounted by **both** pages. So it belongs to a page no more than the
page header does — and `page-header/` is exactly the precedent
(docs/common-folders.md: *"Furniture that every page carries and no page owns …
filing it under any one of them is what let three copies drift"*).

## The roster

*(agreed with Joel when the area opens — §21: list the files and STOP)*

The surface as it stands, listed so the shell is useful rather than empty —
**not agreed**. Measured 2026-09-03: **10 files, 1,529 lines.**

```
components/chat/    Chat.tsx · ChatBody.tsx · ChatBody.module.css
lib/chat/           chatOpenStore.ts (+test) · chatUnread.ts (+test)
hooks/chat/         useClubChat.ts (+test) · useChatFeedback.tsx (+test)
```

**`ChatButton` is NOT here** — it stays in `page-header/`, by the rule that a
mark living in the strip belongs to the strip even when what it opens lives
elsewhere (docs/common-folders.md → "Where does a new file go?"). Same for
`ScratchpadButton`. Whether the *unread* logic it renders is chat's or the
strip's is a real question for the opening, since `chatUnread.ts` is on this
roster and the badge is not.

**`hooks/chat/` is THIS AREA'S** — settled 2026-09-03, Joel: *"move hooks/chat to
chat."* It was on [hooks.md](hooks.md)'s roster for an hour; the rule that
resolves it is **the subject's owner takes its hooks**, and chat's hooks
(`useClubChat`, `useChatFeedback`, 687 lines) are chat.

**Only the reading moved, not the files.** `common/hooks/chat/` stays where it
sits: docs/common-folders.md's three-layer echo is deliberate, so that everything
about a concept is findable by its name in each layer.

**It settles `hooks`'s opening question too**, which is the larger consequence.
That area asks whether `hooks/game/` (5,284 lines) splits off to
`shared-game-chrome`; the same rule says yes, and nothing distinguishes 687 lines
from 5,284.

## Findings

*(IDs are `F-chat-1`, `F-chat-2`, … — §21 → Areas. Every heading states its
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

**1. `chatOpenStore.test.ts` should adopt `storage.fake.ts`, and drop its guard
exemption** — from `utils`, 2026-09-03.

jsdom in this project ships **no `localStorage` at all** — `window.localStorage`
is `undefined` under our vitest config — so a test touching storage installs a
Storage-shaped fake first. This file hand-rolls one, as `useStickyChoice.test.ts`
does (see [hooks.md](hooks.md) → note 6, the same item for the same reason).
`utils` extracted the third copy rather than write it:
`common/lib/util/storage.fake.ts` provides `installFakeStorage()` and a `block()`
that makes every method throw — which is what this file hand-does with
`vi.spyOn(…, 'setItem')` at `:96` and `:102`.

The production side is already converted: `chatOpenStore.ts` and `chatUnread.ts`
call `readStored` / `writeStored` now. Only the TEST still reaches for raw
storage, and it is one of five entries in `src/guards/rawStorage.test.ts`'s
`ALLOWED` list — a list built to shrink.

**2. `ChatBody`'s Tab hands the keyboard back to the game, and that behavior has
a scheduled successor.** `handOffKeyboardOnTab` (`ChatBody.tsx:158`) is row 7 of
the eight in [tab-rings.md](../tab-rings.md) — "ring transition". The conversion
is [floating-panels.md](floating-panels.md)'s, since the other caller
(`GameScratchpadCompanion`) is theirs and the two convert together; it is noted
here so this area does not read the handoff as bespoke.

## Predicted test breaks

*(written when the area starts changing things, per §21's test-break rule:
predict them, name the specs, leave them)*

`e2e/chat-keyboard.e2e.ts` pins the panel ⇄ game keyboard round trip (`/` takes
the keyboard, Tab hands it back), tested against boggle. Anything touching
`ChatBody`'s key handling answers to it.
