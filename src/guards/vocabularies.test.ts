// cs-unmet

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard: a converted surface writes VOCABULARY values, not literals.
 *
 * The sprint applies its vocabularies area by area, not in one sweep
 * (docs/tokens.md → The a/b/c rule): a raw value
 * equal to a vocabulary value is changed silently, one that isn't gets
 * looked at once, in context. Which means a guard that fails on every
 * unconverted file would be red for weeks, and a guard that only warns is
 * one nobody reads.
 *
 * So this is a **SHRINKING ALLOWLIST**, the mechanism §10 specifies, and it
 * shrinks BY VALUE rather than by file:
 *
 *   - a value not yet converted sits on its file's `pending` row and is
 *     silent;
 *   - any OTHER literal in that file FAILS — so converting one value on a
 *     page protects it immediately, even while another value on the same page
 *     is still open;
 *   - a NEW file fails immediately, because it has no row at all — which is
 *     the property that makes this worth having on day one, before a single
 *     surface converts.
 *
 * Delete a value from a row when it converts, and the row when the file is
 * clean. Both are enforced: a listed value that is no longer written, and a
 * row whose file no longer offends at all, each fail. The day every object is
 * empty, this file has done its job.
 *
 * ⚠️ TUNED SURFACES ARE EXEMPT, and that is the DEFAULT scope, not the rule.
 * A game's board fits its own game; that is what tuned means (docs/naming.md
 * → tuned / justified / locked), so a vocabulary checks the shell — both
 * `src/common/` and `src/shared/` — unless it says otherwise.
 *
 * Shared is in scope for the same reason common is: a family's surface
 * (`RankBar`, `GuessKeyboard`, the grid cursor) is worn by two or three games
 * and is nobody's tuned board, so it answers to the app's vocabulary. The two
 * roots are one scope, not two policies — before the restructure these files
 * sat under `src/common/` and were checked by this same list.
 *
 * `z-index` says otherwise, and is the shape of the exception: a board's
 * radius is a game's decision, but whether a number in a game's file can reach
 * the chat panel is a whole-app decision that merely happens to be WRITTEN
 * there. Being tuned buys a game freedom over its own surface — never over the
 * page's stacking order.
 */

const SRC = join(process.cwd(), 'src')
const rel = (f: string) => f.replace(`${process.cwd()}/`, '')

function walk(dir: string, exts: string[] = ['.css']): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, exts))
    else if (exts.some((e) => p.endsWith(e))) out.push(p)
  }
  return out
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Drop `@font-face` blocks before scanning.
 *
 * What looks like a declaration inside one is a DESCRIPTOR — it describes what
 * the font file contains, and styles nothing. `font-weight: 100 1000` there
 * means "this file covers that range", which is a fact about the file, not a
 * weight anyone chose; the same goes for `font-stretch: 25% 151%` and
 * `font-style: oblique 0deg 10deg`. Scanning them would demand a token for a
 * number that describes a binary.
 */
const stripFontFace = (s: string) => s.replace(/@font-face\s*\{[^}]*\}/g, '')

/** `//` to end of line, but not the one inside `https://`. TS only — CSS has
 *  no line comments, and a stray `//` there would eat a real declaration. */
const stripLineComments = (s: string) => s.replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/**
 * One vocabulary's rule.
 *
 * `allowed` is what a converted file may still write literally — values that
 * are not a scale at all. A radius of `0` is a square corner and `50%` is a
 * circle; neither is "a small amount of rounding" and neither wants a token.
 */
type Vocabulary = {
  name: string
  /**
   * The properties this governs — a LIST, because a vocabulary is named for
   * what it measures and not for the property that consumes it. Spacer feeds
   * `gap` and `margin` both, and splitting it into two entries would mean two
   * copies of one `fix` string, drifting apart the first time either is
   * edited. It is also where a property REJOINS later: padding is parked
   * rather than excluded, and rejoining is then one word, not a new entry.
   *
   * Longhands are named individually. `margin-bottom` is as much a margin as
   * `margin` is, and a guard that only knew the shorthand would be a guard
   * with a hole exactly where a converted file is most likely to write one.
   */
  properties: string[]
  /**
   * Pull the governed values OUT of a value that carries more than one
   * decision — `border: 1px solid var(--x)` and `transition: opacity 120ms
   * ease` are the two that matter, and both are how the app actually writes
   * a width and a duration. Without this, an entry keyed on the longhand
   * would match almost nothing and read as coverage while catching nothing,
   * which is worse than having no entry at all.
   *
   * Every match is judged against `allowed`; a value with no match is clean,
   * which is what makes `border: 0` and `transition: none` come out right
   * without naming them.
   */
  extract?: RegExp
  /** Literal values that stay literal. */
  allowed: RegExp
  /** Where to look, under `src/`. Defaults to `common` — tuned surfaces are
   *  exempt. Widen it only for a value a game does not get to decide. */
  root?: string
  /**
   * Files not yet converted, each listing the literals it is still allowed to
   * write. Delete a value when it converts; delete the row when the file is
   * clean.
   *
   * BY VALUE, not by file, and the homepage is why. It converted `.historyFrame`'s
   * gap to `--spacer-2` and stayed on the list, because a second value on the
   * same page (F7's `0.45em`) is still open — so under a file-level list the
   * conversion we had just made was unprotected: writing `1rem` back would
   * have been silent. A partially converted file is the NORMAL case, not the
   * exception, and the sprint's own recorded failure is that what survives is
   * what a test asserts.
   *
   * The values are the offending PARTS, not whole declarations: `border: 1px
   * solid var(--x)` lists `1px`, and `margin: 0.25rem 0 0.75rem 0` lists
   * `0.25rem` and `0.75rem`. A part is what was actually chosen, so the row
   * stays true when the color beside it changes.
   */
  pending: Record<string, string[]>
  /** What to tell someone who trips it. */
  fix: string
}

