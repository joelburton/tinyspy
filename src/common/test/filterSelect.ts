import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * Test helpers for driving a `<FilterSelect>` — the in-game info-panel filters
 * (the word list's KIND/WHO, the turn log's whose-moves picker).
 *
 * These used to be native `<select>`s, so tests reached for `getByRole
 * ('combobox')` + `selectOptions(…, value)`. FilterSelect is a button plus a
 * popover instead (it must never take focus — see FilterSelect.tsx), which
 * changes two things every caller has to cope with:
 *
 *   - **options only exist while the picker is open**, so reading them is
 *     async and has to open it first;
 *   - **there are no values in the DOM**, only labels — so you pick by the
 *     visible label, not by the option's value.
 *
 * Shared here rather than re-derived per file because seven test files drive
 * these pickers, and "find the trigger among the buttons" is exactly the kind
 * of detail that drifts into seven slightly different versions.
 *
 * The trigger is identified by `aria-expanded`, which only it carries — that's
 * what separates it from the option buttons once a list is open.
 */

/** Every FilterSelect trigger on screen, in DOM order. */
export const filterTriggers = (): HTMLElement[] =>
  screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-expanded'))

/** Open picker `i` (default: the only one) if it isn't already open. */
export async function openFilter(i = 0): Promise<void> {
  const t = filterTriggers()[i]
  if (!t) throw new Error(`no FilterSelect at index ${i}`)
  if (t.getAttribute('aria-expanded') !== 'true') await userEvent.setup().click(t)
}

/** The buttons inside picker `i`'s popover. Assumes it's open. */
function optionsIn(i: number): HTMLElement[] {
  const root = filterTriggers()[i]?.parentElement
  if (!root) throw new Error(`no FilterSelect at index ${i}`)
  return Array.from(root.querySelectorAll('button')).filter(
    (b) => !b.hasAttribute('aria-expanded'),
  )
}

/** The option LABELS of picker `i`, opening it if needed. */
export async function filterOptions(i = 0): Promise<(string | null)[]> {
  await openFilter(i)
  return optionsIn(i).map((b) => b.textContent)
}

/** Open picker `i` and choose the option with this visible label. */
export async function pickFilter(label: string, i = 0): Promise<void> {
  await openFilter(i)
  const option = optionsIn(i).find((b) => b.textContent === label)
  if (!option) {
    throw new Error(
      `no option "${label}" in FilterSelect ${i}; offered: ${optionsIn(i)
        .map((b) => b.textContent)
        .join(', ')}`,
    )
  }
  await userEvent.setup().click(option)
}

/** The label currently shown on picker `i`'s trigger. */
export const filterValue = (i = 0): string => filterTriggers()[i]?.textContent ?? ''
