# Area: web-storage

The folders it reads: `web-storage`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN** (2026-09-04). Roster agreed, five files `cs-met-web-storage`.

## The roster

| file | |
|---|---|
| `storage.ts` | the wrapper — `readStored` / `writeStored` / `removeStored` |
| `storage.fake.ts` | the shared test fake, with `blockAccess` and `failCalls` |
| `storage.test.ts` | |
| `useStickyChoice.ts` | the sticky-choice hook |
| `useStickyChoice.test.ts` | |
| `doc.md` · `todo.md` | |

**`src/guards/rawStorage.test.ts` is OFF the roster.** Joel, at the opening:
*"guards themselves are not part of the audit."* It is this folder's guard and
several findings below touch it, so what it may still take is a mechanical
consequence of a change made here — an `ALLOWED` entry deleted because the file
stopped touching raw storage — never a reading of the guard.

## The call sites

Ten reads and eight writes, in eight folders plus one game. Listed because
three findings turn on the shape of the set, not on any one caller. All are
`cs-unmet` and stay there — dependencies are listed, not audited.

| caller | store | `whenUnavailable` |
|---|---|---|
| `floating-panels/useDraggablePanel` | local | `null` |
| `boot/reloadOnStaleChunk` | session | `String(Date.now())` — **the only one that fails closed** |
| `chat/chatUnread` · `chat/chatOpenStore` | local | `null` |
| `scratchpad/scratchpadOpenStore` | local | `null` |
| `realtime/realtimeDiag` | local | `null` |
| `themes/loadTheme` | local | `null` — the only `removeStored` caller |
| `invitations/gameInvites` | local | `null` |
| `web-storage/useStickyChoice` | local | `null` |
| `crosswords/components/PlayArea` | local | `null` |

`useStickyChoice` has exactly one caller: `club/ClubPage`'s mode filter.

## Findings

### F-web-storage-1 · `key-convention-homeless` · The storage-key convention is written in two places, neither of which is the wrapper

Every key in the app is `puzpuzpuz:`-scoped and most read
`puzpuzpuz:<area>:<name>`. That rule is stated in **`useStickyChoice`'s `key`
param docstring**, where it binds one hook with one caller, and asserted in
passing by a `realtimeDiag` comment (*"the app-wide `puzpuzpuz:` scope like
every…"*). `storage.ts` — the file all ten call sites go through, and the one
a person opens before writing an eleventh — says nothing about keys at all.

Three keys already deviate, in two different ways:

- `crosswords:collapseRebus` — **no `puzpuzpuz:` prefix at all.** The only key
  in the app outside the scope.
- `puzpuzpuz:theme` and `puzpuzpuz:gameInvitesSeen` — scoped, but two segments
  rather than three. Arguably correct for a genuinely app-wide preference, and
  arguably `puzpuzpuz:invites:seen` for the second.

The convention is this folder's to state. The two deviating call sites are
other areas' to change.

**Open questions for Joel:** (a) is the two-segment app-wide form legal, or is
`<area>` always required; (b) does this get a guard, or only a stated rule?

### F-web-storage-2 · `sticky-test-fake` · `useStickyChoice.test.ts` hand-rolls a fake, and tests the wrong failure

Already `todo.md`'s Soon item. The file defines its own `FakeStorage` and
installs it on `window`, which is why it holds an `ALLOWED` exemption. Two
things the audit adds to what `todo.md` said:

- Its hand-rolled fake has no `removeItem`, so it is Storage-shaped only for
  the two methods this hook happens to call.
- Its "survives localStorage being unavailable" case spies on the fake's
  **methods** — the full-quota failure. It never makes the property ACCESS
  throw, which is the case `storage.ts` is named-rather-than-passed *for* and
  the one a browser blocking site data actually produces. `storage.fake.ts`'s
  `blockAccess()` exists precisely for it.

Adopting the shared fake fixes both, and drops the `ALLOWED` entry —
mechanically, since the guard's own "every `ALLOWED` entry still touches
storage" case goes red otherwise.

### F-web-storage-3 · `nine-of-ten` · A count in the docstring that is right today and rots at the next caller

`storage.ts`: *"Nine of ten want 'treat it as unset'."* Verified — ten read
sites, nine pass `null`. It is exactly the tally that goes stale silently: an
eleventh caller makes it wrong and nothing fails. The condition is what the
sentence is reaching for — **every caller but `reloadOnStaleChunk`, which fails
closed** — and that survives the count changing.

### F-web-storage-4 · `wrapper-argues-the-guards-case` · The wrapper's docstring and the guard's carry the same three paragraphs

`storage.ts` and `rawStorage.test.ts` both explain: why a wrapper at all (the
throw is on the property access), why `whenUnavailable` is required
(`reloadOnStaleChunk` fails closed and a benign default would have made a
reload loop), and the history — *"held by eight files and broken by two, and
those two were separate bugs found in a single audit."* Two copies of an
argument drift, and the second half is also archaeology, which CLAUDE.md keeps
out of durable prose.

The natural split is: the **wrapper** owns why it is shaped this way; the
**guard** owns why a guard exists and points at the wrapper. But the guard is
off the roster, so trimming only `storage.ts` would delete the half that is
better placed and leave the duplicate standing.

**Open question for Joel:** does the guard's docstring count as a mechanical
consequence here, or does this close with no change?

### F-web-storage-5 · `sticky-boolean` · One hook for a sticky choice; three sticky booleans hand-rolled

`useStickyChoice` is `useState` + validated persistence. Three other surfaces
are the same shape with two options:

- `crosswords/PlayArea`'s rebus toggle — `readStored` in a `useState`
  initializer, `writeStored` in the setter. This is `useStickyChoice` rewritten
  by hand, in a game.
- `chat/chatOpenStore` and `scratchpad/scratchpadOpenStore` — persisted
  booleans as `'true'`/`'false'` and `'1'`/`'0'` respectively, done as stores
  rather than hooks because something outside the panel toggles them.

The two stores have a reason to be stores; whether their string encoding should
agree is a smaller question with the same answer-shape. Crosswords has no such
reason. Reducing this to one idea is what the sprint is for, and the DECISION
belongs to this folder even though all three call sites are elsewhere.

**Open question for Joel:** does `useStickyChoice<'0' | '1'>` cover a flag, or
does the folder grow a `useStickyFlag`?

### F-web-storage-6 · `json-round-trips` · Two callers JSON their own values around the wrapper

`useDraggablePanel` (a rect) and `gameInvites` (a capped array of ids) each
`JSON.stringify` on the way in and parse-and-validate on the way out. The
wrapper is strings-only by design.

**Recommendation: close with no change.** Two callers, and each needs shape
validation on the way out that a shared helper could not do for it — a
`readStoredJson<T>` would hand back `unknown` and both callers would still
write the validation they write today. Recorded so it is a decision rather than
an omission.

## Notes

- **`storage.fake.ts`'s Node paragraph is worth keeping and worth re-checking
  when Node moves.** `window.localStorage` is `undefined` under vitest because
  recent Node defines its own experimental `localStorage` global that vitest
  leaves in place over jsdom's; `sessionStorage` is jsdom's real one. Every
  test touching local storage installs a fake for that reason alone.
- `FakeStorage` is not exported, though the exported `InstalledStorage` names
  it. Fine today (it only bites on declaration emit); noted so a future consumer
  wanting the type knows why it can't have it.

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