const VOCABULARIES: Vocabulary[] = [
  {
    name: 'border-radius',
    properties: ['border-radius'],
    // `0` a square corner · `50%` a circle — shapes, not steps, and neither is
    // a rounding anyone chose.
    //
    // `999px` USED to be listed here too, as "a pill", waiting on the homepage
    // area to settle badges. Settled 2026-08-22, and the premise was wrong both
    // ways round: the feedback pill is a rounded RECTANGLE and never wanted
    // 999px, while the badge is the lozenge and now does. So the shape earned
    // `--radius-round` and the literal comes off this list — otherwise the
    // token is a suggestion, and a token nobody is made to use is the one that
    // rots (`--radius-md` did exactly that for months).
    //
    // `inherit` and friends aren't values at all — they defer to somewhere else,
    // which is the opposite of writing a literal.
    allowed: /^(0|50%|inherit|initial|unset|revert)$/,
    pending: {
      // The one `999px` writer left in `common/`, a shape question its own
      // area answers rather than a rounding: a round icon button, which may
      // want `50%` instead — it is a square box, and `50%` says circle without
      // leaning on a number the browser clamps. (The chat count was the other;
      // it is a lozenge that grows with its digits, so it took `--radius-round`.)
      'src/common/buttons/ShuffleButton.module.css': ['999px'],
      'src/common/event-log/EventLog.module.css': ['3px'],
      // RECORDED, not unconverted (Joel, 2026-09-21): a 2px radius on a 14px
      // square stops the corner reading as a harsh pixel box — not an amount
      // of rounding chosen off a ramp. See the `.tier` note in the file.
      'src/shared/rank-ladder/RankBar.module.css': ['2px'],
    },
    fix:
      'Use `--radius-sm` / `-md` / `-lg`, chosen by what the thing IS — a card ' +
      'takes lg, a panel md, a chip sm (docs/deferred.md) — or `--radius-round` ' +
      'for a shape whose ends are fully capped (a badge, a counter chip). A ' +
      'value that is not one of them is a question for Joel, not a rounding.',
  },
  {
    /**
     * The vocabulary we did not have to invent, and the only entry here with
     * no tokens behind it: CSS already ships one, `100` … `900`. Those are the
     * numbers the property takes, so a token would do nothing but rename them.
     *
     * What the sprint gets is the RULE — a font-weight is a multiple of 100 —
     * and a weight that isn't is a bug. `650` renders as `700` in most
     * families anyway, so what it really records is a moment of tuning
     * against one typeface at one size.
     *
     * `root: '.'` because this is not a per-game decision. A game's board is
     * tuned to that game; how many distinct weights of text the app owns is a
     * question about the app, and being tuned buys no freedom over it.
     */
    name: 'font-weight',
    properties: ['font-weight'],
    // The keywords defer to somewhere else rather than choosing a value,
    // which is the opposite of writing a literal.
    allowed: /^([1-9]00|normal|bold|lighter|bolder|inherit|initial|unset|revert)$/,
    root: '.',
    pending: {
      // letterboxed's two `650`s — the whole cost of the rule, and they are
      // fixed by the `letterboxed` area's audit, not swept now.
      'src/letterboxed/components/Board.module.css': ['650'],
      'src/letterboxed/components/PlayArea.module.css': ['650'],
    },
    fix:
      'A font-weight is a multiple of 100 — that is the scale CSS itself ' +
      'defines, and we add nothing to it. A value between two steps is tuned ' +
      'to one typeface at one size and usually renders as its neighbor anyway.',
  },
  {
    name: 'spacer',
    // Gap and margin, in every spelling each has. PADDING IS DELIBERATELY
    // ABSENT — core-css/todo.md: whether the room inside a box
    // belongs on the same ramp as the space between boxes is undecided, and
    // today's paddings are often a tuple fitted to one box (the selection
    // row's says so in lists/SelectionList.module.css). Parked, not excluded;
    // it rejoins this list.
    properties: [
      'gap',
      'row-gap',
      'column-gap',
      'margin',
      'margin-top',
      'margin-right',
      'margin-bottom',
      'margin-left',
      'margin-block',
      'margin-inline',
    ],
    // `0` is no space at all and `auto` is the centering trick — neither is a
    // small-or-large question, so neither wants a step. The negative margins
    // that pull a child out past its parent's padding are NOT here: that is a
    // real distance and it takes a token with a minus in front of it.
    allowed: /^(0|auto|inherit|initial|unset|revert)$/,
    pending: {
      // Every file in `common/` that still writes a literal gap or margin, and
      // the values it writes. This is the sprint's own to-do list seen from the
      // guard's side: an area converts a value and deletes it from its row, the
      // row goes when the file is clean, and the day the object is empty the
      // vocabulary is fully in force.
      // The h1–h4 margins, OFF THE RAMP by decision, not unconverted: each
      // heading's margin is a ratio of its own size, which a rem step cannot
      // express. A heading's spacing is decided at h1–h4 in base.css, the same
      // place its size is — see this vocabulary's `fix` line and font-size's.
      'src/common/core-css/base.css': ['1rem', '1.25rem', '1.15rem'],
      'src/common/buttons/SubmitWithScore.module.css': ['0.5rem'],
      // 0.375rem is BESPOKE by decision (Joel, 2026-08-24), not unconverted: it
      // is the mark gap, and the number you see is that plus each mark's own
      // padding, so equal-looking gaps would need unequal numbers — see the
      // file. If a second site ever wants it, it earns a ramp step then.
      'src/common/page-header/PageHeader.module.css': ['0.375rem'],
      // The icon-and-label gap is `em` BY DESIGN, not unconverted: it tracks the
      // button's own text so the glyph, the label and the space between them stay
      // one proportion at every size. A ramp step in rem could not do that.
      'src/common/buttons/StandardButton.module.css': ['0.4em'],
      // The three game entries' shared face became <GameEntry>, and its
      // literals came with it — one row where there were three. The debt
      // merged; it did not grow.
      'src/common/club/GameEntry.module.css': ['0.4rem', '0.5rem'],
      'src/common/club/CurrentGameCard.module.css': ['0.6rem'],
      'src/common/club/ClubPage.module.css': ['1rem', '1.25rem'],
      // Two of its three literals left with `.buttonRow`, which is the shared
      // `modalActions` row now that this is a modal (F36). The label/hint gap
      // is what remains.
      'src/common/club/CreateClubModal.module.css': ['0.4rem'],
      // The gap under a checkbox row and under a date override — both moved
      // out of files already on this list, at the same values. The debt
      // traveled with the markup; it did not grow.
      // The three field components carved out of ClaimHandleScreen,
      // CreateClubModal and EditProfileModal. Same values,
      // now in one place instead of four — the debt traveled and shrank.
      // setupForm.module.css is gone; each of its values
      // traveled to the component that draws the rule, and none of them grew.
      'src/common/setup-form/SetupSection.module.css': ['0.75rem'],
      'src/common/setup-form/SetupTimerSection.module.css': ['0.3rem'],
      'src/common/terminal/CelebrationBlockingModal.module.css': ['0.3rem'],
      'src/common/game-page/DeviceBlockNotice.module.css': ['1rem'],
      // The caret's breath — the gap between the last glyph and the drawn
      // bar. RECORDED, not unconverted (Joel, 2026-09-18): the ramp's
      // smallest step is 0.25rem, which beside a 2px bar is a gap rather
      // than a hairline, so no step can express it.
      'src/common/word-entry/WordEntryInput.module.css': ['1px'],
      // The keyboard's row gap is no longer a literal `gap` — it is
      // `--guessKeyboard-row-gap` in core-css/base.css, where wordle's board
      // can read it to size itself. Joel's 2026-09-22 ruling still holds and
      // travels with the value: that gap and `--key-gap` are a PAIR, tuned
      // against each other, and neither is a step off this ramp. The file says
      // so beside the one that stayed.
      'src/common/lists/FilterSelect.module.css': ['0.35rem'],
      'src/common/game-page/GamePage.module.css': ['0.1rem'],
      'src/common/info-sheet/infoPanel.module.css': ['0.35rem'],
      'src/common/members/ActorMention.module.css': ['0.4rem'],
      // Both values MOVED here rather than being chosen here: `0.6rem` was the
      // retired list.css pattern's row gap, and `0.85rem` was ClubPage's packed
      // override, now the `packed` density. Both are tuned to the box on
      // purpose (the reason is written in the module), so this row records
      // where they went rather than pretending they are new decisions.
      'src/common/lists/SelectionList.module.css': ['0.6rem', '0.85rem'],
      'src/common/event-log/historyViewer.module.css': ['0.6rem'],
      'src/common/event-log/EventLog.module.css': ['0.5rem', '-1px', '-3px'],
      // RECORDED, not unconverted (Joel, 2026-09-21): the breath between the
      // 0.6em attribution disc and the word it attributes — a marker's gap
      // rather than a layout step. The file's gap and column-gap converted.
      // (Its card padding carries a 0.6rem the same ruling keeps bespoke, but
      // padding is not this vocabulary's — see the properties note above.)
      'src/common/word-list/WordList.module.css': ['7px'],
      'src/common/info-sheet/OpponentStrip.module.css': ['0.3rem', '0.6rem', '0.35rem'],
      'src/common/pause-suspend/PauseOverlay.module.css': ['0.5rem', '0.75rem', '0.4rem', '1rem'],
      'src/common/setup-form/SetupDisclosure.module.css': ['0.3rem'],
      // The players strip's three spacings are BESPOKE by decision (Joel,
      // 2026-09-12), not unconverted: a row of identity marks, tuned by eye
      // against the dot's 0.85rem — between players, dot to name, and between
      // dots alone on a phone. See the file.
      'src/common/page-header/PageHeaderPlayersStrip.module.css': ['1.25rem', '0.4rem', '0.6rem'],
      // RECORDED, not unconverted (Joel, 2026-09-21): the gap between a label
      // and the figure under it, INSIDE one cell. The two are one unit, and the
      // ramp's smallest step (0.25rem) reads as a break between them rather
      // than the hairline separation this is.
      'src/shared/rank-ladder/Stats.module.css': ['2px'],
      // StrikeMarks was here with ['0.3rem', '0.4rem'] until the restructure
      // moved it into `src/connections/` — its only importer. A game's file is
      // a tuned surface and out of this vocabulary's scope, so the row cannot
      // stay; the two literals are connections' to keep or convert.
      'src/common/devtools/PalettePage.module.css': ['1rem', '0.75rem', '2.5rem', '0.25rem', '0.5rem', '0.35rem', '0.15rem'],
      // DECIDED and staying: the trigger's logo-to-chevron gap and the credit
      // line's leading are both "these two are one thing", which the ramp's
      // smallest step (0.25rem) is too big to say. Both carry the reason in
      // the file. Nothing else in the menu is off the ramp.
      'src/common/menu/Menu.module.css': ['0.1rem'],
      // The picker's summary dots moved out of the modal with <PlayersSection>.
      // Same value, new file — the debt traveled, it did not grow.
      'src/common/setup-form/PlayersSection.module.css': ['0.3rem'],
      // Lives with <PlayersField>, which draws the rows these size.
      // Same values, new file — the debt traveled, it did not grow.
    },
    fix:
      'Use `--spacer-1` … `-5` (1.5 · 1 · 0.75 · 0.5 · 0.25rem), remembering ' +
      'that -1 is the BIGGEST. A value that is not on the ramp is a decision, ' +
      'not a rounding: add a level, fit it to one, or keep it bespoke with the ' +
      'reason written in the file — never silently because it was already there.',
  },
  {
    name: 'font-size',
    properties: ['font-size'],
    // A percentage or an `em` is a size RELATIVE to something — it tracks a
    // parent deliberately, which a rem token cannot express and should not
    // replace. The ramp is for absolute sizes.
    allowed: /^(\d*\.?\d+(em|%)|inherit|initial|unset|revert)$/,
    pending: {
      // h1–h4's sizes are OFF THE RAMP by decision, which the `fix` line below
      // states outright: a heading's size is decided at h1–h4 in base.css.
      // `max(16px,` and `1em)` are not values — they are the two halves of the
      // iOS focus-zoom floor (`font-size: max(16px, 1em)`, docs/mobile.md →
      // Decisions #3) as `extract` sees them, which cannot look inside a
      // `max()`. No token can express that floor; three other files on this
      // list carry the same pair.
      'src/common/core-css/base.css': ['1.5rem', '1.25rem', '1.15rem', '1rem', 'max(16px,', '1em)'],
      'src/common/buttons/ShuffleButton.module.css': ['32px'],
      'src/common/chat/ChatBody.module.css': ['max(16px,', '1em)'],
      // The chat unread count is BESPOKE by decision (Joel, 2026-09-12), not
      // unconverted: the app's smallest type, on a chip that is its own size —
      // the same 0.7rem the badge pattern wears, below the ramp's last step.
      'src/common/page-header/ChatButton.module.css': ['0.7rem'],
      'src/common/club/clubFilters.module.css': ['max(16px,', '1em)', '0.9rem'],
      // The three game entries' shared face became <GameEntry>, and its
      // literals came with it — one row where there were three. The debt
      // merged; it did not grow.
      'src/common/club/GameEntry.module.css': ['1rem', '1.25rem', '0.85rem'],
      'src/common/club/ClubGameDeleteButton.module.css': ['0.85rem'],
      'src/common/club/CreateClubModal.module.css': ['0.8rem'],
      'src/common/terminal/CelebrationBlockingModal.module.css': ['2.4rem', '1.5rem'],
      'src/common/game-page/DeviceBlockNotice.module.css': ['1.25rem'],
      // RECORDED, not unconverted (Joel, 2026-09-22): the two cap sizes are a
      // PAIR sized against each other, not steps. 1.2rem is deliberately bigger
      // than a letter needs — the glyph is the cap's whole content, and it is
      // what rescues ⌫ from reading as noise — and 0.85rem is what "Enter" has
      // to shrink to so a WORD fits a cap barely wider than a letter's. That
      // 0.85rem equals `--font-size-2` is a coincidence of arithmetic: it was
      // reached by fitting a word to a key, and would follow the key rather
      // than the ramp if either moved.
      'src/shared/onscreen-keyboard/GuessKeyboard.module.css': ['1.2rem', '0.85rem'],
      'src/common/lists/FilterSelect.module.css': ['0.8rem'],
      'src/common/event-log/historyViewer.module.css': ['1rem'],
      'src/common/event-log/EventLog.module.css': ['0.9rem'],
      'src/common/event-log/gameEventLog.module.css': ['1rem'], //  `.primary`, the row's lead value
      'src/common/pause-suspend/PauseOverlay.module.css': ['1.05rem'],
      'src/common/info-sheet/infoCol.module.css': ['0.9rem'],
      'src/common/info-sheet/InfoDisclosure.module.css': ['0.85rem'],
      'src/common/devtools/PalettePage.module.css': ['0.85rem', '0.8rem', '0.95rem'],
      'src/common/scratchpad/GameScratchpadCompanion.module.css': ['max(16px,', '1em)'],
      'src/common/setup-form/SetupGameModal.module.css': ['0.9rem'],
      'src/common/core-css/patterns/badge.css': ['0.7rem'],
      'src/common/buttons/Segmented.module.css': ['0.8rem'],
      'src/common/core-css/utilities.css': ['0.9rem'],
      // `.help` is the global `.muted` carved out under a name that says
      // what it is, at the SAME values — a rename must not move a pixel. So its
      // 0.9rem is `.muted`'s 0.9rem, listed here, and the two convert together
      // or not at all (the ramp has 1 / 0.85 / 0.75 and no step for it).
      'src/common/setup-form/SetupSection.module.css': ['0.9rem'],
    },
    fix:
      'Use `--font-size-1` … `-3` (1 · 0.85 · 0.75rem), -1 being the biggest. ' +
      'Headings are not on this ramp — their sizes are decided by h1–h4 in ' +
      'base.css, which is where a heading size belongs.',
  },
  {
    name: 'line-height',
    properties: ['line-height'],
    allowed: /^(normal|inherit|initial|unset|revert)$/,
    pending: {
      'src/common/buttons/ShuffleButton.module.css': ['1'],
      // The chat unread count's leading IS its box height, so the digits center
      // in the chip. BESPOKE by decision (Joel, 2026-09-12): the chip is its own
      // size, and no ratio expresses "as tall as the box".
      'src/common/page-header/ChatButton.module.css': ['1.1rem'],
      // The three game entries' shared face became <GameEntry>, and its
      // literals came with it — one row where there were three. The debt
      // merged; it did not grow.
      'src/common/club/GameEntry.module.css': ['1.2', '1.25'],
      'src/common/setup-form/SetupNextPuzzleSection.module.css': ['1.4'],
      'src/common/terminal/CelebrationBlockingModal.module.css': ['1'],
      'src/common/game-page/DeviceBlockNotice.module.css': ['1.5'],
      'src/common/event-log/historyViewer.module.css': ['1'],
      'src/common/game-page/playArea.module.css': ['1.1'],
      'src/common/devtools/PalettePage.module.css': ['1.35'],
      'src/common/core-css/patterns/badge.css': ['1.4'],
    },
    fix:
      'Use `--line-height-1` … `-3` (1.5 · 1.25 · 1): prose, a tighter block, ' +
      'and a single line that should occupy exactly its own height.',
  },
  {
    name: 'opacity',
    properties: ['opacity'],
    // 0 and 1 are not steps on a ramp — they are "gone" and "here", which is
    // a different question from how faint something should be.
    allowed: /^(0|1|inherit|initial|unset|revert)$/,
    pending: {
      'src/common/buttons/ShuffleButton.module.css': ['0.45'],
      'src/common/setup-form/SetupTimerSection.module.css': ['0.5'],
    },
    fix:
      'Use `--opacity-1` / `-2` — or say why this one is a ROLE rather than a ' +
      'step, the way `--chrome-disabled-opacity` is. Those two numbers are a ' +
      'holding position and expected to become role names, so a value that ' +
      'does not fit is evidence, not a nuisance.',
  },
  {
    name: 'letter-spacing',
    properties: ['letter-spacing'],
    allowed: /^(normal|inherit|initial|unset|revert)$/,
    pending: {
      // The board tracking, and the ONE value five games had already agreed
      // on before <ManualBoardField> existed — spellingbee, wordwheel,
      // wordiply and letterboxed all wrote 0.2em. Unconverted, not
      // unconsidered: it is what makes typed letters read like tiles.
      'src/common/fields/ManualBoardField.module.css': ['0.2em'],
      // RECORDED (Joel, 2026-09-21): --letter-spacing-label is 0.03em, which
      // is the ramp for a LABEL — these are words to read, not a label to scan.
      'src/common/word-list/WordList.module.css': ['0.02em'],
      'src/common/game-page/playArea.module.css': ['0.03em'],
      'src/common/devtools/PalettePage.module.css': ['0.03em'],
    },
    fix:
      'Use `--letter-spacing-label` (a small uppercase label), `-display` ' +
      '(caps set large, read letter by letter) or `-wide` (letters presented ' +
      'as objects rather than as a word). Prose takes neither — it takes ' +
      '`normal`.',
  },
  {
    /**
     * Written as the `transition:` shorthand almost everywhere, so this
     * entry EXTRACTS the time from it. An entry that only knew
     * `transition-duration` would have matched nothing in this repo.
     *
     * Animations are deliberately out of scope: `--mark-attention-flash-
     * duration` and the game-surface flashes and shakes are tuned, and they
     * keep their own names.
     */
    name: 'transition-duration',
    properties: ['transition', 'transition-duration'],
    extract: /\d*\.?\d+m?s\b/g,
    allowed: /^0m?s$/,
    pending: {
      'src/common/buttons/ShuffleButton.module.css': ['120ms'],
      'src/common/club/ClubGameDeleteButton.module.css': ['120ms', '160ms'],
      'src/common/game-page/playArea.module.css': ['80ms'],
    },
    fix:
      'Use `--transition-duration-paint` (a color settling), `-nudge` (a piece ' +
      'answering the pointer by moving a little) or `-travel` (something ' +
      'arriving, leaving or growing). Pick by what KIND of change it is; the ' +
      'number is downstream of that.',
  },
  {
    /**
     * Same shape, and the same reason: a width is nearly always written
     * inside `border: 1px solid …`. `border-radius` is not swept up by the
     * `border` alternative — the regex requires a `:` immediately after the
     * property name, so `border-radius:` simply does not match.
     */
    name: 'border-width',
    properties: [
      'border',
      'border-top',
      'border-right',
      'border-bottom',
      'border-left',
      'border-width',
      'border-top-width',
      'border-right-width',
      'border-bottom-width',
      'border-left-width',
      'border-block',
      'border-inline',
    ],
    extract: /\d*\.?\d+(?:px|rem|em)\b/g,
    allowed: /^0(px|rem|em)?$/,
    pending: {
      'src/common/buttons/ShuffleButton.module.css': ['1px'],
      'src/shared/onscreen-keyboard/GuessKeyboard.module.css': ['1px'],
      'src/shared/board-cursor/gridCursor.module.css': ['1px', '5px'],
      'src/common/event-log/historyViewer.module.css': ['2px'],
      'src/common/event-log/gameEventLog.module.css': ['1px'], //   `.divider`, the between-turns line
      'src/common/pause-suspend/PauseOverlay.module.css': ['1px'],
      // RECORDED, not unconverted (Joel, 2026-09-21): the GOAL outline only.
      // The ordinary tier edge is --border-width-line-thick; this is a step
      // above it with no token, so the goal reads heavier without going black.
      'src/shared/rank-ladder/RankBar.module.css': ['3px'],
      'src/common/devtools/PalettePage.module.css': ['1px'],
      'src/common/setup-form/SetupSection.module.css': ['1px'],
      'src/common/members/Dot.module.css': ['1px'],
    },
    fix:
      'Use `--border-width-line` (a divider or a field edge), `-line-thick` ' +
      '("this box is a thing") or `-frame` ("something is happening to what ' +
      'is inside"). A game piece\'s own edge is not on this ramp — it has ' +
      '`--tile-edge-width` and `--tile-selected-edge-width`, which are a ' +
      'channel rather than a weight of line.',
  },
  {
    name: 'z-index',
    properties: ['z-index'],
    // 0–10 is LOCAL layering inside a component's own stacking context — a
    // ring over a tile, a shuffle floating on its board, the keyboard cursor.
    // Those compete only with their siblings, so they are not on the ladder
    // and do not want a name. The cut is 10 because the app has a clean gap
    // there: everything local is ≤ 10 and everything page-level is ≥ 1000,
    // which is what makes a number the honest test. If something ever needs
    // 11 locally, that is the conversation, not a quiet edit here.
    //
    // The boards are the reason this rule can be repo-wide. Each one is a
    // stacking context (`.boardSeal`, game-page/playArea.module.css — sealed
    // with `isolation: isolate`, containment and no rank), so a number written
    // inside a board is confined to it whatever its size. That is why a game's
    // file may write a bare 5 while the same 5 in a page-level component would
    // be a bug.
    allowed: /^([0-9]|10|auto|inherit|initial|unset|revert)$/,
    root: '.',
    pending: {},
    fix:
      'Page-level layers read a token from base.css → THE Z- LAYERS ' +
      '(`--z-companion`, `--z-modal-normal`, …). A tier that is not on the ' +
      'ladder is a question for Joel: inventing a number between two named ' +
      'ones is how a menu ends up behind a backdrop.',
  },
]

