# Area: scratchpad

The folders it reads: `scratchpad`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN — audited 2026-09-12, seven files `cs-audited-scratchpad`.
Sixteen findings: F-7 to F-10 worked on Joel's decisions, F-13 closed by
F-9's; the prose ones (F-1 to F-6) are next as one group, then the
remaining decisions one at a time.**

## The roster

Agreed 2026-09-12 (Joel: 1 yes · 2 yes — the SQL is read as evidence, the
ruling `chat` used).

- `src/common/scratchpad/GameScratchpadCompanion.tsx` + `.module.css`
- `src/common/scratchpad/useScratchpad.ts` + `.test.ts`
- `src/common/scratchpad/scratchpadOpenStore.ts`
- `supabase/tests/common/scratchpad_test.sql`
- `e2e/scratchpad.e2e.ts`

Plus `doc.md` (a one-line lede; the Design is owed — `DESIGNS_OWED` has the
row) and `todo.md` (one Someday, the monospace choice that waits for the setup
forms; one Maybe, the open-flag encoding chat and scratchpad store two ways) —
no stamp, markdown.

**Evidence, not roster — read and judged, findings recorded, fixed in place,
never stamped:** `supabase/sql/common.sql`'s scratchpad pieces — the
`set_scratchpad` RPC, `_bump_scratchpad_version` and its trigger, the
`game_scratchpads_select` policy, the grants — and `common.game_scratchpads`
in the baseline migration (`20260615000000_common.sql`).

