// cs-unmet

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guard: a converted surface writes VOCABULARY values, not literals.
 *
 * The sprint applies its vocabularies area by area, not in one sweep
 * (plans/css-system-2.md §13 → "How a value gets converted"): a raw value
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
 * → tuned / justified / locked), so a vocabulary checks `src/common/` unless
 * it says otherwise.
 *
 * `z-index` says otherwise, and is the shape of the exception: a board's
 * radius is a game's decision, but a board's rank against the chat panel is a
 * whole-app decision that merely happens to be WRITTEN in a game's file. Being
 * tuned buys a game freedom over its own surface — never over where that
 * surface sits in the page's stacking order.
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
   * BY VALUE, not by file, and the homepage is why. It converted `.frame`'s
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
      // The two `999px` writers left in `common/`, each a shape question its
      // own area answers rather than a rounding: a counter chip and a round
      // icon button. Both may want `50%` instead — they are square boxes, and
      // `50%` says circle without leaning on a number the browser clamps.
      'src/common/components/page-header/ChatButton.module.css': ['999px'],
      'src/common/components/buttons/ShuffleButton.module.css': ['999px'],
      // Deliberate, and the reason is at the declaration: the pill's thick left
      // accent bar would curve into a crescent on round ends. This is the
      // sprint's first real bespoke-BY-INTENT value, and §18 has the open item
      // about giving those somewhere better to live than a pending row.
      'src/common/components/feedback/GenericFeedbackPill.module.css': ['0.5rem'],
      'src/common/components/game/entry/GuessKeyboard.module.css': ['4px'],
      'src/common/components/game/FilterSelect.module.css': ['4px'],
      'src/common/components/game/lists/TurnLog.module.css': ['3px'],
      'src/common/components/game/RankBar.module.css': ['2px', '4px'],
      'src/common/components/floating-panels/GameScratchpadCompanion.module.css': ['6px'],
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
    // ABSENT — plans/css-system-2.md §6.6: whether the room inside a box
    // belongs on the same ramp as the space between boxes is undecided, and
    // today's paddings are often a tuple fitted to one box (`.item-row`'s
    // says so in list.css). Parked, not excluded; it rejoins this list.
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
      'src/common/base.css': ['1rem', '1.25rem', '1.15rem', '0.75rem'],
      'src/common/components/account/ColorChoiceList.module.css': ['0.5rem'],
      'src/common/components/account/EditProfileModal.module.css': ['1.25rem'],
      'src/common/components/auth/ClaimHandleScreen.module.css': ['1.25rem', '1.5rem', '0.75rem', '0.5rem'],
      'src/common/components/branding/PuzpuzpuzWordmark.module.css': ['1.5rem'],
      'src/common/components/buttons/SubmitWithScore.module.css': ['0.5rem'],
      'src/common/components/chat/ChatBody.module.css': ['0.4rem', '0.3rem'],
      // 0.375rem is BESPOKE by decision (Joel, 2026-08-24), not unconverted: it
      // is the mark gap, and the number you see is that plus each mark's own
      // padding — see the file, and F43 (`unequal-mark-separation`). If a second
      // site ever wants it, it earns a ramp step then.
      'src/common/components/page-header/PageHeader.module.css': ['0.375rem'],
      // The icon-and-label gap is `em` BY DESIGN, not unconverted: it tracks the
      // button's own text so the glyph, the label and the space between them stay
      // one proportion at every size. A ramp step in rem could not do that.
      'src/common/components/buttons/StandardButton.module.css': ['0.4em'],
      'src/common/components/club/ClubGameCard.module.css': ['0.6rem', '0.4rem', '0.5rem'],
      'src/common/components/club/ClubGameRow.module.css': ['0.4rem', '0.5rem'],
      'src/common/components/club/ClubPage.module.css': ['1rem', '1.25rem'],
      'src/common/components/club/CreateClubPage.module.css': ['1.25rem', '1.5rem', '0.4rem', '0.75rem', '0.5rem'],
      'src/common/components/club/EditClubModal.module.css': ['0.5rem'],
      'src/common/components/club/StartGameRow.module.css': ['0.4rem'],
      'src/common/components/definitions/AnagramDialog.module.css': ['0.5rem', '0.4rem'],
      'src/common/components/definitions/DefinitionView.module.css': ['0.3rem', '0.15rem', '0.1rem'],
      'src/common/components/definitions/WordEditDialog.module.css': ['0.55rem', '0.5rem', '0.35rem'],
      'src/common/components/definitions/WordLookupDialog.module.css': ['0.6rem', '0.4rem'],
      'src/common/components/feedback/FaultModal.module.css': ['0.5rem'],
      'src/common/components/feedback/GenericFeedbackPill.module.css': ['0.5rem'],
      'src/common/components/setup/SetupCoopStyleSection.module.css': ['1rem'],
      // The gap under a checkbox row and under a date override — both moved
      // out of files already on this list, at the same values. The debt
      // travelled with the markup; it did not grow.
      'src/common/components/fields/CheckboxField.module.css': ['0.5rem'],
      // The three field components carved out of ClaimHandleScreen,
      // CreateClubPage and EditProfileModal on 2026-08-26. Same values,
      // now in one place instead of four — the debt travelled and shrank.
      'src/common/components/fields/field.module.css': ['0.4rem'],
      'src/common/components/fields/DateField.module.css': ['0.5rem'],
      // setupForm.module.css was deleted on 2026-08-26; each of its values
      // travelled to the component that draws the rule, and none of them grew.
      'src/common/components/fields/RadioRow.module.css': ['1rem', '0.4rem'],
      'src/common/components/setup/SetupSection.module.css': ['0.75rem'],
      'src/common/components/setup/SetupTimerSection.module.css': ['0.3rem'],
      'src/common/components/game/CelebrationBlockingModal.module.css': ['0.3rem', '0.4rem', '0.2rem', '1.4rem'],
      'src/common/components/game/DeviceBlockNotice.module.css': ['1rem'],
      'src/common/components/game/entry/EntryBox.module.css': ['1px'],
      'src/common/components/game/entry/GuessKeyboard.module.css': ['0.4rem'],
      'src/common/components/game/entry/MoveRow.module.css': ['0.5rem'],
      'src/common/components/game/FilterSelect.module.css': ['0.25rem', '0.35rem'],
      'src/common/components/game/foundWordsPlayArea.module.css': ['1.5rem'],
      'src/common/components/game/GamePage.module.css': ['1rem', '0.1rem'],
      'src/common/components/game/GameHelpCompanion.module.css': ['1rem'],
      'src/common/components/game/infoPanel.module.css': ['0.5rem', '0.35rem'],
      'src/common/components/game/lists/ActorMention.module.css': ['0.4rem'],
      // Both values MOVED here rather than being chosen here: `0.6rem` was the
      // retired list.css pattern's row gap, and `0.85rem` was ClubPage's packed
      // override, now the `packed` density. Both are tuned to the box on
      // purpose (the reason is written in the module), so this row records
      // where they went rather than pretending they are new decisions.
      'src/common/components/lists/SelectionList.module.css': ['0.6rem', '0.85rem'],
      'src/common/components/game/lists/historyViewer.module.css': ['0.6rem'],
      'src/common/components/game/lists/TurnLog.module.css': ['0.5rem', '-1px', '-3px'],
      'src/common/components/game/lists/WordList.module.css': ['0.5rem', '16px', '7px'],
      'src/common/components/game/OpponentStrip.module.css': ['0.25rem', '0.3rem', '0.6rem', '0.35rem'],
      'src/common/components/game/PauseOverlay.module.css': ['0.5rem', '0.75rem', '0.4rem', '1rem'],
      'src/common/components/game/PlayArea.module.css': ['0.75rem', '1rem', '0.3rem', '0.5rem'],
      'src/common/components/page-header/PageHeaderPlayersStrip.module.css': ['1.25rem', '0.4rem', '0.6rem'],
      'src/common/components/game/RankBar.module.css': ['8px', '0.5rem'],
      'src/common/components/game/Stats.module.css': ['8px', '12px', '2px', '0.25rem'],
      'src/common/components/game/StrikeMarks.module.css': ['0.3rem', '0.4rem'],
      'src/common/components/palette/PalettePage.module.css': ['1rem', '0.75rem', '2.5rem', '0.25rem', '0.5rem', '0.35rem', '0.15rem'],
      'src/common/components/floating-panels/GameScratchpadCompanion.module.css': ['0.4rem', '0.5rem'],
      'src/common/components/menu/Menu.module.css': ['1.5rem', '0.3rem', '0.1rem', '-1px', '-1rem'],
      'src/common/components/setup/SetupGameModal.module.css': ['0.75rem', '1.5rem', '0.4rem', '1rem', '0.3rem'],
      // Moved out of SetupGameModal.module.css with <PlayersField> on 2026-08-25.
      // Same values, new file — the debt travelled, it did not grow.
      'src/common/components/fields/PlayersField.module.css': ['0.5rem', '0.4rem'],
      'src/common/components/text/RichMessage.module.css': ['0.25rem'],
      'src/common/components/toasts/Toast.module.css': ['0.7rem'],
      'src/common/components/toasts/ToastHost.module.css': ['0.6rem'],
            'src/common/patterns/heading.css': ['0.5rem'],
      'src/common/utilities.css': ['1rem', '1.5rem'],
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
      'src/common/base.css': ['1.5rem', '1.25rem', '1.15rem', '1rem', 'max(16px,', '1em)'],
      'src/common/components/buttons/ShuffleButton.module.css': ['32px'],
      'src/common/components/chat/ChatBody.module.css': ['0.9rem', 'max(16px,', '1em)'],
      'src/common/components/page-header/ChatButton.module.css': ['0.7rem'],
      'src/common/components/club/clubFilters.module.css': ['0.8rem', 'max(16px,', '1em)', '0.9rem'],
      'src/common/components/club/ClubGameCard.module.css': ['1.25rem', '0.85rem'],
      'src/common/components/club/ClubGameDeleteButton.module.css': ['0.85rem'],
      'src/common/components/club/ClubGameRow.module.css': ['1rem', '0.85rem'],
      'src/common/components/club/CreateClubPage.module.css': ['0.8rem'],
      'src/common/components/club/EditClubModal.module.css': ['0.8rem', '0.85rem'],
      'src/common/components/club/StartGameRow.module.css': ['1rem', '0.85rem'],
      'src/common/components/definitions/AnagramDialog.module.css': ['0.95rem', '0.85rem', '0.8rem'],
      'src/common/components/definitions/DefinitionView.module.css': ['1.05rem', '0.92rem', '0.9rem', '0.72rem', '0.8rem'],
      'src/common/components/definitions/WordEditDialog.module.css': ['0.85rem'],
      'src/common/components/feedback/FaultModal.module.css': ['1.1rem', '0.78rem'],
      // ErrorPage is FaultModal's twin as a PAGE (F39 `loading-and-errors`);
      // its two sizes are copied to the digit so the two read as one event.
      // They convert together or not at all.
      'src/common/components/loading-and-errs/ErrorPage.module.css': ['1.1rem', '0.78rem'],
      'src/common/components/feedback/GenericFeedbackPill.module.css': ['1.1rem'],
      'src/common/components/fields/field.module.css': ['0.9rem'],
      'src/common/components/fields/ReadOnlyField.module.css': ['1.05rem'],
      'src/common/components/game/CelebrationBlockingModal.module.css': ['2.4rem', '1.5rem'],
      'src/common/components/game/DeviceBlockNotice.module.css': ['1.25rem'],
      'src/common/components/game/entry/GuessKeyboard.module.css': ['1.2rem', '0.85rem'],
      'src/common/components/game/FilterSelect.module.css': ['0.8rem', '1rem'],
      'src/common/components/game/infoPanel.module.css': ['0.95rem'],
      'src/common/components/game/lists/historyViewer.module.css': ['1rem'],
      'src/common/components/game/lists/TurnLog.module.css': ['0.9rem', '1rem'],
      'src/common/components/game/lists/WordList.module.css': ['17px'],
      'src/common/components/game/MobileStatusBar.module.css': ['0.95rem'],
      'src/common/components/game/OpponentStrip.module.css': ['0.85rem', '0.75rem'],
      'src/common/components/game/PauseOverlay.module.css': ['1.05rem'],
      'src/common/components/game/PlayArea.module.css': ['0.85rem', '0.95rem', '0.9rem'],
      'src/common/components/game/RankBar.module.css': ['14px', '12px'],
      'src/common/components/game/Stats.module.css': ['11px', '18px', '13px'],
      'src/common/components/palette/PalettePage.module.css': ['0.85rem', '0.8rem', '0.95rem'],
      'src/common/components/floating-panels/GameScratchpadCompanion.module.css': ['0.85rem', '0.8rem', '0.9rem', 'max(16px,', '1em)'],
      'src/common/components/menu/Menu.module.css': ['0.95rem', '0.82rem', '1rem'],
      'src/common/components/setup/SetupGameModal.module.css': ['0.85rem', '0.9rem'],
      'src/common/components/fields/PlayersField.module.css': ['0.85rem'],
      'src/common/components/toasts/Toast.module.css': ['1.2rem'],
      'src/common/components/tooltips/TooltipHost.module.css': ['0.75rem'],
      'src/common/patterns/badge.css': ['0.7rem'],
            'src/common/patterns/segmented.css': ['0.8rem'],
      'src/common/utilities.css': ['0.9rem', '0.85rem'],
      // `.helpText` is the global `.muted` carved out under a name that says
      // what it is, at the SAME values — a rename must not move a pixel. So its
      // 0.9rem is `.muted`'s 0.9rem, listed here, and the two convert together
      // or not at all (the ramp has 1 / 0.85 / 0.75 and no step for it).
      'src/common/components/setup/SetupSection.module.css': ['0.9rem'],
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
      'src/common/components/buttons/ShuffleButton.module.css': ['1'],
      // The textarea's leading, moved up from CreateClubPage with <TextField>.
      'src/common/components/fields/TextField.module.css': ['1.4'],
      'src/common/components/chat/ChatBody.module.css': ['1.35'],
      'src/common/components/page-header/ChatButton.module.css': ['1.1rem'],
      'src/common/components/club/ClubGameCard.module.css': ['1.2', '1.25'],
      'src/common/components/club/ClubGameRow.module.css': ['1.2', '1.25'],
      'src/common/components/club/EditClubModal.module.css': ['1.25'],
      'src/common/components/club/StartGameRow.module.css': ['1.2', '1.25'],
      'src/common/components/definitions/DefinitionView.module.css': ['1.45'],
      'src/common/components/feedback/GenericFeedbackPill.module.css': ['1'],
      'src/common/components/setup/SetupNextPuzzleSection.module.css': ['1.4'],
      'src/common/components/game/CelebrationBlockingModal.module.css': ['1'],
      'src/common/components/game/DeviceBlockNotice.module.css': ['1.5'],
      'src/common/components/game/lists/historyViewer.module.css': ['1'],
      'src/common/components/game/PlayArea.module.css': ['1.1'],
      'src/common/components/game/Stats.module.css': ['1.2'],
      'src/common/components/palette/PalettePage.module.css': ['1.35'],
      'src/common/components/floating-panels/GameScratchpadCompanion.module.css': ['1.5'],
      'src/common/components/menu/Menu.module.css': ['1'],
      'src/common/components/toasts/Toast.module.css': ['1.35', '1'],
      'src/common/components/tooltips/TooltipHost.module.css': ['1.2'],
      'src/common/patterns/badge.css': ['1.4'],
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
      'src/common/components/buttons/ShuffleButton.module.css': ['0.45'],
      'src/common/components/definitions/AnagramDialog.module.css': ['0.6'],
      'src/common/components/definitions/WordEditDialog.module.css': ['0.6'],
      'src/common/components/feedback/GenericFeedbackPill.module.css': ['0.7'],
      'src/common/components/fields/SelectField.module.css': ['0.55'],
      'src/common/components/setup/SetupTimerSection.module.css': ['0.5'],
      'src/common/components/game/entry/GuessKeyboard.module.css': ['0.6'],
      'src/common/components/game/FilterSelect.module.css': ['0.7'],
      'src/common/components/game/OpponentStrip.module.css': ['0.5'],
      'src/common/components/menu/Menu.module.css': ['0.45'],
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
      'src/common/components/fields/ManualBoardField.module.css': ['0.2em'],
      'src/common/components/club/EditClubModal.module.css': ['0.03em'],
      'src/common/components/definitions/DefinitionView.module.css': ['0.01em'],
      'src/common/components/game/entry/EntryBox.module.css': ['0.05em'],
      'src/common/components/game/lists/WordList.module.css': ['0.02em'],
      'src/common/components/game/OpponentStrip.module.css': ['0.04em'],
      'src/common/components/game/PlayArea.module.css': ['0.03em'],
      'src/common/components/game/RankBar.module.css': ['0.04em'],
      'src/common/components/game/Stats.module.css': ['0.06em'],
      'src/common/components/palette/PalettePage.module.css': ['0.03em'],
    },
    fix:
      'Use `--letter-spacing-label` (a small uppercase label) or `-wide` ' +
      '(letters presented as objects rather than as a word). Prose takes ' +
      'neither — it takes `normal`.',
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
      'src/common/components/buttons/ShuffleButton.module.css': ['120ms'],
      'src/common/components/club/ClubGameDeleteButton.module.css': ['120ms', '160ms'],
      'src/common/components/game/entry/GuessKeyboard.module.css': ['80ms'],
      'src/common/components/game/InfoSheet.module.css': ['160ms'],
      'src/common/components/game/PlayArea.module.css': ['80ms'],
      'src/common/components/game/RankBar.module.css': ['80ms'],
      'src/common/components/menu/Menu.module.css': ['100ms', '80ms'],
      'src/common/patterns/segmented.css': ['100ms'],
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
      'src/common/base.css': ['1px'],
      'src/common/components/account/ColorChoiceList.module.css': ['1px'],
      'src/common/components/buttons/ShuffleButton.module.css': ['1px'],
      'src/common/components/chat/ChatBody.module.css': ['1px'],
      'src/common/components/club/clubFilters.module.css': ['1px'],
      'src/common/components/club/EditClubModal.module.css': ['1px'],
      'src/common/components/definitions/AnagramDialog.module.css': ['1px'],
      'src/common/components/definitions/DefinitionPopover.module.css': ['1px'],
      'src/common/components/feedback/GenericFeedbackPill.module.css': ['2px', '0.4rem'],
      'src/common/components/fields/SelectField.module.css': ['1px'],
      'src/common/components/game/DeviceBlockNotice.module.css': ['1px'],
      'src/common/components/game/entry/GuessKeyboard.module.css': ['1px'],
      'src/common/components/game/FilterSelect.module.css': ['1px'],
      'src/common/components/game/gridCursor.module.css': ['1px', '5px'],
      'src/common/components/game/infoPanel.module.css': ['2px'],
      'src/common/components/game/lists/historyViewer.module.css': ['2px'],
      'src/common/components/game/lists/TurnLog.module.css': ['1px'],
      'src/common/components/game/PauseOverlay.module.css': ['1px'],
      'src/common/components/game/PlayArea.module.css': ['1px'],
      'src/common/components/game/RankBar.module.css': ['2px', '3px'],
      'src/common/components/game/Stats.module.css': ['1px'],
      'src/common/components/palette/PalettePage.module.css': ['1px'],
      'src/common/components/floating-panels/GameScratchpadCompanion.module.css': ['1px'],
      'src/common/components/menu/Menu.module.css': ['1px'],
      'src/common/components/setup/SetupSection.module.css': ['1px'],
      'src/common/components/text/Dot.module.css': ['1px'],
      'src/common/components/toasts/Toast.module.css': ['1px', '4px'],
      'src/common/patterns/badge.css': ['1px'],
            'src/common/patterns/segmented.css': ['1px'],
      'src/common/utilities.css': ['1px'],
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
    // there: everything local today is ≤ 10 and everything page-level is
    // ≥ 40, which is what makes a number the honest test. If something ever
    // needs 11 locally, that is the conversation, not a quiet edit here.
    allowed: /^([0-9]|10|auto|inherit|initial|unset|revert)$/,
    root: '.',
    pending: {
      // All three are recorded decisions, not oversights — plans/css-system-2.md
      // §7 → Carried forward names the area that owns each.
      'src/bananagrams/components/PlayerBoard.module.css': ['1000'], // drag ghost → shared-game-chrome
      'src/scrabble/components/ScrabbleBlankPickerBlockingModal.module.css': ['50'], //      overlay    → the scrabble area
      'src/scrabble/components/BoardCol.module.css': ['100'], //        drag ghost → shared-game-chrome
    },
    fix:
      'Page-level layers read a token from base.css → THE Z- LAYERS, which is ' +
      'the ladder being migrated to (`--z-companion`, `--z-modal-normal`, …); ' +
      'the `--z-index-*` block above it is the one being retired, a rung at a ' +
      'time, as each component\'s area is audited. A tier on neither is a ' +
      'question for Joel: inventing a number between two named ones is how a ' +
      'menu ends up behind a backdrop.',
  },
]

describe('a converted surface writes vocabulary values, not literals', () => {
  for (const v of VOCABULARIES) {
    it(`${v.name}: every converted file uses the vocabulary`, () => {
      const offenders: string[] = []
      /** What each file actually writes today, for the shrink arms below. */
      const found = new Map<string, Set<string>>()

      for (const f of walk(join(SRC, v.root ?? 'common'))) {
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
 * typed `string` so a call site passes `var(--z-index-chatPanel)`; this is
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
        'the token instead — zIndex="var(--z-index-chatPanel)".\n' +
        offenders.join('\n'),
    ).toEqual([])
  })
})