describe('a converted surface writes vocabulary values, not literals', () => {
  for (const v of VOCABULARIES) {
    it(`${v.name}: every converted file uses the vocabulary`, () => {
      const offenders: string[] = []
      /** What each file actually writes today, for the shrink arms below. */
      const found = new Map<string, Set<string>>()

      // No `root` means the shell, which is two folders — see the header.
      const roots = v.root ? [v.root] : ['common', 'shared']
      for (const f of roots.flatMap((r) => walk(join(SRC, r)))) {
        const css = stripFontFace(stripComments(readFileSync(f, 'utf8')))
        const literals = new Set<string>()
        // Boundary is `{`, `;` or a line start — NOT `^` alone. Anchoring on
        // the line start misses `.x { border-radius: 4px }` written on one
        // line, which this codebase does write (crosswords' ClueLists), and a
        // guard with a hole in it is worse than knowing you have none. Found
        // by planting, which is the only reason it isn't still there.
        const decl = new RegExp(
          `(?:^|[{;])\\s*(?:${v.properties.join('|')})\\s*:\\s*([^;}]+)`,
          'gm',
        )
        for (const m of css.matchAll(decl)) {
          const value = m[1].trim()
          let parts: string[]
          if (v.extract) {
            // An extracting vocabulary judges only the parts it can name, so
            // the `var()` skip below would be wrong here: the whole point is
            // that `border: 1px solid var(--edge-color)` has a literal width
            // sitting next to a perfectly good token.
            parts = value.match(v.extract) ?? []
            if (!parts.length) continue
          } else {
            // CONTAINS, not starts-with: `calc(var(--z-index-popover) + 1)` is a
            // derivation off the ladder, which is the point of naming the tier.
            if (value.includes('var(')) continue
            // A calc() has spaces INSIDE it, so it is judged whole; everything
            // else is judged part by part, because a shorthand is several
            // decisions written on one line and `margin: 0 auto` is two values
            // that each carry no decision at all.
            parts = value.includes('calc(') ? [value] : value.split(/\s+/)
          }
          // The offending PARTS, not the whole declaration: one bad number
          // beside three good ones should list one number.
          for (const p of parts) if (!v.allowed.test(p)) literals.add(p)
        }
        if (!literals.size) continue
        found.set(rel(f), literals)
        // Only the values this file is ALREADY known to write are excused —
        // which is what makes converting one value on a page protect it,
        // even while another value on the same page is still open.
        const excused = new Set(v.pending[rel(f)] ?? [])
        const unlisted = [...literals].filter((p) => !excused.has(p))
        if (unlisted.length) offenders.push(`${rel(f)}  →  ${unlisted.join(', ')}`)
      }

      expect(
        offenders,
        `${v.name}: a literal value on a CONVERTED surface — a value not on the ` +
          `file's pending row, or a file with no row at all (a new file is the ` +
          `same thing).\n${v.fix}\n\n` +
          offenders.join('\n'),
      ).toEqual([])

      // The list SHRINKS, and now in two ways. A path that no longer offends
      // at all must leave it, or the allowlist quietly stops meaning anything.
      const stalePaths = Object.keys(v.pending)
        .filter((p) => !found.has(p))
        .sort()
      expect(
        stalePaths,
        `${v.name}: these paths are on the pending list but write no literal at ` +
          `all any more — delete the row (or fix the path, if the file moved):\n` +
          stalePaths.join('\n'),
      ).toEqual([])

      // …and a listed VALUE that is gone must leave too, which is the arm that
      // makes a row shrink as an area converts one number at a time.
      const staleValues = Object.entries(v.pending)
        .flatMap(([p, vals]) => vals.filter((x) => !found.get(p)?.has(x)).map((x) => `${p}  →  ${x}`))
        .sort()
      expect(
        staleValues,
        `${v.name}: these values are excused on the pending list but are no ` +
          `longer written there — delete them from the row:\n${staleValues.join('\n')}`,
      ).toEqual([])
    })
  }
})