Consumers: `game-page/GamePage` (mounts the companion and the header mark, both
gated on the manifest's `scratchpad` field; crosswords is the one manifest
that sets it), `page-header/ScratchpadButton` + its test (blessed; reads the
open store, as `ChatButton` reads chat's). The `⌥S` action is bound by the
mark itself. Guards that name the folder: `folderDocs` (the owed Design),
`vocabularies` (five exempt rows for the stylesheet), `orphanedDocstrings`
(one KNOWN row for the hook), `dbCallShape` (the builder-in-a-variable
allowance). Docs: `docs/common.md → The shared scratchpad`,
`docs/keyboard-shortcuts.md` (Tab hand-off, `⌥S`), `docs/ui.md` (the
unsettled take-over button, the companion family), `docs/supabase.md`
(pattern B, direct CDC apply), `docs/realtime-lost-events.md`,
`docs/games/crosswords.md` (the lock races, the `.takeOver` note). The
scratchpad's Tab-hand-off e2e case lives in `e2e/chat-keyboard.e2e.ts`
(chat's roster, blessed) — see Notes.

## Findings

### F-scratchpad-1 · `orphaned-docstring` · the hook's docstring sits on `SavedPad`

`useScratchpad.ts` lines 40–55: the twelve-line `/** The per-game scratchpad
body + … */` block is followed by a second `/** What set_scratchpad puts in
data … */` block and then `type SavedPad`, so the hook's own docstring is the
type's, stacked. `orphanedDocstrings.test.ts` carries it as a KNOWN row, owned
by this area. Fix: `SavedPad` and its docstring move above; the hook's
docstring sits on `export function useScratchpad`; the KNOWN row goes. (The
`SavedPad` docstring's "Nullable because its not-ok arms" — "the RPC's".)

### F-scratchpad-2 · `marker-pass` · `/**` on members, a note on a positional parameter

- `ScratchpadApi`'s four field notes (`canEdit`, `editingBy`, `canTakeOver`)
  are `/**`; a field note takes `//`. The type's own docstring is missing —
  it is what a caller reads, and it has none.
- `GameScratchpadCompanion`'s props block: `ownerId` and `isTerminal` carry
  `/**`.
- ~~`editingDisabled: boolean, // e.g. terminal — read-only`~~ — the
  parameter is gone (F-scratchpad-9, the pad stays editable at terminal).

### F-scratchpad-3 · `archaeology` · a review date, a finding code, and four "crossplay:" quotes

- `useScratchpad.test.ts`'s docstring: "the 2026-07-05 review flagged it as
  having zero unit tests", "the C3a HOLDER GUARD", and a describe block named
  `C3a holder guard`. The code and the date are a past review's; the test
  pins a behavior, and the behavior is the name.
- `useScratchpad.ts` lines 133–140: a nine-line comment on the holder guard
  that quotes crossplay and walks the whole race. The guard earns one
  sentence — "while I hold the shared lock my text is authoritative; a body
  that outruns my own flush must not revert it, and my next flush
  re-propagates" — and the test is where the race is spelled out.
- `docs/common.md` → The shared scratchpad: "(mirrors crossplay's
  `ScratchpadPanel`)". The port's source is crosswords' doc's business, not
  common's.
- `docs/code-conventions.md` line 240: "future scratchpad-takeover-lock" —
  it has shipped; the word "future" is the stale part.

### F-scratchpad-4 · `stale-claims` · sentences about code that no longer looks like that

- `scratchpadOpenStore.ts`'s docstring: "the header bubble" (the header's
  word is MARK); "Persisted to localStorage so the pad feels continuous across
  navigations within a session" — the module holds the value across
  navigations; storage carries it across a RELOAD (chat's twin says it
  right); "See useDraggablePanel" (the rect is the shell's, under
  `persistKey`).
- `GameScratchpadCompanion`'s docstring: "The header `<ScratchpadButton>`
  toggles it" — the mark AND the `⌥S` action, which the mark binds; "mirroring
  how chat keeps syncing when collapsed" — say what THIS panel does and why.
- `docs/common.md` → The shared scratchpad: "the panel rides on
  `FloatingPanel` + `useDraggablePanel`" — it is a `<Companion>`, the family
  word; `set_scratchpad(target_game, p_owner, p_body)` — the parameter is
  `p_owner_id`; "exactly like `useCells`" — `useCells` rolls back a refused
  write and this hook does not (its next keystroke re-flushes), so "like" and
  not "exactly like".
- ~~`supabase/sql/common.sql`, the play-state guard's comment~~ — the guard
  is gone (F-scratchpad-9).
- `scratchpad_test.sql` lines 60 and 108: "A BUG:, not a refusal" and "Also a
  BUG::" — two typos, and "refusal" is not the repo's word for a not-ok.
- ~~`useScratchpad.ts`: "(keep-logs ethos)"~~ — the comment was rewritten
  with F-scratchpad-9's flush change.

### F-scratchpad-5 · `rationale-in-docstring` · the store explains its design where a caller wanted its use

`scratchpadOpenStore.ts`'s second paragraph — "Like chat, open is an
app-global toggle (one boolean), not per-game; the per-game memory that
matters — where the panel sits — rides the panel's own persistKey" — is a
design decision, and it is the right one; its home is `doc.md`'s Design, and
the docstring keeps the one line a caller needs: who reads, who writes, what
storage does.

### F-scratchpad-6 · `doc-md` · the lede is one line and the Design is owed

`doc.md` is "The shared notes panel a club can write in while a game runs" —
and that is not quite it either: the pad is a GAME's, opted into per manifest,
shared in coop and private per player in compete. The Design is owed
(`DESIGNS_OWED`). Written in the prose pass from the answers: what a pad is
and who owns one; the two stores and the one seam (`GamePage` mounts the
companion with five things); the body's newer-wins sync and why a full-text
flush is enough; the lock — FE-only arbitration between friends, claim while
typing, release when idle, take over after grace, stale after silence; the
holder guard; that the notes outlive the game; the panel as a companion at
the companion rung, unlike chat.

### WORKED · F-scratchpad-7 · `take-over-button` · the case ui.md left for "next time the scratchpad is open"

**WORKED 2026-09-12 — Joel chose 1, the quiet tone**, after asking when the
button even appears (only on the shared pad, only while another player holds
the lock, and only when their last assert is 1.5–4 s old — so in practice only
after a holder vanishes mid-edit, for a window of ~2.5 s before staleness
frees the pad anyway; waiting always works, the button only saves the wait).
He looked at it behind a temporary always-show flag, said it looked fine, and
the flag came out. `.takeOver` and its hover are deleted, the `0.8rem` row is
off the vocabulary guard, ui.md's "genuinely unsettled" paragraph is gone, and
crosswords.md's note now says its own control is the one hand-rolled small
button left.

`docs/ui.md` → the small-size paragraph: "One case is genuinely unsettled:
`GameScratchpadCompanion`'s 'take over' — a small inline text button,
currently a white fill with a gray border … settle it next time the scratchpad
is open." `.takeOver` in the module is a hand-composed button: its own
padding, `font-size: 0.8rem`, a `--field-edge-color` border, `--field-fill-color`
fill, a hover. ui.md's rule since: nobody hand-composes a button's classes; a
small BUTTON takes `<StandardButton small>` (the buttons folder's todo says
the small-buttons item is settled that way). `docs/games/crosswords.md` line
620 cites `.takeOver` as the twin of its own hand-rolled control.

**The decision is the tone.** Shapes:

1. `<StandardButton small show="label" weight="secondary" tone="quiet"
   label="Take over" />` — gray outline and label. It is a courtesy override
   offered only once the holder has gone idle; nothing about it is the pad's
   main action. Recommended.
2. The same with `tone="normal"` — blue outline, the app's ordinary action.
3. Leave it hand-rolled and delete the ui.md paragraph anyway. Not
   recommended: the rule exists and this is the last case it names.

Either of 1–2 deletes the ui.md paragraph, drops the `0.8rem` row from the
vocabulary guard, and re-words crosswords.md's line 620 (its own control is
then the only hand-rolled one).

