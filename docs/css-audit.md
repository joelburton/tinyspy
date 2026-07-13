# CSS audit — dead CSS, duplication, documentation

*2026-07-13. A working audit doc (like test-audit.md was): work the items, then retire it —
durable decisions move into ui.md / code-conventions.md / deferred.md.*

**Scope + method:** all 142 CSS files (~10.4k lines; 127 CSS modules + the 15 theme/breakpoints
files). Dead-class detection resolved each module's actual importers and their `styles.x` /
`styles['x']` / `` styles[`x_${…}`] `` reads; token detection matched `var()` reads including
dynamically-constructed names (`var(--color-member-${name})`); every finding below was
hand-verified, not just script-flagged.

**TL;DR:** The CSS is in good shape — only one file has truly dead classes, and documentation
quality is top-decile (`theme.css` and `breakpoints.css` are model files). The real findings:
**4 dead game-theme tokens, 3 of which have comments that now lie**; a **~200-line
spellingbee↔wordwheel CSS near-copy** that the D2 extraction left behind; a handful of
accidental-drift spots the consistency doctrine says to kill; and a few doc gaps (no single
CSS-conventions checklist, no z-index ladder, two stale ui.md claims).

## 1. Dead CSS (verified)

**Dead module classes — one file:**

- `src/scrabble/components/PlayArea.module.css:95,103` — `.commitPill` and `.ghost` are
  unreferenced. The live `.ghost` moved to `BoardCol.module.css:104` during the PlayArea
  decomposition; these are leftovers (`.ghost` is byte-identical to the live copy).

**Dead global classes** in `src/common/theme.css`: `.cardList` (573), `.home-footer` (597),
`.dot-separator` (604) — referenced nowhere; the file's own header (line 13) still lists them.

**Dead theme tokens** (never read statically or via any dynamic `var(--…${…})` construction):

| token | file | note |
|---|---|---|
| `--wordiply-accent-edge`, `--wordiply-accent-dim`, `--wordiply-badge-text` | `wordiply/theme.css` | header comment (lines 10–11) documents two of them as in-use — **stale** |
| `--boggle-accent` | `boggle/theme.css:10` | comment says "highlight / selected path" but the real path highlight is `var(--color-accent)` (`boggle/components/PlayArea.module.css:112`) — **misleading** |
| `--stackdown-felt` | `stackdown/theme.css:8` | header (line 2) still advertises it; only `--stackdown-tile-ink` is consumed — **stale** |
| `--codenamesduet-assassin-soft-dim` | `codenamesduet/theme.css:40` | plain dead, no lying comment |

Related, half-tracked already: `wordwheel/components/Wheel.module.css:124` has the intended
`stroke: var(--wordwheel-accent-edge)` **commented out** with the fallback line kept —
mid-tuning leftover; deciding it either way also settles that token's fate.

**Explicitly NOT dead (protected or dynamic — a naive sweep would wrongly kill these):**

- The `common/theme.css` outcome trio grid (`-near-bg`, `-active-strong`, `-current-bg/strong`,
  `-neutral-bg/strong`) and `--tile-4-border` — guarded by the "vocabulary completeness — do NOT
  treat these as dead CSS" comment at `theme.css:129–134`. Note `docs/deferred.md` separately
  marks `near-bg`/`current-bg` as droppable-now, so there's a mild tension between the two docs
  worth reconciling.
- All `--color-member-*` and `--tile-1..4` tokens (built dynamically in `memberColor.ts` /
  stackdown `Board.tsx:24`), waffle/wordle `blank` classes, codenamesduet key classes, and
  everything behind `styles[tone]`-style lookups.
- Informational: `ActionButton`'s `success`/`near` tone classes are in the `ButtonTone` union
  but no wrapper ever passes them (only `warning`/`info`/`error` occur).
- boggle's `Stats.module.css` is **not** dead — it's a live drifted variant (see §2).

## 2. Duplication worth centralizing

In priority order (all evidence hand-checked, file:line cited):

1. **The spellingbee↔wordwheel fork CSS (biggest win, ~200+ lines).** D2 extracted the shared
   *TS* modules to `common/` but not the CSS. The two `PlayArea.module.css` files are identical
   except three geometry numbers and a var name (diffed); `TypedWord.module.css` is
   byte-identical (and wordwheel's copy references a nonexistent "wordwheel-ws" codebase — fork
   residue); `Letters.module.css`/`Wheel.module.css` share ~70% skeleton (interaction states,
   flash overlay + keyframes, text styling); the SetupForms are identical apart from wordwheel's
   `.checkRow`, itself byte-identical to bananagrams' (three games want a shared checkbox-row in
   `common/components/fields/setupForm.module.css`). Real drift has started inside the pair
   (stroke tokens/widths differ), which is exactly the accidental drift the doctrine targets.
2. **boggle Stats vs common Stats.** Same anatomy with accidental drift (label 10px/0.04em vs
   11px/0.06em, differing padding). The meaningful deltas — 4 columns, a `.percent` line, value
   color — are parameterizable (`--stats-cols`; boggle maps `--rank-text: var(--color-text)` in
   its theme like spellingbee/wordwheel already do). Nothing documents boggle's stats as
   deliberately smaller.