/**
 * The z-index ladder's other half.
 *
 * `<FloatingPanel>` takes its tier as a prop, so the order could be restated
 * in TypeScript — and a second copy of a stacking order is exactly the copy
 * that drifts, because nothing makes the two disagree loudly. The prop is
 * typed `string` so a call site passes `var(--z-chat)`; this is
 * what stops someone typing the number back in.
 *
 * A COMPUTED z-index stays legal — stackdown stacks its tile pile with
 * `zIndex: t.z`, which is per-tile data inside a board's own context and has
 * no business being a token.
 */
describe('the z-index ladder has one home', () => {
  it('no numeric z-index is written in TypeScript', () => {
    const offenders: string[] = []
    for (const f of walk(join(SRC, '.'), ['.ts', '.tsx'])) {
      if (f.endsWith('.test.ts') || f.endsWith('.test.tsx')) continue
      const src = stripLineComments(stripComments(readFileSync(f, 'utf8')))
      // `zIndex: 500` (a style object) and `zIndex={500}` (a JSX prop).
      for (const m of src.matchAll(/zIndex\s*(?::\s*|=\{)(\d+)/g)) {
        offenders.push(`${rel(f)}  →  zIndex ${m[1]}`)
      }
    }
    expect(
      offenders,
      'A z-index literal in TypeScript. The ladder lives in base.css; pass ' +
        'the token instead — zIndex="var(--z-chat)".\n' +
        offenders.join('\n'),
    ).toEqual([])
  })
})

/**
 * Guard: the attention mark is called the ATTENTION FLASH.
 *
 * It was "the wash" in fifty-odd lines of prose, which collided with the word's
 * real job — `--outcomes-*-wash-color` is a pale tint laid behind text, and a
 * wash on a button is its hover background. One word, two things, and the tint
 * sense is the one that owns it (Joel, 2026-09-16: *"'wash' is what we use for a
 * lighter-version of a background"*). Swept 2026-09-16.
 *
 * Banned NARROWLY, in the two places the collision can recur, because a repo-wide
 * ban on the word would be mostly allowlist:
 *
 *   - the collocation "attention wash" anywhere, which can only mean the mark;
 *   - the word at all inside `common/board-marks/`, which has no business
 *     discussing a tint.
 *
 * Scans prose as well as code: this is a naming rule, and naming lives in
 * comments and docs before it reaches an identifier.
 */
describe('the attention flash is not called a wash', () => {
  const ROOTS = [join(process.cwd(), 'src'), join(process.cwd(), 'docs'), join(process.cwd(), 'plans')]
  const PROSE = ['.ts', '.tsx', '.css', '.md']
  /** This file names the phrase in order to forbid it. */
  const SKIP = ['src/guards/vocabularies.test.ts']

  const proseFiles = () =>
    ROOTS.flatMap((r) => walk(r, PROSE)).filter((f) => !SKIP.some((s) => rel(f).endsWith(s)))

  it('nothing says "attention wash"', () => {
    const offenders: string[] = []
    for (const f of proseFiles()) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/attention[\s-]+wash/gi)) offenders.push(`${rel(f)}  →  "${m[0]}"`)
    }
    expect(
      offenders,
      'The mark is the ATTENTION FLASH. "Wash" is the pale-tint sense — an ' +
        "outcome's `-wash-color`, a button's hover background — and one word " +
        'cannot be both.\n' + offenders.join('\n'),
    ).toEqual([])
  })

  it('board-marks says nothing about a wash at all', () => {
    const offenders: string[] = []
    for (const f of walk(join(process.cwd(), 'src/common/board-marks'), PROSE)) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/\bwash\w*/gi)) offenders.push(`${rel(f)}  →  "${m[0]}"`)
    }
    expect(
      offenders,
      'This folder describes marks, and its mark is the attention FLASH. The ' +
        'tint sense has no reason to appear here.\n' + offenders.join('\n'),
    ).toEqual([])
  })
})
