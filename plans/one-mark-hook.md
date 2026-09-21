# One mark hook — the plan

**A PLAN, not a description.** It is here to be built and then deleted. The
durable half — what the hook is, when to reach for each option — folds into
[`src/common/board-marks/doc.md`](../src/common/board-marks/doc.md), and the
record of the reversal into
[`plans/areas/board-marks.md`](areas/board-marks.md). This file goes when the
last game is converted.

**Where it runs:** inside the `board-marks` area, **re-opened** for it (Joel,
2026-09-20). The `word-list` area **pauses** while this is in flight and resumes
after. The bookkeeping that carries that — the area files, the order in
[app-audit.md](app-audit.md) §3, and the plans table in
[CLAUDE.md](../CLAUDE.md) — is owed before the first step.

The change: **`useFlash`, `useMark` and `useAnnouncedMark` become one
`useMark`.** The decisions those three hooks encode — does this mark carry a
reason, does it announce itself first, does it end on a clock or on an action —
become options on one call instead of a choice between three imports with three
return shapes.

## The API

```ts
/** What the board reads: the value it was raised with, which stage it is in,
 *  and the raise it belongs to. Exported — the twin of today's `AnnouncedMark`,
 *  and the type a child names when a mark is passed down whole. */
export type Mark<T> = { value: T; phase: 'attention' | 'answer'; nonce: number }

function useMark<T>(ms: number | typeof NO_TIMER): [
  Mark<T> | null,
  (value: T, opts?: { attention?: boolean; onEnd?: () => void }) => void,
  () => void,
]
```

- **`ms` is the ANSWER's beat** — from `feedbackTiming` (or a game's own, as
  setgame's `ARRIVE_MS` is). A mark raised without `attention` is up for `ms`.
  A mark raised WITH it is up for **`ATTENTION_FADE_MS + ms`**: the fade first,
  in `'attention'`, then `ms` in `'answer'` — which is exactly
  `useAnnouncedMark`'s `lead + WORD_ANSWER_MS` today, and what stackdown's
  peer-mark spec measures (`ATTENTION_FADE_MS + WORD_ANSWER_MS + 10`).
- **`NO_TIMER`** means the mark stands until `clear`, which is the "until the
  next action" lifetime the vocabulary already names and no hook could hold.
  **`NO_TIMER` with `attention: true` is legal and is connections' verdict**:
  the phase flips at the fade and the mark then stands in `'answer'`.
  It is a **unique symbol** exported from `feedbackTiming` beside the beats, not
  a `null` and not a constant equal to one (Joel, 2026-09-20, offering both):
  a lifetime the vocabulary has a word for should not also be spellable as a
  bare `null` that says nothing about which lifetime was meant, and the type is
  what makes the name the only way in. Planted: `useMark(null)` is a compile
  error.
- **`T` is opaque.** The hook never reads it. A mark on board pieces carries
  its own noun for them (`{tiles}`, `{cells}`, `{letters}`); wordiply's carries
  no pieces at all.
- **`attention` and `onEnd` are options on `show`, not on the hook** — the
  same call can announce one raise and not the next (wordiply passes `peer`).
  `attention` defaults to false. The changeover to `'answer'` stays welded at
  `ATTENTION_FADE_MS` — that instant is when the flash finishes fading and the
  piece's own color becomes visible, not a preference.
- **`phase` is `'answer'` from the first render when `attention` was not
  asked**, so a plain flash reads only `value` and never looks at it. A mark
  that IS the attention flash (stackdown's returned tiles, on
  `ATTENTION_FLASH_MS`) therefore reads `'answer'` too; the docstring says so,
  because the word will look wrong to someone reading that call site.