### WORKED · F-scratchpad-8 · `vocabulary` · the stylesheet has five exempt rows in the guard

**WORKED 2026-09-12.** Joel: the wrapper is mine to decide but it must add no
padding — the pad ends up with chat's visual padding; the textarea takes
`--font-size-2`; and the monospace face is DECIDED, a notepad is monospace.
The wrapper went: the shell's content column already pads, stacks, gaps and
fills a panel's parts (its stylesheet names this textarea as a case for
`.contentFills`), so the status bar and the textarea are the panel's two
parts and the margins are chat's by construction. `6px` went rather than
converted — the element rule already gives a field `--radius-md`; the rest
took `--spacer-4`, `--font-size-2`, `--line-height-1`. Four guard rows off;
`max(16px, 1em)` stays. The touch comment now names `base.css`, where the
floor lives (it said `theme.css`). The redundant `minWidth={240}` went and
`minHeight={200}` got the floating-panels rule's sentence. `todo.md`'s
Someday item is deleted and `setup-form/todo.md` no longer lists the
scratchpad among the unexamined mono faces.

`GameScratchpadCompanion.module.css` is in `vocabularies.test.ts` five times:
radius `6px` (→ `--radius-md`, twice), spacing `0.4rem` / `0.5rem` (the
`0.5rem` paddings are `--spacer-4`; the `0.4rem` gap sits between `--spacer-5`
0.25 and `--spacer-4` 0.5 and takes `--spacer-4`), font sizes
`0.85rem` (→ `--font-size-2`, the lock bar), `0.8rem` (F-scratchpad-7's),
`0.9rem` (the textarea), line-height `1.5` (→ `--line-height-1`), border
`1px` (→ `--border-width-line`). `max(16px, 1em)` stays, as chat's did — a
fixed iOS floor, not a token.

**One decision in it: the textarea's size.** `0.9rem` is between the ramp's
`--font-size-1` (1rem) and `-2` (0.85rem). Chat's entry took `-2`; the notes
are read back more than a chat line is.

1. `--font-size-2` — matches the chat box and the lock bar above it.
   Recommended: one text-entry size across the two panels you type into.
2. `--font-size-1` — body size; the pad reads as a document.

### WORKED · F-scratchpad-9 · `field-paint` · the textarea wears the page ground while its own button wears the field tokens

**WORKED 2026-09-12 — Joel's four decisions**, after asking when the pad is
read-only (at terminal, or while another player holds the shared lock):

1. **Read-only never mutes the text** — everyone wants to read the notes
   while someone else types. The `:read-only` rule is gone entirely.
2. **"Name is editing…" jumps out** — first as caution-orange text, which
   Joel found too hard to read; then, on his second word, as a `<DotActor>`
   for the holder (the roster member's name and disc, the claim's username as
   the fallback) with the sentence in full ink, where the bar's other lines
   are muted. That is also ui.md's rule: identity rides the disc, never the
   text. `editingBy` now carries `{ userId, username }` and the companion
   takes the club `members` to resolve the disc.
3. **The pad stays editable after the game ends.** The whole slice: the
   companion's `isTerminal` prop and the hook's `editingDisabled` parameter
   are gone (GamePage no longer passes the flag); `set_scratchpad`'s
   play-state guard and its PN305 race arm are deleted, so the RPC guards on
   membership only; the pgTAP race case became "a write after the game ended
   saves like any other"; the flush's race branch in the hook is gone. The
   "Game over — read-only." status text went with it.
4. **The pad paints like every other field** — the class's border, fill and
   ink overrides are gone and the element rule in `base.css` paints it. The
   `1px` row is off the vocabulary guard.

Verified: `tsc -b`, eslint, the folder's vitest + the guards, and the full
pgTAP suite (176 files) green after `gmake db-sql ENV=local`.

`.textarea` paints `background: var(--page-bg-color)` (the page's off-white)
with a `--page-surface-border-color` edge, and `.textarea:read-only` paints
`var(--default-bg-color)` — which since the core-css area's rename is the
SURFACE WHITE. So the pad is grayer when you can type and whiter when you
cannot, the reverse of what read-only means anywhere else, and the "Take
over" button beside it wears `--field-fill-color` / `--field-edge-color`, the
tokens a field is defined by. Every other field in the app is white with the
field edge.

1. The textarea takes the field tokens (`--field-fill-color`,
   `--field-edge-color`) and read-only keeps only the muted ink — no fill
   change, since a read-only pad is still the notes, just not yours to type in
   right now. Recommended.
2. Field tokens editable; read-only takes `--page-bg-color` (dips to the page
   ground) plus the muted ink.
3. Leave it.

### WORKED · F-scratchpad-10 · `hook-name-predicate` · `useScratchpadOpen` answers yes/no

**WORKED 2026-09-12 — Joel chose 1.** `useIsScratchpadOpen` here and
`useIsChatOpen` in chat, in one pass: the two stores, the companion, the chat
panel, both header marks and chat's store test. The code-conventions holdout
list is down to the info sheet's and the profile's.

`docs/code-conventions.md` → A hook that answers yes/no names itself as a
predicate: `useIsScratchpadOpen`; and "Several folders still spell it the
other way — `useChatOpen`, `useScratchpadOpen`, … They convert as each folder
is next worked on." This folder is being worked on. Chat was, twelve findings
ago, and kept `useChatOpen` — nothing in its area file decided that, so the
rule was missed, not overruled.

1. Rename here — `useIsScratchpadOpen` (three readers: the companion, the
   mark, the mark's test) — and take chat's twin in the same pass, the way
   chat's F-12 took this folder's `getScratchpadOpen`: `useIsChatOpen`, and
   the code-conventions sentence loses both names. Recommended.
2. Rename here only; chat's stays on the list.
3. Leave both.

### F-scratchpad-11 · `persist-key-shape` · the rect key has no name segment

`persistKey` is `puzpuzpuz:scratchpad:<gameId>`. The storage convention
(`web-storage/storage.ts`) is `puzpuzpuz:<area>:<name>` with any scope after:
`puzpuzpuz:chat:lastSeen:<clubHandle>`. Chat's rect is `puzpuzpuz:chat:rect`;
this one's should be `puzpuzpuz:scratchpad:rect:<gameId>`. Changing it orphans
every stored pad rect — a panel position, per game, which the next drag
rewrites.

1. Rename the key. Recommended; the orphaned values are nothing.
2. Leave it.

### F-scratchpad-12 · `always-on-timers` · two one-second intervals for the life of every coop game page

On the shared pad the hook runs while the panel is closed (it must: the body
and the lock keep syncing). With it run two `setInterval`s at 1000ms: the
staleness tick, which re-renders the hook's owner every second whether or not
anyone holds the lock, and the heartbeat, which returns early unless I hold.
Neither is needed until a holder exists: the tick's only reader is the
`foreign` derivation, which is null with no holder; the heartbeat's is me
holding. The companion returns null when closed, so the cost is a re-render of
nothing — but on an open pad it is a re-render of the textarea every second
for the whole game.

1. Gate both on a holder: run the tick while `holder` is non-null and the
   heartbeat while I hold. Recommended; same behavior, the timers exist only
   while they have a reader.
2. Leave them.

### CLOSED · F-scratchpad-13 · `lost-flush-unsurfaced` · the one loss the system can inflict is a console line

**CLOSED 2026-09-12 by F-scratchpad-9's third decision:** a finished game's
pad stays writable, so the RPC no longer refuses a late flush and there is no
loss to surface. The race arm, its comment and PN305 are gone.

`flush`'s race arm (PN305, "The game ended before that note saved.") says:
"A log line is all this layer can do — `flush` has no surface, and the pad it
belongs to may already be closed. Whether the player is told at all is a UX
question nobody has answered." The feedback system has since shipped, and the
pad's own status line ("Game over — read-only.") is a surface that is exactly
where the player is looking when the game ends under their keystrokes.

1. Surface it in the pad: the hook returns the lost note as a fact (`lastFlush:
   'saved' | 'lost'`, say) and the status line says "The game ended before your
   last note saved." in place of "Game over — read-only." until the pad
   closes. No pill — the loss is the pad's, not the page's. Recommended.
2. Leave it a console line; delete the "nobody has answered" sentence and
   say it is a decision.

### F-scratchpad-14 · `load-path-holder-guard` · the refetch does not have the guard the CDC path has

The CDC handler drops an incoming body while I hold the shared lock (the
holder guard). `load()` — run on SUBSCRIBED and on the attach confirmation,
so on every reconnect — applies the row it reads with no such check. A
reconnect while I am mid-flush, with a stray non-holder write already in the
row at a higher version, lands in my textarea the same way the CDC event
would have. The same one-line guard, for the same reason; the test that pins
the CDC guard gains a sibling. No decision in it — waiting to be done.

### F-scratchpad-15 · `username-default` · `GamePage` hands the pad `?? 'You'` as the name it broadcasts

`username={players.find((p) => p.user_id === session.user.id)?.username ?? 'You'}`
in `GamePage.tsx`. The name is what PEERS see in "… is editing" when I hold
the lock, so the fallback would read "You is editing…" on their screen. It
cannot happen — the viewer of a game page is one of its players — which is
the reason it should not be written as if it could: a default that cannot
fire is a slot-filler. `game-page` is not open; the line is this area's
contract. Fix in place: `memberById`'s player-side twin if one exists, else a
lookup that says the miss is impossible. Present with the options when the
area gets there.

### F-scratchpad-16 · `no-store-test` · `scratchpadOpenStore` has no test file

`chatOpenStore.test.ts` pins its twin: the set/get, the storage mirror, the
no-op write, both ways storage can fail, the hook, two subscribers, unmount.
`scratchpadOpenStore.ts` has none of it; `ScratchpadButton.test.tsx` touches
`getScratchpadOpen` and nothing else. A file per unit. Written in chat's
shape with the storage fake, minus the mounted-count block this store does
not have. No decision — waiting.

## Notes

- **Where the Tab hand-off e2e case lives.** `e2e/chat-keyboard.e2e.ts`
  holds "scratchpad: Tab hands the keyboard back to the game" alongside
  chat's three, because both panels share `handOffKeyboardOnTab` and the spec
  is about the contract. Listed here so the absence from
  `e2e/scratchpad.e2e.ts` is not read as a gap; it is not moved.
- **Two intervals, one `nowTick`.** F-scratchpad-12 is the only finding that
  changes timing; the lock's five constants (`FLUSH_MS` … `STALE_MS`) are
  read and left — each carries its meaning on its line, and the e2e relies on
  none of them.
- **The compete pad has no lock**, and the hook says so in one clause; the
  `shared` guards are where that is enforced. Read and fine.
- **The `minWidth={240}`** the companion passed was the shell's own default;
  `minHeight={200}` was a number nothing explained. Done with F-scratchpad-8:
  the first went, the second carries the floating-panels rule's sentence.

## Predicted test breaks

None at the audit; none seen. F-scratchpad-9 changed `useScratchpad`'s
signature (its test's three calls followed) and replaced one pgTAP case with
another at the same count. F-scratchpad-7 changed the button's markup (a `<button>`
with a `Take over` name either way — `useScratchpad.test.ts` never renders
it); F-scratchpad-10 renames a hook three files import; F-scratchpad-14 adds
a case to `useScratchpad.test.ts`; F-scratchpad-16 adds a file. `tsc -b`
catches the rename; nothing else has a test that would notice.

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