3. **The 2px info-panel frame ×3.** `TurnLog` (`.turnLogHeading/.turnLogBox`), `WordList`
   (`.heading/.box`), and bananagrams' `.handHeading/.handBox` whose comment says "Matches the
   shared WordList / TurnLog chrome" — the headings are byte-identical. A comment saying "must
   match X" is the standing signal to make the match structural.
4. **Hardcoded values that contradict siblings.** Scrabble's `.flashAccept`/`.flashReject` use
   literal `#2faa5a`/`#d24a4a` while `.viewedTile`/`.dropOk`/`.dropNo` *in the same file* use
   `var(--color-outcome-won/lost-strong)` for the same meaning (stackdown already does this
   right). Crosswords carries port-residue greys (`#444`, `#333`, `#475569`, `#f1f5f9`-hover ×2
   ≈ `--color-surface-hover`). And `crosswords/components/SetupForm.module.css:108,157` are the
   only redundant `var()` fallbacks in game CSS — `var(--crosswords-in-word, #d7ebff)` where the
   token is defined — which ui.md's no-fallback rule bans. (The fallbacks in `common/` like
   `var(--client-width, 100vw)` are a different idiom: opt-in parameter defaults.)
5. **Grid keyboard-cursor block** duplicated scrabble↔bananagrams (~20 lines, scrabble's comment
   says "(bananagrams style)", both already resolve to the shared `--grid-cursor` token) and the
   **drag-ghost tile** (the −3° rotate idiom, 3 copies of which one is the dead scrabble one;
   z-index/shadow/radius drift between the live two).
6. **One-liner drift kills:** `.slotViewing { position: relative }` identical in three games
   (psychicnum/codenamesduet BoardCol, connections PlayArea) solely to host the shared
   historyViewer banner (belongs in `historyViewer.module.css`); psychicnum's local `.definable`
   re-implements the global `.definable` utility (scrabble composes the global correctly;
   wordle's outline variant is documented-deliberate — leave it).

**Not worth chasing:** the `.loading/.empty` shapes (loading is an explicitly exempted moment),
the dashed empty-slot idiom (three different jobs), bespoke light modals, the small-caps
micro-label (folds into the already-deferred font-size-token item).

**Documented-deliberate, don't "fix":** square-board `--side` math ("NOT identical enough to
share" per the scaffold comment), no shared `--info-col-width` default (on purpose), per-game
`--avail-h` subtraction (already in deferred.md), the two-reds distinction, per-game vocabulary
palettes, the bananagrams/crosswords layout exceptions, the `.boardCol` debug tint.

## 3. Documentation

**What's there is genuinely excellent.** `common/theme.css` and `breakpoints.css` teach *why* at
nearly every block (OKLCH border derivation, iOS focus-zoom trap, svh-not-vh); only one module
in the whole repo has zero comments (`wordiply/components/LengthScoreBar.module.css`);
`@media (--mobile)` blocks and magic numbers are generally explained; `composes:` is used zero
times, matching the `cls()`-only practice.

**Stale docs found:** the three lying game-theme token comments above; `docs/ui.md:17` cites
codenamesduet's mobile-first three-column `PlayArea.module.css` as the extant counter-example —
that file is now a thin two-column scaffold coordinator and the anti-pattern no longer exists
anywhere; "eleven games" at `ui.md:624,735` and `code-conventions.md:295` (thirteen are live).

**Gaps, ranked:**

1. **Fix the stale token docs** (delete the dead tokens + doc lines, or mark them with the
   vocabulary-completeness disclaimer `theme.css:129` models). Worth adding the mirror-image
   guard to `src/cssTokens.test.ts` — it checks reference→definition but not
   definition→reference, so defined-but-dead tokens are invisible to CI; that guard would have
   caught all four.
2. **A consolidated CSS checklist in `code-conventions.md` §CSS Modules + theme** — four real
   conventions live only in ui.md/mobile.md prose or only in code: the no-`var()`-fallback rule
   + its test, the `@custom-media --mobile` desktop-first-override rule, the "state classes win
   by re-setting tokens, never by out-cascading" pattern, and "we don't use `composes`."
3. **Document the `_variant` naming convention** — `.outcome_won`, `.day_lost`, `.barInner_good`,
   `.viewedTile_oneAway` is a real, consistent implicit convention for `` styles[`base_${key}`] ``
   lookups; one sentence preserves it.
4. **A z-index ladder** — the tiers are commented at their sites but the full ladder (board
   layers 0–5 → controls 10–100 → modals 500 → bananagrams 1000 → popovers 1500 → chat 9999 →
   celebration 10001 → toasts 12000) exists nowhere, and scrabble's BlankPicker overlay at
   z-index 50 currently sits below the documented modal tier.
5. Fix the two stale ui.md claims, and give `LengthScoreBar.module.css` an orienting header.

## Suggested work order

Dead-CSS deletions + stale comment fixes (small, pure wins) → the cssTokens.test.ts mirror
guard → the spellingbee/wordwheel CSS fold → boggle Stats → the doc additions.