- **`onEnd` runs when the CLOCK ends the mark.** Not on `clear` (the caller
  interrupted it and knows more than the hook does — today's rule), not on
  unmount, and never for `NO_TIMER` (nothing ends it). It is captured at
  `show`, so a later `show` replaces it along with the mark.
- **`show` while a mark is up replaces it and restarts the sequence from the
  beginning**, attention included if asked — today's rule in both hooks.
- **`nonce` bumps on every `show`, and is monotonic across clears**, so a
  board that keys marked pieces on it replays the animation on a repeat — and
  a `clear()` followed by a `show()` in the same handler still remounts.
- **`show` and `clear` are pure `setState`** — safe to call during render. The
  timers live in an effect; how it is keyed is the next section, because the
  obvious key is wrong.

### Why the timers move into an effect

`show` starting a `setTimeout` is what forbids it during render today, and a
mark raised during render is not exotic: connections detects a teammate's guess
by comparing renders and must raise the mark in the same commit the board
changes, so it splits the raise (render) from the beats (an effect) by hand.
Moving the timers inside makes every configuration render-safe and deletes that
hand-wiring.

It also fixes a small skew in the right direction. Today `show` starts the timer
in a handler, a commit *before* the class lands, so the JS changeover fires
marginally early against the CSS animation — the direction
`useAnnouncedMark`'s docstring warns about. From an effect it fires marginally
late, which is harmless.

### What the effect has to satisfy

"Keyed on the nonce" is not enough on its own, because two things the API
promises pull against each other: the phase flip must NOT restart the clock,
and `clear` MUST cancel it (or `onEnd` runs after a `clear`, which today's
`useAnnouncedMark` spec forbids). The invariants, each of which is a unit test:

1. `show` and `clear` write state through functional updates only — no ref
   writes, no timers — so both are legal during render.
2. The clock starts at the RAISE and is untouched by the `'attention'` →
   `'answer'` flip.
3. `clear` cancels the pending timers, so `onEnd` never runs after it. The
   effect's cleanup is the cancel, which means the effect must re-run when the
   mark goes null.
4. A timer from an earlier raise cannot touch a later mark: each timer's update
   checks the nonce it was started for and does nothing on a mismatch.
5. `nonce` is monotonic across clears (above).
6. `clear` on an already-null mark is not a render — return the same state.
7. The returned `Mark<T>` keeps its identity across renders that change nothing
   (`useMemo`), because callers memo on it (stackdown's `attentionTiles` and
   `boardAnswer`).

One shape that satisfies all seven, offered as a sketch rather than a
specification: hold **`{ current, seq }`** in one `useState` — `current` is
`{ value, nonce, attention, onEnd } | null`, a NEW object per `show` and
unchanged by the flip; `seq` is the monotonic counter — and hold **`phase`** in
a second `useState`, so the flip re-renders without replacing `current`. The
effect's deps are `[current, ms]`: it re-runs on a raise (new object) and on a
clear (null), never on the flip. It reads `current.attention` and
`current.onEnd` off its own dep, which keeps `exhaustive-deps` quiet without a
ref. The tuple's first element is `useMemo(() => current && { value, phase,
nonce }, [current, phase])`.

`onEnd` lives in state because it must be captured at `show`, and `show` may
run during render, where a ref may not be written (connections' `verdictSeq`
comment says why it is state today, for the same reason).

### What is NOT in it

- **No `useSimpleMark`.** A convenience face returning a bare set cannot carry
  `phase` or `nonce`, so switching a mark to announce itself would mean changing
  the hook *and* every read site — reintroducing the migration cost this merge
  exists to remove. The price is one derived line per set caller (the idiom
  under the evidence table), not a `?.value` at every read.
- **`useMoveAttention` and `useTurnStartFlash` are untouched.** Neither holds a
  caller's mark: one is a move-gated differ, the other a rising edge.

## Why this reverses two rulings in a closed area

`board-marks` was audited and closed 2026-09-16, and both hooks this plan
merges were *written* by that audit. The reversal is deliberate and the
reasoning has to be recorded, not quietly undone:

- **F-14 built `useMark` and `useAnnouncedMark` as a pair**, with the
  difference stated in both docstrings. What has become visible since is that
  the difference between them is a **per-game ruling that tile-feedback turns
  repeatedly** — scrabble's own comment says its green mark may be wrong because
  a player's own move needs no announcement. A decision made per game, in an
  audit that walks every game, should be an argument, not an import.
- **F-14 also left letterboxed unconverted** — *"letterboxed is not this hook's
  shape and was not touched"* — because its refused word has no clock. `ms:
  null` is exactly that shape.
- **F-14's own option (2) foresaw this**: giving `useMark` an `onEnd` would mean
  *"two hooks carry the same option and the difference between them shrinks to
  the announce phase."* That is where they are now.
- **F-15 rejected a raise counter in `useMark`** on the grounds that it *"helps
  only boards that hold a mark, which is the two that already worked."* That was
  right for the gap it was fixing (boggle's non-replaying shake, fixed in
  place). It is not an argument against a nonce that comes free with the engine
  — but see "Who reads the engine's nonce" below, because the three keying
  idioms F-15 kept are not all served by one.

## Evidence — every call site

The "becomes" column writes the hook call and, after `·`, what `show` is
passed — `attention` and `onEnd` are `show`'s, never the hook's.

| game | file | what it holds | becomes |
|---|---|---|---|
| boggle | `PlayArea` | `useMark<{cells, outcome, nonce}>(WORD_ANSWER_MS)` + a `useRef` counter | `useMark<{cells, outcome}>(WORD_ANSWER_MS)`; the ref and the field go; `BoardCol`'s `answered` prop becomes `Mark<{cells, outcome}> \| null` and its key reads `answered.nonce` as it does now |
| spellingbee | `PlayArea` | `useMark<{letters, outcome}>(WORD_ANSWER_MS)`, plus a separate `shakeNonce` keying the whole hive | same call; unwrap `.value` where the prop is passed, so `BoardCol` and `Letters` are untouched; the hive's own nonce stays |
| stackdown | `PlayArea` | `useMark<WordFlash>(WORD_ANSWER_MS)` | same call; unwrap `.value` at the `flash=` prop, so `BoardCol` and `WordEntry` are untouched |
| stackdown | `PlayArea` | `useAnnouncedMark<{ids, answer}>()` — a peer's word | `useMark<{ids, answer}>(WORD_ANSWER_MS)` · `show(v, {attention: true})`; the two `useMemo`s read `phase === 'attention'` / `'answer'` |
| stackdown | `PlayArea` | `useAnnouncedMark<number[]>()` with `announce: false` + `onEnd` | `useMark<number[]>(WORD_ANSWER_MS)` · `show(ids, {onEnd})`; `refusedWord !== null` unchanged |
| stackdown | `PlayArea` | `useFlash<number>(ATTENTION_FLASH_MS)` — returned tiles | `useMark<{ids: number[]}>(ATTENTION_FLASH_MS)`; `attentionTiles` seeds its set from `returned?.value.ids ?? []` |
| stackdown | `BoardCol` | `useFlash<number>(AMBIGUOUS_PICK_FLASH_MS)` | a set caller (idiom below); `NO_TILES` is already there for the resting value |
| wordiply | `PlayArea` | `useAnnouncedMark<{word, outcome}>()`, both audiences | `useMark<{word, outcome}>(WORD_ANSWER_MS)` · `show(v, {attention: peer, onEnd})`; `BoardCol` + `GuessBoard` import `Mark` in place of `AnnouncedMark` and read the renamed phases |
| scrabble | `BoardCol` | `useFlash<number>` ×3 — green, yellow, red | three set callers; they stay three (they can be up at once). `flashRed` is handed a `Set`, `flashGreen`/`flashYellow` arrays — the value's noun takes whichever, the derived set is what the props read |
| strands | `PlayArea` | `useFlash<Coord>(AMBIGUOUS_PICK_FLASH_MS)` | a set caller — **and its two `flashAmbiguous([])` calls (a click answered the question; a submit) are CLEARS, and become `clear()`.** `show({cells: []})` would raise a mark of nothing, bump the nonce and start a clock |
| setgame | `PlayArea` | `useFlash<CardCode>(ARRIVE_MS)` | a set caller; `clearArriving` is already `clear`; the `for (const card of arriving)` iterates the derived set |
| psychicnum | `Board` | `useFlash<string>(VERDICT_SHAKE_MS)` | a set caller. **Its `shakeAfterFlash` effect and `setTimeout(…, ATTENTION_FADE_MS)` stay**: they look like the changeover this hook now owns, but the attention half there is `useMoveAttention`'s, not this mark's — the shake waits on a flash it did not raise |
| connections | `BoardCol` | two `useFlash` + a hand-rolled standing `verdict` + `verdictSeq` | `useMark<BoardVerdict & {msgId}>(null)` · `show(v, {attention: true})` — the one mark, whose `phase` draws the flash AND the shake (decision 1, settled). `setVerdict(null)` at the tile click, and the `marks`-false arm of the render-path raise (a teammate's `won`, or viewing history), become `clear()` |
| letterboxed | `PlayArea` | hand-rolled `{word, nonce}`, cleared by the next keystroke | `useMark<{word: string}>(NO_TIMER)`; `setRefused(null)` ×4 become `clear()`; `BoardCol`'s `refused` prop becomes `Mark<{word}> \| null` and `Board` keys on `refused.nonce` as now |

Ten games, sixteen call sites. **Mostly mechanical, with two that are not:**
connections sheds real logic (its attention instance, its `setTimeout`, its
`verdictSeq`, both `+1` sites) and letterboxed adopts a shape it never had.
Everything else is a rename, an unwrap and a null check.

### The set-caller idiom

`useFlash` returned a set that was never null, so its readers call `.has()`
unguarded and its props are typed `ReadonlySet<T>`. The merged hook returns
null at rest. The conversion does NOT push `?.value.ids.has(x)` into every
reader: it **derives the set once, beside the hook**, and everything below the
hook stays as it is —

```ts
const [ambiguousMark, showAmbiguous, clearAmbiguous] =
  useMark<{ ids: ReadonlySet<number> }>(AMBIGUOUS_PICK_FLASH_MS)
