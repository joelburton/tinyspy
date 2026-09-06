# Area: corecss

The folders it reads: `core-css` · `themes`. The process is
[app-audit.md](../app-audit.md) §4; the plan holds the order, this file holds
the reading. Owed work lives in each folder's `todo.md`, not here.

**Status: OPEN (2026-09-05).** Roster stamped `cs-audited-corecss`; every
file read in one sitting; findings below.

## The roster

Agreed 2026-09-05 (Joel: "stamp and read. commit, then audit.") — every file
of `src/common/core-css/` and `src/common/themes/`, less the two `boot`
blessed:

| file | what it is | stamp |
|---|---|---|
| `src/common/core-css/base.css` | the element layer and every shared non-color value: the font face, the seven non-color vocabularies, depth, the three dims, the z- ladder, page geometry, the resets, the four heading levels, the bare `<button>`, the print sheet | `cs-audited-corecss` |
| `src/common/core-css/fixed.css` | the colors exempt from theming, loaded outside the chain: the eight member fill/edge pairs and the wordle fills + edges | `cs-audited-corecss` |
| `src/common/core-css/utilities.css` | the global classes that are adjustments: `.card`, `.muted`, `.error`, `.actions`, `.divider`, `.link-button`, `.definable`, and the `[data-tooltip]` long-press rule | `cs-audited-corecss` |
| `src/common/core-css/patterns/badge.css` | `.badge` — the one-word category lozenge; paints no color, the border is `currentColor` | `cs-audited-corecss` |
| `src/common/core-css/patterns/focus-ring.css` | `--chrome-cursor-ring` and the three-offset rule for where the ring sits | `cs-audited-corecss` |
| `src/common/core-css/patterns/heading.css` | `.heading-with-controls` — a heading on the left, the control that changes what is below it on the right | `cs-audited-corecss` |
| `src/common/core-css/patterns/page.css` | `.pageHeaderAndMainArea`, `.pageMain`, `.pageMain-fills` — the bounded page and the part inside it that scrolls | `cs-audited-corecss` |
| `src/common/core-css/patterns/segmented.css` | `.segmented` — a joined row of mutually exclusive options, the chosen one read off `aria-pressed` | `cs-audited-corecss` |
| `src/common/core-css/doc.md` | a one-sentence lede; Design owed | (no stamp — markdown) |
| `src/common/core-css/todo.md` | one Soon (the scroll-region utility), eight Someday, two Maybe at the open | (no stamp — markdown) |
| `src/common/themes/daylight.css` | the shipping light theme: the complete role → hex grid, every family a rectangle with its formula beside each cell | `cs-audited-corecss` |
| `src/common/themes/light-mode.css` | what is true of every light theme — one declaration, `color-scheme: only light` | `cs-audited-corecss` |
| `src/common/themes/midnight.css` | the dark spike behind `?theme=midnight`: every daylight role answered in the same order, with each flipped formula saying so | `cs-audited-corecss` |
| `src/common/themes/dark-mode.css` | the dark twin of light-mode.css — `color-scheme: only dark` | `cs-audited-corecss` |
| `src/common/themes/doc.md` | a one-sentence lede; Design owed | (no stamp — markdown) |
| `src/common/themes/todo.md` | one Soon (the `--page-surface-color` rename), three Someday, one Maybe at the open | (no stamp — markdown) |

**Decided at the opening, and why:**

- **`loadTheme.ts` and `loadTheme.test.ts` stay `cs-blessed-boot`**, per the
  areas table. A change this area's reading needs in the loader ships with
  this area as a conformance edit; the stamp is `boot`'s.
- **Evidence, not roster:** `src/main.tsx` (the one importer of the stylesheet
  chain), `docs/ui.md` (the doc whose subject is these folders),
  `docs/buttons.html` and `plans/dark-mode.md`. Same ruling `supabase`,
  `session` and `realtime` made for their docs: a forward fix happens where a
  sentence is about this area's files, and nothing else is touched. The guards
  that read these files (`cssTokens`, `vocabularies`, `tileColor`) are never
  roster. Posed as Joel's call at the open; "stamp and read" took the list as
  proposed, so recorded as the reversible reading.
- **The `/* @@ */` markers are this area's biggest fact** — the twelve
  stylesheets carry 489 of them, and a marker comes off only when Joel has
  seen the rule in place and says it looks right. Whether the burn-down is
  this area's work or waits for step 12 was posed at the open and is NOT
  ruled; the findings below do not touch a marker.

## Findings

*(`F-corecss-1 · slug · title`, one heading each; a status prefix when it has
one, no prefix means OPEN)*

## Notes

*(things worth remembering about this area that are neither a finding nor
owed work — a forward-fix made from another area, a question for the opening,
a dependency listed and left. Anything durable goes to the folder's `doc.md`
or `todo.md` instead; a note here never stands in for either)*

## Predicted test breaks

*(the spec names, written when the area starts changing things)*

## Closing

- [ ] the whole area re-read in one sitting after the last group
- [ ] the folder's `doc.md` Design written; its row off `DESIGNS_OWED`
- [ ] `todo.md` holds everything still owed; nothing durable left in this file
- [ ] every file on the roster blessed, or its stamp says why not
