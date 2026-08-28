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
 * Read off the FIELD BOXES — `<Field>` stamps each one `data-field` — not off
 * the controls inside them. A field is one setting however many inputs it
 * draws: `guesses` is four radios and `player_user_ids` is a checkbox per
 * member, and counting controls would make the first appear four times and the
 * second depend on how many friends are in the test's club.
 *
 * So the composed names are gone, and both of them were parts rather than
 * settings: `player_user_ids.<uuid>` is one checkbox per friend in the club,
 * and `timer.seconds` is the MM:SS box that lives inside the timer's own radio
 * row. Neither is a thing a game offers; `player_user_ids` and `timer` are, and
 * each now appears exactly once however many controls it draws.
 *
 * A test that needs one of those parts still finds it by `name` — that is what
 * the name is for. This list answers a narrower question: which SETTINGS does
 * this game put in front of you.
 */
export function fieldNames(container: HTMLElement): string[] {
  const seen = Array.from(container.querySelectorAll('[data-field]')).map(
    (el) => el.getAttribute('data-field')!,
  )
  return [...new Set(seen)]
}