const ambiguousTiles = ambiguousMark?.value.ids ?? NO_TILES
```

— with the resting value a module-level constant (most of these files already
have one: connections' and stackdown's `NO_TILES`, scrabble's `NO_CELLS`), so
that a render at rest hands children the same object each time, which is the
stable-empty property `useFlash`'s `EMPTY` had. The value holds a `Set` where
the readers call `.has()` and an array where they only iterate; the raise
builds it (`show({ ids: new Set(matches.map(m => m.id)) })`). That is the whole
cost of the "no `useSimpleMark`" ruling above: one line per call site, not one
per read.

## Settled

- **Phase value names:** `'attention' | 'answer'`, replacing `'pointing' |
  'answering'`. With `announce` gone, `'pointing'` would be a third word for the
  yellow flash.
- **Every game converts**, letterboxed included (Joel, 2026-09-20). `NO_TIMER`
  is the shape F-14 had to leave it behind for.
- **No file stamps change.** This is retro-fixing what the area already built;
  Joel re-reads and re-blesses at the end.

### Who reads the engine's nonce

It costs nothing to ignore, so this changes no step — only how much
hand-rolled counting is deleted.

- **Reads it, and deletes its own:** boggle, letterboxed, connections. All three
  key marked *pieces*, and the key already reverts when the mark clears.
- **Keeps its own:** spellingbee and wordwheel, whose nonce keys the **whole
  board element** (`Letters.tsx` keys the `<svg>` and holds `verdictShake` on
  `nonce > 0`, so the replay IS the remount). Reading a mark's nonce there would
  change the key twice — raised, then cleared — and the board would shake a
  second time as the mark ends.
- **Has none:** psychicnum, whose shake never replays. Whether it wants one is
  psychicnum's call, not this plan's.

## Decisions

Numbered, so an answer can name one.

### Decision 1 · connections' shake — ride the phase, or a second mark?

**SETTLED 2026-09-20 — ride the phase** (Joel: *"definitely yes"*, on
confirming it is one `useMark` and one `show`, not two marks).

Today connections raises the shake as its own `useFlash(VERDICT_SHAKE_MS)`,
from an effect, `ATTENTION_FADE_MS` after the verdict — the hand-wired
changeover. Once the verdict is a `Mark` with `attention: true`, its `phase`
IS that changeover, and there are two ways to draw the shake:

- **Ride the phase** (recommended). `Board` puts `shared.verdictShake` on a
  tile when `verdict.phase === 'answer'`, next to the fill it already draws;
  `attentionFlash` goes on when `phase === 'attention'`. The class then STANDS
  with the verdict, which is boggle's and letterboxed's idiom exactly: the
  animation plays once when the class lands, and a repeat replays because the
  tile is keyed on `verdict.nonce`. Deletes the `flashThenShake` effect, its
  `setTimeout`, both `useFlash` instances, and `Board`'s `attentionTiles` and
  `shakenTiles` props. Nothing is lost: every verdict that lands on tiles is a
  refusal (the comment at the effect says so), so today's shake has no outcome
  test to carry over.
- **A second mark.** Keep `shakenTiles`, raised as `useMark(VERDICT_SHAKE_MS)`
  from an effect that watches `verdict?.phase === 'answer'`. One effect fewer
  than today and no timer, but a prop and a hook for a beat the phase already
  names.

The plan's evidence row for connections was first written as if the second mark
were settled; the ruling is the first.

## Steps

Each step compiles and its tests pass on its own. **No shims** — where an old
hook's callers must move for the tree to typecheck, they move in the same step,
and nothing dual-runs.

1. **The hook.** Rewrite `useMark.ts` to the API above; grow `useMark.test.ts`
   to cover the seven invariants — both phases and the total lifetime under
   `attention`, `NO_TIMER` with and without `attention`, the nonce (bumps per
   raise, survives a clear), `onEnd` runs at the clock and not after `clear`,
   a stale timer leaves a newer mark alone, and a `show` called during render
   (a wrapper component that raises from its own render body on a prop, guarded
   on the mark being null so it cannot loop). The three existing `useMark`
   callers (boggle, spellingbee, stackdown) move in this step, because the
   signature change breaks them — boggle's `useRef` counter and `nonce` field
   go here too, since its `BoardCol` key reads the engine's nonce from then on.
2. **The announce callers.** stackdown ×2 and wordiply onto `attention`, with
   the phase rename reaching `wordiply/BoardCol` and `GuessBoard`. Delete
   `useAnnouncedMark.ts` and its test.
3. **The set callers, by game.** psychicnum · strands · setgame · stackdown ×2 ·
   scrabble ×3. Delete `useFlash.ts` and its test when the last one lands.
4. **connections.** The attention instance disappears into `phase`; the
   verdict becomes `useMark(NO_TIMER)` raised with `attention: true`; the shake
   rides its phase (decision 1). Its two raisers both call `show` — the
   render-phase one legally now — and `Board`'s `BoardVerdict` loses its
   `nonce` field (the key reads `verdict.nonce` off the `Mark`) and both the
   `attentionTiles` and `shakenTiles` props.
5. **letterboxed** — the hand-rolled standing mark onto `useMark(NO_TIMER)`.
6. **The prose.** In `board-marks/doc.md`, six places, not two: the intro's
   third-question paragraph (three shapes → one hook, three options); the
   "Who calls what" table (three rows → one) and the setgame paragraph under
   it, which names `useFlash`; "Neither `useFlash` nor `useMark` has a default
   duration"; "Announce, then answer, and the changeover is the fade" (the
   hook takes `ms` now, so "the hook takes neither" is false); "`useFlash`'s
   trigger starts a timer" — **this one changes its argument, not just its
   name**: it gives render-unsafety as the reason `useMoveAttention` exists,
   and with `show` render-safe the reason is the diff (a move-gated differ
   over `useChangeCause`), which is what the "What is NOT in it" bullet above
   says; and "A mark that must fire twice in a row needs a key that changes",
   where the counter is now the hook's and the three keying idioms stay.
   Outside it: the replay rule beside `.verdictShake` in
   `game-page/playArea.module.css` (its last sentence is about a `useFlash`
   set); `docs/playarea.md` → "Split flashes by their trigger" names
   `useFlash`; `plans/tile-feedback.md` → scrabble's "Today" paragraph; the
   reversal already recorded under F-14 / F-15 in the area file gets its
   WORKED line. `plans/areas/turn-log.md` also names `useFlash`, in a finding's
   record — history, left alone.

## Risks worth watching

- **Fake-timer specs should pass UNCHANGED, and a red one is a bug.**
  stackdown's F-16 spec asserts `clearWord` is not called a millisecond before
  `WORD_ANSWER_MS` and is called at it; its peer-mark spec reads the phase at
  `ATTENTION_FADE_MS + 10` and the end at `ATTENTION_FADE_MS + WORD_ANSWER_MS
  + 10`. Under `act()` the effect flushes before the `act` returns and fake
  time does not move between the handler and the effect, so "the clock starts
  a commit later" costs zero fake milliseconds. A spec that goes red after a
  conversion is therefore not a baseline to move: it is the hook getting a
  lifetime wrong (most likely `ms` read as the total instead of the answer's
  beat).
- **A mark read through `?.value` at ten new sites** is where a typo turns into
  a mark that never draws. Each converted game keeps a spec that fails with the
  class missing.
- **e2e is not run for this without asking** ([CLAUDE.md](../CLAUDE.md), the
  testing priors), and no commit happens unless Joel asks for it.

## Review, 2026-09-20

A second read against every call site, before anything is built. What it
changed in this file, numbered so a line can be argued with:

1. **`attention` and `onEnd` were written as hook arguments in the evidence
   table** (`useMark(WORD_ANSWER_MS, {attention: true})`) while the API puts
   them on `show`. wordiply needs them on `show` — `peer` varies per raise.
   The table now separates the hook call from the `show` options.
2. **`ms` under `attention` was ambiguous** — the total, or the answer's beat?
   The specs decide it: stackdown's peer mark is up for `ATTENTION_FADE_MS +
   WORD_ANSWER_MS`, so `ms` is the answer's beat and attention prepends the
   fade. Written into the API.
3. **"Keyed on the nonce" leaves `onEnd` running after a `clear`**, because a
   counter that survives the clear does not change when the mark goes null, so
   the effect never cleans up. The seven invariants and a sketch that meets
   them are the new section under "Why the timers move into an effect".
4. **The nonce must be monotonic across clears**, or `clear()` then `show()` in
   one handler leaves the deps unchanged — no restart, no remount. Added to the
   API and the invariants.
5. **The set callers had no idiom**, and "the price is `mark?.value.tiles.has`
   at ten sites" was the wrong price: derive the set once beside the hook,
   with a stable resting constant, and no reader or child prop changes. New
   section under the table.
6. **strands calls `flashAmbiguous([])` twice to CLEAR.** Ported as `show`,
   that raises a mark of nothing and starts a clock; it is `clear()`. In the
   table.
7. **psychicnum's `setTimeout(…, ATTENTION_FADE_MS)` looks like the
   changeover but is not this hook's** — its attention half is
   `useMoveAttention`'s. Said in the table so it is not "simplified" away.
8. **connections' shake was a decision written as a fact.** Now decision 1,
   with the phase-riding form recommended.
9. **`Mark<T>` is named as the exported type** (wordiply's two children and
   boggle's `BoardCol` name it in props). codenamesduet's pdf model has an
   unrelated local `Mark` — different module, no collision.
10. **Step 6 named two doc.md places; there are six**, and one of them (the
    render-unsafety paragraph) changes its argument rather than its wording.
    Enumerated.
11. **The fake-timer risk was overstated in the wrong direction**: under
    `act()` no fake time passes between handler and effect, so the specs
    should pass untouched and a red one is a hook bug, not a baseline. Rewritten.
12. **`phase` on a mark that never asked for attention** reads `'answer'`, and
    on stackdown's returned tiles (a mark that IS an attention flash) that
    will look wrong to a reader. A docstring sentence, noted in the API.
