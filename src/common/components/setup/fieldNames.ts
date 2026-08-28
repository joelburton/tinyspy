// cs-unmet

/**
 * WHAT A SETUP FORM OFFERS — every control's `name`, in the order they appear.
 *
 * The spine of each game's setup test. A game's body is a list of settings, and
 * the list itself is worth pinning: a field silently dropped is a setting the
 * friends can no longer choose, and nothing else would fail. The expected list
 * in each test is a deliberate second statement of what the JSX says — which is
 * exactly what makes an accidental change loud.
 *
 * It also tests the conditionals for free, because revealing a field CHANGES
 * the inventory: scrabble's Skill appears when there is an AI to be skilled,
 * and the first-player picker when co-op is played in turns.
 *
 * DISTINCT names, in first-appearance order. A radio group is one field wearing
 * one name across several inputs — `guesses` is four `<input type="radio">`s —
 * and listing it four times would be counting controls, which is not what a
 * setup form is a list of.
 *
 * Composed names stay as written: a group's `player_user_ids.<uuid>`, the
 * countdown's `timer.seconds`. Collapsing those to their stem would hide the
 * difference between a field and its parts, and the second one is a real
 * control a test needs to find.
 */
export function fieldNames(container: HTMLElement): string[] {
  const seen = Array.from(container.querySelectorAll('[name], [data-field]')).map(
    (el) => el.getAttribute('name') ?? el.getAttribute('data-field')!,
  )
  return [...new Set(seen)]
}
